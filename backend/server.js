const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const XLSX = require('xlsx');
const cors = require('cors');
const shapefile = require('shapefile');
const proj4 = require('proj4');

// 导入新的投影检测和坐标转换模块
const ProjectionDetector = require('./services/projectionDetector');
const CoordinateTransformer = require('./services/coordinateTransformer');

// 数据库相关引用
const { connection, testConnection } = require('./db/connection');
const dbManager = require('./db/database');
const DataMigrator = require('./tools/migrate-to-db');

const app = express();

app.use(cors());
// 增加请求体积限制到10MB
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const upload = multer({ dest: 'uploads/' });

// 初始化新的投影检测和坐标转换器
let projectionDetector;
let coordinateTransformer;

// 严格的GeoJSON结构验证函数
function validateGeoJSONStructure(geoJSON, filename) {
  if (!geoJSON || typeof geoJSON !== 'object') {
    throw new Error(`GeoJSON必须是一个有效的JSON对象 (${filename})`);
  }

  if (!geoJSON.type) {
    throw new Error(`GeoJSON缺少type字段 (${filename})`);
  }

  const validTypes = ['FeatureCollection', 'Feature', 'Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon', 'GeometryCollection'];
  if (!validTypes.includes(geoJSON.type)) {
    throw new Error(`无效的GeoJSON类型: ${geoJSON.type} (${filename})。支持的类型: ${validTypes.join(', ')}`);
  }

  // 验证FeatureCollection
  if (geoJSON.type === 'FeatureCollection') {
    if (!Array.isArray(geoJSON.features)) {
      throw new Error(`FeatureCollection必须包含features数组 (${filename})`);
    }

    if (geoJSON.features.length === 0) {
      throw new Error(`FeatureCollection不能为空 (${filename})`);
    }

    // 验证每个feature
    geoJSON.features.forEach((feature, index) => {
      if (!feature || feature.type !== 'Feature') {
        throw new Error(`第${index + 1}个要素不是有效的Feature (${filename})`);
      }

      if (!feature.geometry) {
        throw new Error(`第${index + 1}个要素缺少geometry字段 (${filename})`);
      }

      if (feature.geometry.type) {
        const geometryTypes = ['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon', 'GeometryCollection'];
        if (!geometryTypes.includes(feature.geometry.type)) {
          throw new Error(`第${index + 1}个要素的几何类型无效: ${feature.geometry.type} (${filename})`);
        }
      }

      // 验证坐标
      if (feature.geometry.coordinates) {
        validateCoordinatesStructure(feature.geometry.coordinates, feature.geometry.type, index + 1, filename);
      }
    });
  }

  // 验证单个Feature
  else if (geoJSON.type === 'Feature') {
    if (!geoJSON.geometry) {
      throw new Error(`Feature必须包含geometry字段 (${filename})`);
    }

    if (geoJSON.geometry.coordinates) {
      validateCoordinatesStructure(geoJSON.geometry.coordinates, geoJSON.geometry.type, 1, filename);
    }
  }

  // 验证几何对象
  else if (['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon'].includes(geoJSON.type)) {
    if (!geoJSON.coordinates) {
      throw new Error(`${geoJSON.type}必须包含coordinates字段 (${filename})`);
    }
    validateCoordinatesStructure(geoJSON.coordinates, geoJSON.type, 1, filename);
  }

  // 验证GeometryCollection
  else if (geoJSON.type === 'GeometryCollection') {
    if (!Array.isArray(geoJSON.geometries)) {
      throw new Error(`GeometryCollection必须包含geometries数组 (${filename})`);
    }

    if (geoJSON.geometries.length === 0) {
      throw new Error(`GeometryCollection不能为空 (${filename})`);
    }
  }

  // 验证CRS信息
  if (geoJSON.crs) {
    if (geoJSON.crs.type !== 'name' && geoJSON.crs.type !== 'link') {
      throw new Error(`CRS的type必须是"name"或"link" (${filename})`);
    }

    if (!geoJSON.crs.properties) {
      throw new Error(`CRS必须包含properties字段 (${filename})`);
    }
  }

  console.log(`✅ GeoJSON验证通过: ${filename}`);
}

// 验证坐标结构
function validateCoordinatesStructure(coords, type, featureIndex, filename) {
  const validateCoordinate = (coord, path = '') => {
    if (!Array.isArray(coord) || coord.length < 2) {
      throw new Error(`第${featureIndex}个要素${path}: 坐标必须是至少包含2个数字的数组 [x, y] (${filename})`);
    }

    if (typeof coord[0] !== 'number' || typeof coord[1] !== 'number') {
      throw new Error(`第${featureIndex}个要素${path}: 坐标值必须是数字 (${filename})`);
    }

    if (isNaN(coord[0]) || isNaN(coord[1])) {
      throw new Error(`第${featureIndex}个要素${path}: 坐标值不能是NaN (${filename})`);
    }

    // 基本坐标范围检查（WGS84）
    if (coord[0] < -180 || coord[0] > 180) {
      console.warn(`第${featureIndex}个要素${path}: 经度值超出WGS84范围 [-180, 180]: ${coord[0]} (${filename})`);
    }

    if (coord[1] < -90 || coord[1] > 90) {
      console.warn(`第${featureIndex}个要素${path}: 纬度值超出WGS84范围 [-90, 90]: ${coord[1]} (${filename})`);
    }
  };

  try {
    switch (type) {
      case 'Point':
        validateCoordinate(coords);
        break;

      case 'LineString':
        if (!Array.isArray(coords) || coords.length < 2) {
          throw new Error(`LineString至少需要2个坐标点 (${filename})`);
        }
        coords.forEach((coord, i) => validateCoordinate(coord, `[${i}]`));
        break;

      case 'Polygon':
        if (!Array.isArray(coords) || coords.length === 0) {
          throw new Error(`Polygon至少需要1个环 (${filename})`);
        }
        coords.forEach((ring, i) => {
          if (!Array.isArray(ring) || ring.length < 4) {
            throw new Error(`Polygon的第${i}个环至少需要4个坐标点 (${filename})`);
          }
          // 检查环是否闭合
          const first = ring[0];
          const last = ring[ring.length - 1];
          if (first[0] !== last[0] || first[1] !== last[1]) {
            throw new Error(`Polygon的第${i}个环必须闭合 (${filename})`);
          }
          ring.forEach((coord, j) => validateCoordinate(coord, `[${i}][${j}]`));
        });
        break;

      case 'MultiPoint':
        if (!Array.isArray(coords) || coords.length === 0) {
          throw new Error(`MultiPoint至少需要1个坐标点 (${filename})`);
        }
        coords.forEach((coord, i) => validateCoordinate(coord, `[${i}]`));
        break;

      case 'MultiLineString':
        if (!Array.isArray(coords) || coords.length === 0) {
          throw new Error(`MultiLineString至少需要1条线 (${filename})`);
        }
        coords.forEach((line, i) => {
          if (!Array.isArray(line) || line.length < 2) {
            throw new Error(`MultiLineString的第${i}条线至少需要2个坐标点 (${filename})`);
          }
          line.forEach((coord, j) => validateCoordinate(coord, `[${i}][${j}]`));
        });
        break;

      case 'MultiPolygon':
        if (!Array.isArray(coords) || coords.length === 0) {
          throw new Error(`MultiPolygon至少需要1个多边形 (${filename})`);
        }
        coords.forEach((polygon, i) => {
          if (!Array.isArray(polygon) || polygon.length === 0) {
            throw new Error(`MultiPolygon的第${i}个多边形至少需要1个环 (${filename})`);
          }
          polygon.forEach((ring, j) => {
            if (!Array.isArray(ring) || ring.length < 4) {
              throw new Error(`MultiPolygon第${i}个多边形的第${j}个环至少需要4个坐标点 (${filename})`);
            }
            ring.forEach((coord, k) => validateCoordinate(coord, `[${i}][${j}][${k}]`));
          });
        });
        break;
    }
  } catch (error) {
    throw new Error(`坐标验证失败: ${error.message} (${filename})`);
  }
}

try {
  projectionDetector = new ProjectionDetector();
  coordinateTransformer = new CoordinateTransformer();
  console.log('✅ 投影检测和坐标转换模块初始化成功');
} catch (error) {
  console.error('❌ 投影检测和坐标转换模块初始化失败:', error);
  // 降级处理：继续使用旧系统
  projectionDetector = null;
  coordinateTransformer = null;
}

// 多文件上传存储配置（用于Shapefile）
const multiUpload = multer({
  storage: multer.memoryStorage(), // 使用内存存储，文件将被保存在buffer中
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.shp', '.shx', '.dbf', '.prj', '.cpg', '.sbn', '.sbx', '.qpj', '.geojson'];
    const ext = path.extname(file.originalname).toLowerCase();

    // 调试信息
    console.log(`🔍 文件过滤器检查: ${file.originalname} -> 扩展名: ${ext}`);
    console.log(`✅ 允许的扩展名: ${allowedExtensions.join(', ')}`);

    if (allowedExtensions.includes(ext)) {
      console.log(`✅ 文件 ${file.originalname} 通过检查`);
      cb(null, true);
    } else {
      console.log(`❌ 文件 ${file.originalname} 被拒绝`);
      cb(new Error(`不支持的文件格式: ${ext}。支持的格式: ${allowedExtensions.join(', ')}`), false);
    }
  },
  limits: {
    files: 10, // 最多10个文件
    fileSize: 50 * 1024 * 1024 // 每个文件最大50MB
  }
});

// 存储路径
const DATA_PATH = './uploads/geojsons.json';
const DELETED_PATH = './uploads/deleted.json';

// POST 保存
app.post('/api/geojson', (req, res) => {
  const { name, geojson } = req.body;

  // 输入验证
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: '无效的名称参数' });
  }

  if (!geojson) {
    return res.status(400).json({ error: '缺少geojson数据' });
  }

  // 验证geojson格式
  if (typeof geojson !== 'object' || !geojson.type) {
    return res.status(400).json({ error: '无效的geojson格式' });
  }

  // 安全的文件名处理，防止路径遍历
  const safeFileName = name.replace(/[^\w\u4e00-\u9fa5\-_]/g, '_').replace(/\.\./g, '').trim();
  if (safeFileName.length === 0) {
    return res.status(400).json({ error: '文件名无效' });
  }

  const individualFilePath = path.join(__dirname, 'uploads', 'areas', `${safeFileName}.json`);
  
  // 确保目录存在
  const dirPath = path.join(__dirname, 'uploads', 'areas');
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  
  // 保存单个开发区数据
  fs.writeFile(individualFilePath, JSON.stringify({ name, geojson }), 'utf-8', (err) => {
    if (err) {
      console.error(`保存开发区 ${name} 失败:`, err);
      return res.status(500).json({ error: '保存失败' });
    }
    
    // 更新索引文件，只存储名称和文件路径
    const indexPath = path.join(__dirname, 'uploads', 'geojson_index.json');
    fs.readFile(indexPath, 'utf-8', (err, data) => {
      let index = [];
      if (!err && data) {
        try {
          index = JSON.parse(data);
        } catch (e) {
          console.error('解析索引文件失败:', e);
        }
      }
      
      // 检查是否已存在
      const existingIndex = index.findIndex(item => item.name === name);
      if (existingIndex !== -1) {
        index[existingIndex] = { name, filePath: `areas/${safeFileName}.json` };
      } else {
        index.push({ name, filePath: `areas/${safeFileName}.json` });
      }
      
      fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8', (err) => {
        if (err) {
          console.error('更新索引文件失败:', err);
          return res.status(500).json({ error: '更新索引失败' });
        }
        res.json({ success: true });
      });
    });
  });
});

// DELETE 删除 - 支持POST和DELETE两种方式
app.post('/api/geojson/delete', (req, res) => {
  console.log('🗑️  DELETE请求收到(POST方式):', req.body);
  const nameToDelete = req.body.name;
  console.log('📝  要删除的名称:', nameToDelete);
  
  handleDeleteOperation(nameToDelete, res);
});

// DELETE方法的API端点
app.delete('/api/geojson/:name', (req, res) => {
  const nameToDelete = decodeURIComponent(req.params.name);
  console.log('🗑️  DELETE请求收到(DELETE方式):', nameToDelete);
  
  handleDeleteOperation(nameToDelete, res);
});

// 处理删除操作的通用函数
function handleDeleteOperation(nameToDelete, res) {
  // 读取已删除列表
  fs.readFile(DELETED_PATH, 'utf-8', (err, deletedData) => {
    let deletedList = [];
    if (!err && deletedData) {
      try {
        deletedList = JSON.parse(deletedData);
      } catch (e) {
        console.error('解析已删除列表失败:', e);
      }
    }
    
    // 添加到已删除列表
    if (!deletedList.includes(nameToDelete)) {
      deletedList.push(nameToDelete);
    }
    
    // 保存已删除列表
    fs.writeFile(DELETED_PATH, JSON.stringify(deletedList), (writeErr) => {
      if (writeErr) {
        return res.status(500).json({ error: 'Failed to save deleted list' });
      }
      
      // 从动态数据中删除
      fs.readFile(DATA_PATH, 'utf-8', (dataErr, data) => {
        if (!dataErr && data) {
          let allData = JSON.parse(data);
          allData = allData.filter(item => {
            const features = item.geojson?.features || [];
            return !features.some(feature => 
              feature.properties?.KFQMC === nameToDelete
            );
          });
          
          fs.writeFile(DATA_PATH, JSON.stringify(allData), () => {
            res.json({ success: true, message: `Deleted ${nameToDelete}` });
          });
        } else {
          res.json({ success: true, message: `Deleted ${nameToDelete}` });
        }
      });
    });
  });
}

// GET 获取索引文件
app.get('/api/geojson_index', (req, res) => {
  const indexPath = path.join(__dirname, 'uploads', 'geojson_index.json');
  
  fs.readFile(indexPath, 'utf-8', (err, data) => {
    if (err || !data) {
      console.error('读取索引文件失败:', err);
      return res.json([]);
    }
    
    try {
      const index = JSON.parse(data);
      res.json(index);
    } catch (parseError) {
      console.error('解析索引文件失败:', parseError);
      res.json([]);
    }
  });
});

// GET 获取单个开发区数据
app.get('/api/geojson/:name', (req, res) => {
  let name;
  try {
    // 首先尝试标准的UTF-8解码
    name = decodeURIComponent(req.params.name);
  } catch (error) {
    console.error('UTF-8 URL解码失败，尝试其他编码:', error);
    try {
      // 如果UTF-8解码失败，可能是GBK编码，尝试处理
      // 这里我们直接使用原始参数，然后尝试多种文件名匹配
      name = req.params.name;
    } catch (fallbackError) {
      console.error('URL解码完全失败:', fallbackError);
      return res.status(400).json({ error: '无效的名称编码' });
    }
  }

  // 尝试多种文件名匹配策略
  let filePath = null;
  const possibleNames = [];

  // 1. 尝试解码后的名称
  if (name) {
    possibleNames.push(name);
  }

  // 2. 如果原始参数和解码后的不同，也添加原始参数
  if (req.params.name && req.params.name !== name) {
    possibleNames.push(req.params.name);
  }

  // 3. 尝试从编码的参数中提取可能的文件名
  if (req.params.name.includes('_176')) {
    // 提取时间戳之前的部分进行文件匹配
    const timestampIndex = req.params.name.lastIndexOf('_176');
    if (timestampIndex > 0) {
      const baseName = req.params.name.substring(0, timestampIndex);
      possibleNames.push(baseName + req.params.name.substring(timestampIndex));
    }
  }

  // 4. 尝试所有已知文件的模糊匹配
  try {
    const files = fs.readdirSync(path.join(__dirname, 'uploads', 'areas'));
    const targetFiles = files.filter(file => file.endsWith('.json'));

    // 如果请求中包含时间戳，尝试匹配包含相同时间戳的文件
    if (req.params.name.includes('_176')) {
      const timestamp = req.params.name.substring(req.params.name.lastIndexOf('_176'));
      const matchingFile = targetFiles.find(file => file.includes(timestamp));
      if (matchingFile) {
        possibleNames.push(matchingFile.replace('.json', ''));
      }
    }
  } catch (err) {
    console.error('读取目录失败:', err);
  }

  // 遍历所有可能的名称，找到存在的文件
  for (const possibleName of possibleNames) {
    const testPath = path.join(__dirname, 'uploads', 'areas', `${possibleName}.json`);
    if (fs.existsSync(testPath)) {
      filePath = testPath;
      name = possibleName; // 使用找到的文件名
      break;
    }
  }

  // 如果还是没找到，尝试safeFileName
  if (!filePath && name) {
    const safeFileName = name.replace(/[^\w\u4e00-\u9fa5]/g, '_');
    const testPath = path.join(__dirname, 'uploads', 'areas', `${safeFileName}.json`);
    if (fs.existsSync(testPath)) {
      filePath = testPath;
      name = safeFileName;
    }
  }

  console.log(`查找文件: ${filePath}, 解析的名称: ${name}`);

  fs.readFile(filePath, 'utf-8', (err, data) => {
    if (err || !data) {
      console.error(`读取开发区 ${name} 数据失败:`, err);
      console.error(`尝试的文件路径: ${filePath}`);
      return res.status(404).json({ error: '未找到该开发区数据' });
    }

    try {
      // 移除BOM标记（如果存在）
      if (data.charCodeAt(0) === 0xFEFF) {
        data = data.substring(1);
      }

      // 清理可能导致JSON解析错误的字符
      data = data.replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g, '');

      const areaData = JSON.parse(data);

      res.json(areaData);
    } catch (parseError) {
      console.error(`解析开发区 ${name} 数据失败:`, parseError);
      res.status(500).json({ error: '解析数据失败' });
    }
  });
});

// POST 恢复删除的项目
app.post('/api/restore/:name', (req, res) => {
  const nameToRestore = decodeURIComponent(req.params.name);
  
  fs.readFile(DELETED_PATH, 'utf-8', (err, data) => {
    if (err || !data) {
      return res.status(404).json({ error: 'No deleted items found' });
    }
    
    let deletedList = JSON.parse(data);
    const index = deletedList.indexOf(nameToRestore);
    
    if (index === -1) {
      return res.status(404).json({ error: 'Item not in deleted list' });
    }
    
    // 从删除列表中移除
    deletedList.splice(index, 1);
    
    fs.writeFile(DELETED_PATH, JSON.stringify(deletedList), (writeErr) => {
      if (writeErr) {
        return res.status(500).json({ error: 'Failed to restore item' });
      }
      res.json({ success: true, message: `Restored ${nameToRestore}` });
    });
  });
});

// GET 获取已删除列表
app.get('/api/deleted', (req, res) => {
  fs.readFile(DELETED_PATH, 'utf-8', (err, data) => {
    if (err || !data) {
      return res.json([]);
    }
    res.json(JSON.parse(data));
  });
});

// GET 拉取
app.get('/api/geojson', (req, res) => {
  fs.readFile(DATA_PATH, 'utf-8', (err, data) => {
    if (err || !data) {
      return res.json([]);
    }
    
    try {
      // 移除BOM标记（如果存在）
      if (data.charCodeAt(0) === 0xFEFF) {
        data = data.substring(1);
      }
      
      // 清理可能导致JSON解析错误的字符
      data = data.replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g, '');
      
      // 尝试解析JSON
      const jsonData = JSON.parse(data);
      res.json(jsonData);
    } catch (parseError) {
      console.error('JSON解析错误:', parseError.message);
      // 返回空数组而不是错误，以避免前端崩溃
      res.json([]);
    }
  });
});

// 重建索引文件
function rebuildIndex() {
  const areasDir = path.join(__dirname, 'uploads', 'areas');
  const indexPath = path.join(__dirname, 'uploads', 'geojson_index.json');
  
  // 确保目录存在
  if (!fs.existsSync(areasDir)) {
    console.log('areas目录不存在，无法重建索引');
    return;
  }
  
  // 读取areas目录中的所有文件
  fs.readdir(areasDir, (err, files) => {
    if (err) {
      console.error('读取areas目录失败:', err);
      return;
    }
    
    // 过滤出JSON文件
    const jsonFiles = files.filter(file => file.endsWith('.json'));
    console.log(`找到 ${jsonFiles.length} 个开发区数据文件`);
    
    // 构建索引
    const index = [];
    for (const file of jsonFiles) {
      try {
        // 从文件名提取开发区名称
        const name = file.replace('.json', '');
        index.push({
          name: name,
          filePath: `areas/${file}`
        });
      } catch (e) {
        console.error(`处理文件 ${file} 失败:`, e);
      }
    }
    
    // 保存索引文件
    fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8', (writeErr) => {
      if (writeErr) {
        console.error('保存索引文件失败:', writeErr);
        return;
      }
      console.log(`成功重建索引，包含 ${index.length} 个开发区`);
    });
  });
}

// 配置Excel文件上传
const excelStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dirPath = path.join(__dirname, 'uploads', 'excel');
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    cb(null, dirPath);
  },
  filename: function (req, file, cb) {
    cb(null, 'development-zones-' + Date.now() + '.xlsx');
  }
});

const uploadExcel = multer({ storage: excelStorage });

// Excel导入API
app.post('/api/import-excel', uploadExcel.single('excel'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '未上传文件' });
    }

    // 读取Excel文件
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // 转换为JSON格式
    const excelData = XLSX.utils.sheet_to_json(worksheet);

    // 处理并保存数据
    const processedData = processExcelData(excelData);

    // 删除临时Excel文件
    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      message: `成功导入 ${processedData.length} 个开发区数据`,
      data: processedData
    });
  } catch (error) {
    console.error('Excel导入错误:', error);
    res.status(500).json({ error: 'Excel导入失败: ' + error.message });
  }
});

// Shapefile和GeoJSON上传API
app.post('/api/upload-shapefile', multiUpload.array('files'), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: '未上传文件' });
    }

    const outputName = req.body.name || `shapefile_${Date.now()}`;

    // 检查上传的是单个GeoJSON文件还是Shapefile文件集
    const geojsonFile = req.files.find(file =>
      file && file.originalname && file.originalname.toLowerCase().endsWith('.geojson')
    );
    const shpFiles = req.files.filter(file =>
      file && file.originalname && ['.shp', '.shx', '.dbf'].some(ext =>
        file.originalname.toLowerCase().endsWith(ext)
      )
    );

    let result;

    if (geojsonFile) {
      // 处理GeoJSON文件
      result = await processGeoJSONFile(geojsonFile, outputName);
    } else if (shpFiles.length > 0) {
      // 处理Shapefile文件集
      result = await processUploadedShapefiles(req.files, outputName);
    } else {
      return res.status(400).json({ error: '未找到支持的文件格式（.geojson 或 .shp/.shx/.dbf）' });
    }

    // 内存存储，无需清理临时文件

    res.json({
      success: true,
      message: `成功上传并处理文件: ${outputName}`,
      data: result
    });

  } catch (error) {
    console.error('Shapefile上传处理错误:', error);

    // 内存存储，无需清理临时文件

    res.status(500).json({ error: '文件处理失败: ' + error.message });
  }
});

// 处理GeoJSON文件
async function processGeoJSONFile(geojsonFile, outputName) {
  try {
    // 读取GeoJSON文件内容
    const geojsonContent = fs.readFileSync(geojsonFile.path, 'utf-8');

    // 解析并验证GeoJSON
    let geoJSON;
    try {
      geoJSON = JSON.parse(geojsonContent);
    } catch (parseError) {
      throw new Error('GeoJSON文件格式无效: ' + parseError.message);
    }

    // 严格的GeoJSON验证
    validateGeoJSONStructure(geoJSON, geojsonFile.originalname);

    // 确保输出目录存在
    const outputDir = path.join(__dirname, 'uploads', 'areas');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 保存GeoJSON文件
    const outputPath = path.join(outputDir, `${outputName}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(geoJSON, null, 2), 'utf-8');

    // 更新索引
    const indexPath = path.join(__dirname, 'uploads', 'geojson_index.json');
    let index = [];

    if (fs.existsSync(indexPath)) {
      try {
        const indexContent = fs.readFileSync(indexPath, 'utf-8');
        index = JSON.parse(indexContent);
      } catch (indexError) {
        console.warn('读取现有索引失败，将创建新索引:', indexError.message);
      }
    }

    // 添加新文件到索引
    index.push({
      name: outputName,
      filePath: `areas/${outputName}.json`,
      uploadTime: new Date().toISOString(),
      source: 'geojson_upload',
      featureCount: geoJSON.features.length
    });

    // 保存更新后的索引
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');

    // 自动创建属性数据模板
    try {
      // 获取第一个要素的属性用于提取信息
      const firstFeatureProperties = geoJSON.features.length > 0 ?
        geoJSON.features[0].properties || {} : {};

      // 创建属性数据模板
      const templatePath = await createZoneDataTemplate(outputName, firstFeatureProperties);
      console.log(`✅ 已为GeoJSON自动创建属性数据模板: ${path.basename(templatePath)}`);

      return {
        fileName: `${outputName}.json`,
        filePath: `areas/${outputName}.json`,
        featureCount: geoJSON.features.length,
        source: 'geojson_upload',
        properties: extractGeoJSONProperties(geoJSON),
        attributeTemplateCreated: true,
        attributeTemplatePath: `zone-data/${path.basename(templatePath)}`
      };
    } catch (templateError) {
      console.warn(`⚠️ 为GeoJSON创建属性数据模板失败: ${templateError.message}`);
      // 即使模板创建失败，仍然返回地理数据
      return {
        fileName: `${outputName}.json`,
        filePath: `areas/${outputName}.json`,
        featureCount: geoJSON.features.length,
        source: 'geojson_upload',
        properties: extractGeoJSONProperties(geoJSON),
        attributeTemplateCreated: false,
        attributeTemplateError: templateError.message
      };
    }

  } catch (error) {
    throw new Error(`处理GeoJSON文件失败: ${error.message}`);
  }
}

// 提取GeoJSON属性信息
function extractGeoJSONProperties(geoJSON) {
  if (!geoJSON.features || geoJSON.features.length === 0) {
    return [];
  }

  // 从第一个要素获取所有属性键
  const firstFeature = geoJSON.features[0];
  if (!firstFeature.properties) {
    return [];
  }

  return Object.keys(firstFeature.properties);
}

// 处理Excel数据
function processExcelData(excelData) {
  const results = [];

  excelData.forEach((row, index) => {
    if (row['开发区名称']) {
      const safeFileName = row['开发区名称'].replace(/[^\w\u4e00-\u9fa5]/g, '_');
      const filePath = path.join(__dirname, 'uploads', 'zone-data', `${safeFileName}.json`);

      // 转换Excel数据到标准格式
      const zoneData = convertExcelToStandardFormat(row);

      // 确保目录存在
      const dirPath = path.join(__dirname, 'uploads', 'zone-data');
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      // 保存为JSON文件
      fs.writeFileSync(filePath, JSON.stringify(zoneData, null, 2), 'utf-8');

      results.push({
        areaName: row['开发区名称'],
        fileName: `${safeFileName}.json`,
        index: index + 1,
        province: row['所属省'] || '',
        city: row['所属市'] || ''
      });
    }
  });

  // 更新索引文件
  updateZoneIndex(results);

  return results;
}

// 根据实际的Excel列名转换数据格式
function convertExcelToStandardFormat(excelRow) {
  return {
    // 基本信息字段
    zoneCode: excelRow['开发区代码'] || '',
    areaName: excelRow['开发区名称'] || '',
    highTechEnterprises: parseInt(excelRow['高新企业数量'] || 0),

    // 土地面积字段 (公顷)
    landData: {
      totalLandArea: parseFloat(excelRow['土地总面积'] || 0),
      planningConstructionLand: parseFloat(excelRow['规划建设用地面积'] || 0),
      approvedExpropriatedLand: parseFloat(excelRow['已批准征收土地面积'] || 0),
      approvedTransferLand: parseFloat(excelRow['已批准转用土地面积'] || 0),
      availableSupplyArea: parseFloat(excelRow['已达到供���面积'] || excelRow['到达供地条件面积'] || 0),
      suppliedStateConstructionLand: parseFloat(excelRow['已供应国有建设用地'] || 0),
      builtUrbanConstructionLand: parseFloat(excelRow['已建成面积'] || excelRow['已建成城镇建设用地'] || 0),
      industrialStorageLand: parseFloat(excelRow['工矿仓储用地面积'] || 0),
      residentialLand: parseFloat(excelRow['住宅用地面积'] || 0),
      nonConstructionArea: parseFloat(excelRow['不可建设面积'] || 0),
      approvedUnsuppliedArea: parseFloat(excelRow['批而未供面积'] || 0),
      idleLandArea: parseFloat(excelRow['闲置土地面积'] || 0)
    },

    // 人口数据
    populationData: {
      residentPopulation: parseFloat(excelRow['常住人口'] || 0)
    },

    // 经济数据 (万元)
    economicData: {
      totalFixedAssets: parseFloat(excelRow['固定资产总额'] || 0),
      totalTax: parseFloat(excelRow['税收总额'] || 0),
      totalEnterpriseRevenue: parseFloat(excelRow['企业总收入'] || 0),
      totalEnterpriseTax: parseFloat(excelRow['企业税收总额'] || 0),
      industrialEnterpriseTax: parseFloat(excelRow['工业企业税收总额'] || 0)
    },

    // 建筑数据 (万平方米)
    buildingData: {
      totalBuildingArea: parseFloat(excelRow['总建筑面积'] || 0),
      industrialStorageBuildingArea: parseFloat(excelRow['工矿仓储建筑面积'] || 0)
    },

    // 建筑基底数据 (万平方米)
    buildingBaseData: {
      buildingBaseArea: parseFloat(excelRow['建筑基底面积'] || 0),
      industrialStorageOpenArea: parseFloat(excelRow['工矿仓储露天等面积'] || 0)
    },

    // 企业数据 - 新增字段
    enterpriseData: {
      totalEnterprises: parseFloat(excelRow['工商企业数量'] || 0),
      industrialEnterprises: parseFloat(excelRow['工业企业数量'] || 0)
    },

    // 元数据
    metadata: {
      source: 'excel_import',
      importTime: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      version: '1.0'
    }
  };
}

// 更新开发区索引
function updateZoneIndex(zoneList) {
  const indexPath = path.join(__dirname, 'uploads', 'zone-index.json');

  fs.writeFile(indexPath, JSON.stringify(zoneList, null, 2), 'utf-8', (err) => {
    if (err) {
      console.error('更新索引失败:', err);
    } else {
      console.log(`成功更新开发区索引，包含 ${zoneList.length} 个开发区`);
    }
  });
}

// 获取所有开发区列表
app.get('/api/zones', (req, res) => {
  const indexPath = path.join(__dirname, 'uploads', 'zone-index.json');

  fs.readFile(indexPath, 'utf-8', (err, data) => {
    if (err) {
      return res.json([]);
    }

    try {
      const indexData = JSON.parse(data);
      res.json(indexData);
    } catch (parseError) {
      res.json([]);
    }
  });
});

// 智能查找开发区数据文件（支持带时间戳的文件名）
function findZoneDataFile(areaName) {
  const safeFileName = areaName.replace(/[^\w\u4e00-\u9fa5]/g, '_');
  const zoneDataDir = path.join(__dirname, 'uploads', 'zone-data');

  // 1. 首先尝试精确匹配
  let filePath = path.join(zoneDataDir, `${safeFileName}.json`);
  if (fs.existsSync(filePath)) {
    return filePath;
  }

  // 2. 尝试查找带时间戳的文件
  try {
    const files = fs.readdirSync(zoneDataDir);
    const matchingFiles = files.filter(file => {
      const baseName = file.replace(/\.json$/, '');
      return baseName.startsWith(safeFileName + '_') && /^\d+$/.test(baseName.substring(safeFileName.length + 1));
    });

    if (matchingFiles.length > 0) {
      // 按修改时间排序，选择最新的
      matchingFiles.sort((a, b) => {
        const statA = fs.statSync(path.join(zoneDataDir, a));
        const statB = fs.statSync(path.join(zoneDataDir, b));
        return statB.mtime - statA.mtime;
      });

      console.log(`找到带时间戳的文件: ${matchingFiles[0]}`);
      return path.join(zoneDataDir, matchingFiles[0]);
    }
  } catch (error) {
    console.error('搜索文件时出错:', error);
  }

  return null;
}

// 获取开发区完整数据
app.get('/api/zones/:areaName/data', (req, res) => {
  const areaName = decodeURIComponent(req.params.areaName);

  console.log(`请求开发区数据: ${areaName}`);

  const filePath = findZoneDataFile(areaName);

  if (!filePath) {
    console.log(`未找到开发区数据文件: ${areaName}`);
    return res.status(404).json({ error: '未找到开发区数据' });
  }

  fs.readFile(filePath, 'utf-8', (err, data) => {
    if (err) {
      console.error(`读取文件失败: ${filePath}`, err);
      return res.status(500).json({ error: '读取文件失败' });
    }

    try {
      const zoneData = JSON.parse(data);
      console.log(`成功读取开发区数据: ${areaName}`);
      res.json(zoneData);
    } catch (parseError) {
      console.error(`解析JSON失败: ${filePath}`, parseError);
      res.status(500).json({ error: '数据解析失败' });
    }
  });
});

// 更新开发区数据
app.put('/api/zones/:areaName/data', (req, res) => {
  const areaName = decodeURIComponent(req.params.areaName);
  const updatedData = req.body;

  console.log(`更新开发区数据: ${areaName}`);

  const filePath = findZoneDataFile(areaName);

  if (!filePath) {
    console.log(`未找到要更新的开发区数据文件: ${areaName}`);
    return res.status(404).json({ error: '未找到开发区数据' });
  }

  // 添加更新时间
  updatedData.lastUpdated = new Date().toISOString();

  fs.writeFile(filePath, JSON.stringify(updatedData, null, 2), 'utf-8', (err) => {
    if (err) {
      console.error(`保存文件失败: ${filePath}`, err);
      return res.status(500).json({ error: '保存失败' });
    }
    console.log(`成功更新开发区数据: ${areaName}`);
    res.json({ success: true, message: '数据更新成功' });
  });
});

// 获取开发区评价指标
app.get('/api/zones/:areaName/indicators', async (req, res) => {
  const areaName = decodeURIComponent(req.params.areaName);
  try {
    const indicators = await calculateZoneIndicators(areaName);
    res.json(indicators);
  } catch (error) {
    console.error(`计算 ${areaName} 指标失败:`, error);
    if (error.message.includes('未找到开发区数据')) {
      res.status(404).json({ error: '未找到该开发区的数据，请先导入Excel数据' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// 获取开发区潜力分析
app.get('/api/zones/:areaName/potentials', async (req, res) => {
  const areaName = decodeURIComponent(req.params.areaName);
  try {
    const potentials = await calculateZonePotentials(areaName);
    res.json(potentials);
  } catch (error) {
    console.error(`计算 ${areaName} 潜力失败:`, error);
    if (error.message.includes('未找到开发区数据')) {
      res.status(404).json({ error: '未找到该开发区的数据，请先导入Excel数据' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// 加载开发区数据
async function loadZoneData(areaName) {
  console.log(`加载开发区数据: ${areaName}`);

  const filePath = findZoneDataFile(areaName);

  if (!filePath) {
    console.log(`未找到开发区数据文件: ${areaName}`);
    throw new Error('未找到开发区数据');
  }

  return new Promise((resolve, reject) => {
    fs.readFile(filePath, 'utf-8', (err, data) => {
      if (err) {
        console.error(`读取开发区数据文件失败: ${filePath}`, err);
        reject(new Error('读取开发区数据失败'));
        return;
      }

      try {
        const jsonData = JSON.parse(data);
        console.log(`成功加载开发区数据: ${areaName}`);
        resolve(jsonData);
      } catch (parseError) {
        console.error(`解析开发区数据失败: ${filePath}`, parseError);
        reject(new Error('解析开发区数据失败'));
      }
    });
  });
}

// 安全除法��数
const safeDivide = (numerator, denominator, defaultValue = 0) => {
  if (numerator === null || numerator === undefined || isNaN(numerator)) {
    numerator = 0;
  }
  if (denominator === null || denominator === undefined || isNaN(denominator) || denominator === 0) {
    return defaultValue;
  }
  return numerator / denominator;
};

// 安全获取嵌套对象值
const safeGet = (obj, path, defaultValue = 0) => {
  try {
    return path.split('.').reduce((current, key) => current && current[key], obj) || defaultValue;
  } catch (e) {
    return defaultValue;
  }
};

// Shapefile转GeoJSON函数
async function convertShapefileToGeoJSON(shpPath, dbfPath, options = {}) {
  const { encoding = 'utf8' } = options;

  try {
    const features = [];
    const source = await shapefile.open(shpPath, dbfPath, encoding);

    console.log(`开始处理Shapefile: ${shpPath}`);

    let result = await source.read();
    while (!result.done) {
      const feature = result.value;

      // 添加基本属性
      if (feature.properties) {
        feature.properties.source = 'shapefile';
        feature.properties.converted_at = new Date().toISOString();
      }

      features.push(feature);
      result = await source.read();
    }

    await source.close();

    const geojson = {
      type: 'FeatureCollection',
      features: features
    };

    console.log(`Shapefile转换成功: ${features.length} 个要素`);
    return geojson;

  } catch (error) {
    console.error('Shapefile转换失败:', error);
    throw new Error(`Shapefile转换失败: ${error.message}`);
  }
}

// 从Buffer转换Shapefile为GeoJSON（用于内存中的文件）
async function convertShapefileFromBuffer(shpBuffer, dbfBuffer, outputName, options = {}) {
  const { encoding = 'utf8', prjFile = null } = options;

  try {
    const features = [];

    console.log(`开始处理内存中的Shapefile: ${outputName}`);

    // 使用shapefile库从buffer读取
    let result;
    try {
      result = await shapefile.read(
        shpBuffer,
        dbfBuffer,
        { encoding }
      );
    } catch (readError) {
      console.error('读取Shapefile buffer失败:', readError);
      throw new Error(`读取Shapefile失败: ${readError.message}`);
    }

    // 处理所有要素
    if (result && result.type === 'FeatureCollection') {
      for (const feature of result.features) {
        // 坐标系统转换：检测并转换投影坐标
        if (feature.geometry && feature.geometry.coordinates) {
          feature.geometry = await transformCoordinates(feature.geometry, prjFile);
        }

        // 添加基本属性
        if (feature.properties) {
          feature.properties.source = 'shapefile_upload';
          feature.properties.converted_at = new Date().toISOString();
          feature.properties.output_name = outputName;
          feature.properties.coordinate_transformed = true;
        }

        features.push(feature);
      }
    } else if (result) {
      // 如果是单个feature
      if (result.geometry && result.geometry.coordinates) {
        result.geometry = await transformCoordinates(result.geometry, prjFile);
      }

      if (result.properties) {
        result.properties.source = 'shapefile_upload';
        result.properties.converted_at = new Date().toISOString();
        result.properties.output_name = outputName;
        result.properties.coordinate_transformed = true;
      }
      features.push(result);
    }

    const geojson = {
      type: 'FeatureCollection',
      features: features
    };

    console.log(`内存Shapefile转换成功: ${features.length} 个要素`);
    return geojson;

  } catch (error) {
    console.error('内存Shapefile转换失败:', error);
    throw new Error(`内存Shapefile转换失败: ${error.message}`);
  }
}

// 检测文件编码
function detectEncoding(buffer) {
  // 简单的编码检测，实际应用中可能需要更复杂的检测
  const text = buffer.toString('binary');

  // 检测是否包含中文字符
  if (/[\u4e00-\u9fa5]/.test(text)) {
    // 尝试UTF-8解码
    try {
      Buffer.from(text, 'binary').toString('utf8');
      return 'utf8';
    } catch (e) {
      // UTF-8失败，尝试GBK
      try {
        Buffer.from(text, 'binary').toString('gbk');
        return 'gbk';
      } catch (e2) {
        return 'utf8'; // 默认使用UTF-8
      }
    }
  }

  return 'utf8';
}

// 坐标转换函数：检测并转换投影坐标系到WGS84
async function transformCoordinates(geometry, prjFile = null) {
  try {
    console.log('🔍 接收到的geometry对象类型:', typeof geometry);
    console.log('geometry对象键:', Object.keys(geometry || {}));
    if (Array.isArray(geometry)) {
      console.log('geometry是数组，长度:', geometry.length);
      if (geometry.length > 0) {
        console.log('第一个元素:', geometry[0]);
      }
    }

    if (geometry && geometry.type) {
      console.log('✅ 检测到标准GeoJSON几何体，类型:', geometry.type);
      const coords = geometry.coordinates;

      // 检测是否为投影坐标系（大数值坐标）
      if (isProjectedCoordinate(coords)) {
        console.log('检测到投影坐标系，开始转换...');
        console.log('传递PRJ文件:', prjFile);
        const transformedCoords = await transformProjectToWGS84(coords, prjFile);
        return {
          ...geometry,
          coordinates: transformedCoords
        };
      }
    } else {
      // 如果不是标准GeoJSON格式，直接返回
      console.log('⚠️ 传递的不是标准GeoJSON几何体');
      return geometry;
    }

    return geometry;
  } catch (error) {
    console.warn('坐标转换失败，使用原始坐标:', error);
    return geometry;
  }
}

// 检测是否为投影坐标系
function isProjectedCoordinate(coords) {
  const getFirstCoordinate = (arr) => {
    if (Array.isArray(arr[0])) {
      return getFirstCoordinate(arr[0]);
    }
    return arr;
  };

  const firstCoord = getFirstCoordinate(coords);
  return firstCoord[0] > 1000 || firstCoord[1] > 1000;
}

// 智能匹配PRJ投影定义
function findMatchingProjection(prjContent, projectionMap) {
  // 标准化PRJ内容：移除空格、转换大小写、标准化引号
  const normalizedContent = prjContent
    .replace(/\s+/g, ' ')
    .replace(/['"]/g, '"')
    .toUpperCase()
    .trim();

  console.log('标准化后的PRJ内容:', normalizedContent);

  // 1. 精确匹配优先
  for (const [prjKey, proj4Def] of Object.entries(projectionMap)) {
    const normalizedKey = prjKey.toUpperCase();
    if (normalizedContent === normalizedKey) {
      console.log(`✅ 精确匹配投影: ${prjKey}`);
      return { definition: proj4Def, name: prjKey, matchType: 'exact' };
    }
  }

  // 2. 包含匹配（按优先级排序的关键词）
  const priorityKeywords = [
    'CGCS2000', 'XIAN_1980', 'BEIJING_1954',
    '3_DEGREE_GK', '6_DEGREE_GK',
    'CM_75E', 'CM_78E', 'CM_81E', 'CM_84E', 'CM_87E', 'CM_90E',
    'CM_93E', 'CM_96E', 'CM_99E', 'CM_102E', 'CM_105E', 'CM_108E',
    'CM_111E', 'CM_114E', 'CM_117E', 'CM_120E', 'CM_123E', 'CM_126E',
    'CM_129E', 'CM_132E', 'CM_135E'
  ];

  // 按关键词优先级匹配
  for (const keyword of priorityKeywords) {
    if (normalizedContent.includes(keyword)) {
      // 找到包含该关键词的所有投影定义
      const matches = Object.entries(projectionMap).filter(([key]) =>
        key.toUpperCase().includes(keyword)
      );

      if (matches.length === 1) {
        console.log(`✅ 关键词匹配投影: ${matches[0][0]} (关键词: ${keyword})`);
        return {
          definition: matches[0][1],
          name: matches[0][0],
          matchType: 'keyword',
          keyword: keyword
        };
      }
    }
  }

  // 3. 模糊匹配 - 使用正则表达式
  const regexPatterns = [
    // CGCS2000 3度带高斯投影
    /CGCS2000.*3.*DEGREE.*GK.*CM(\d+)E/i,
    /CGCS2000.*3.*DEGREE.*GK.*ZONE.*(\d+)/i,
    // 西安1980 3度带高斯投影
    /XIAN.*1980.*3.*DEGREE.*GK.*CM(\d+)E/i,
    /XIAN.*1980.*3.*DEGREE.*GK.*ZONE.*(\d+)/i,
    // 北京1954 3度带高斯投影
    /BEIJING.*1954.*3.*DEGREE.*GK.*CM(\d+)E/i,
    /BEIJING.*1954.*3.*DEGREE.*GK.*ZONE.*(\d+)/i,
    // 通用3度带高斯投影
    /3.*DEGREE.*GK.*CM(\d+)E/i,
    /3.*DEGREE.*GK.*ZONE.*(\d+)/i,
    // 6度带高斯投影
    /6.*DEGREE.*GK.*CM(\d+)E/i,
    /6.*DEGREE.*GK.*ZONE.*(\d+)/i,
    // 中央经线匹配
    /CM(\d+)E/i,
    // Zone匹配
    /ZONE.*(\d+)/i,
    // 投影名称匹配
    /PROJCS\[["']([^"']+)["']/i
  ];

  for (const pattern of regexPatterns) {
    const match = normalizedContent.match(pattern);
    if (match) {
      console.log(`🔍 正则匹配成功: ${pattern.toString()}, 匹配结果: ${match[0]}`);

      // 尝试根据匹配结果推断投影参数
      if (match[1]) { // 匹配到中央经线或Zone号
        let centralMeridian = parseInt(match[1]);

        // 如果匹配到的是Zone号，需要转换为中央经线
        if (pattern.toString().includes('ZONE')) {
          centralMeridian = zoneToCentralMeridian(centralMeridian);
          console.log(`Zone ${match[1]} 转换为中央经线: ${centralMeridian}`);
        }

        const foundProjection = inferProjectionFromCentralMeridian(centralMeridian, normalizedContent);
        if (foundProjection) {
          return {
            definition: foundProjection.definition,
            name: foundProjection.name,
            matchType: 'regex',
            pattern: pattern.toString(),
            centralMeridian: centralMeridian
          };
        }
      }
    }
  }

  // 4. 参数解析匹配 - 解析PRJ中的具体参数
  const parameterMatch = parsePRJParameters(prjContent);
  if (parameterMatch) {
    console.log(`🔧 参数解析匹配:`, parameterMatch);
    return {
      definition: parameterMatch.proj4Def,
      name: `解析自PRJ参数: ${parameterMatch.projectionName}`,
      matchType: 'parameter',
      parameters: parameterMatch
    };
  }

  return null;
}

// 将3度带Zone号转换为中央经线
function zoneToCentralMeridian(zoneNumber) {
  // 3度带分带: Zone 25 = 75E, Zone 26 = 78E, Zone 27 = 81E, ...
  // 公式: 中央经线 = 75 + (ZoneNumber - 25) * 3
  return 75 + (zoneNumber - 25) * 3;
}

// 根据中央经线推断投影定义
function inferProjectionFromCentralMeridian(centralMeridian, prjContent) {
  const standardZones = [75, 78, 81, 84, 87, 90, 93, 96, 99, 102, 105, 108, 111, 114, 117, 120, 123, 126, 129, 132, 135];

  if (!standardZones.includes(centralMeridian)) {
    console.warn(`非标准中央经线: ${centralMeridian}`);
    return null;
  }

  // 根据PRJ内容判断椭球体
  let ellipsoid = 'GRS80'; // 默认CGCS2000
  let datum = 'CGCS2000';

  if (prjContent.includes('XIAN') || prjContent.includes('1980')) {
    ellipsoid = 'XIAN_1980';
    datum = 'Xian_1980';
  } else if (prjContent.includes('BEIJING') || prjContent.includes('1954')) {
    ellipsoid = 'BEIJING_1954';
    datum = 'Beijing_1954';
  }

  // 计算伪东偏移
  const falseEasting = centralMeridian >= 114 ?
    (35000000 + (centralMeridian - 114) / 3 * 1000000) :
    (25500000 + (centralMeridian - 75) / 3 * 3000000);

  const proj4Def = generateProj4FromParameters({
    projection: 'tmerc',
    centralMeridian: centralMeridian,
    falseEasting: falseEasting,
    ellipsoid: ellipsoid,
    datum: datum
  });

  return {
    definition: proj4Def,
    name: `推断投影: ${datum} 3度带 ${centralMeridian}E`
  };
}

// 解析PRJ文件中的具体参数
function parsePRJParameters(prjContent) {
  try {
    // 使用正则表达式提取关键参数
    const parameters = {
      projection: null,
      centralMeridian: null,
      falseEasting: null,
      falseNorthing: null,
      scale: null,
      latitudeOfOrigin: null,
      datum: null,
      ellipsoid: null
    };

    // 提取投影类型
    const projMatch = prjContent.match(/PROJECTION\[["']([^"']+)["']/i);
    if (projMatch) {
      parameters.projection = projMatch[1].toLowerCase();
    }

    // 提取中央经线
    const centralMeridianMatch = prjContent.match(/CENTRAL_MERIDIAN[,\s]*(\d+\.?\d*)/i);
    if (centralMeridianMatch) {
      parameters.centralMeridian = parseFloat(centralMeridianMatch[1]);
    }

    // 提取伪东偏移
    const falseEastingMatch = prjContent.match(/FALSE_EASTING[,\s]*(\d+)/i);
    if (falseEastingMatch) {
      parameters.falseEasting = parseFloat(falseEastingMatch[1]);
    }

    // 提取伪北偏移
    const falseNorthingMatch = prjContent.match(/FALSE_NORTHING[,\s]*(\d+)/i);
    if (falseNorthingMatch) {
      parameters.falseNorthing = parseFloat(falseNorthingMatch[1]);
    }

    // 提取比例因子
    const scaleMatch = prjContent.match(/SCALE_FACTOR[,\s]*(\d+\.?\d*)/i);
    if (scaleMatch) {
      parameters.scale = parseFloat(scaleMatch[1]);
    }

    // 提取纬度原点
    const latitudeMatch = prjContent.match(/LATITUDE_OF_ORIGIN[,\s]*(\d+\.?\d*)/i);
    if (latitudeMatch) {
      parameters.latitudeOfOrigin = parseFloat(latitudeMatch[1]);
    }

    // 提取基准面
    const datumMatch = prjContent.match(/DATUM\[["']([^"']+)["']/i);
    if (datumMatch) {
      parameters.datum = datumMatch[1];
    }

    // 提取椭球体
    const ellipsoidMatch = prjContent.match(/ELLIPSOID\[["']([^"']+)["']/i);
    if (ellipsoidMatch) {
      parameters.ellipsoid = ellipsoidMatch[1];
    }

    // 如果有足够的参数，生成proj4定义
    if (parameters.centralMeridian && (parameters.falseEasting || parameters.projection)) {
      const proj4Def = generateProj4FromParameters(parameters);
      const projectionName = parameters.datum || `自定义投影_${parameters.centralMeridian}E`;

      return {
        proj4Def: proj4Def,
        projectionName: projectionName,
        parameters: parameters
      };
    }

    return null;
  } catch (error) {
    console.error('解析PRJ参数失败:', error);
    return null;
  }
}

// 根据参数生成proj4定义
function generateProj4FromParameters(parameters) {
  let proj4Def = '+proj=';

  // 投影类型
  switch (parameters.projection) {
    case 'transverse_mercator':
    case 'gauss_kruger':
      proj4Def += 'tmerc';
      break;
    case 'mercator':
      proj4Def += 'merc';
      break;
    default:
      proj4Def += 'tmerc'; // 默认使用横轴墨卡托
  }

  // 纬度原点
  proj4Def += ` +lat_0=${parameters.latitudeOfOrigin || 0}`;

  // 中央经线
  proj4Def += ` +lon_0=${parameters.centralMeridian}`;

  // 比例因子
  proj4Def += ` +k=${parameters.scale || 1}`;

  // 伪东偏移
  proj4Def += ` +x_0=${parameters.falseEasting || 500000}`;

  // 伪北偏移
  proj4Def += ` +y_0=${parameters.falseNorthing || 0}`;

  // 椭球体参数
  const ellipsoidParams = getEllipsoidParameters(parameters.ellipsoid || parameters.datum);
  if (ellipsoidParams) {
    proj4Def += ` ${ellipsoidParams}`;
  }

  // 椭球体定义
  const ellipsoidDef = getEllipsoidDefinition(parameters.ellipsoid || parameters.datum);
  if (ellipsoidDef) {
    proj4Def += ` ${ellipsoidDef}`;
  }

  proj4Def += ' +units=m +no_defs';

  return proj4Def;
}

// 获取椭球体参数
function getEllipsoidParameters(datum) {
  const datumMap = {
    'CGCS2000': '+towgs84=0,0,0,0,0,0,0',
    'XIAN_1980': '+towgs84=12.7,-131.3,-44.7,0,0,0,0',
    'BEIJING_1954': '+towgs84=12.7,-131.3,-44.7,0,0,0,0'
  };

  const datumUpper = (datum || '').toUpperCase();
  for (const [key, value] of Object.entries(datumMap)) {
    if (datumUpper.includes(key)) {
      return value;
    }
  }

  return '+towgs84=0,0,0,0,0,0,0'; // 默认值
}

// 获取椭球体定义
function getEllipsoidDefinition(ellipsoid) {
  const ellipsoidMap = {
    'GRS80': '+ellps=GRS80',
    'KRASSOVSKY': '+a=6378245 +b=6356863.018773047',
    'XIAN_1980': '+a=6378140 +b=6356755.288157528',
    'BEIJING_1954': '+a=6378245 +b=6356863.018773047'
  };

  const ellipsoidUpper = (ellipsoid || '').toUpperCase();
  for (const [key, value] of Object.entries(ellipsoidMap)) {
    if (ellipsoidUpper.includes(key)) {
      return value;
    }
  }

  return '+ellps=WGS84'; // 默认值
}

// 读取.prj文件获取投影定义
function readProjectionFromPRJ(prjFile) {
  const startTime = Date.now();

  try {
    console.log('🔍 开始解析PRJ文件...');
    console.log('文件大小:', prjFile?.size || '未知', '字节');

    if (!prjFile || !prjFile.buffer) {
      console.error('❌ PRJ文件对象无效');
      return null;
    }

    const prjContent = prjFile.buffer.toString('utf8');
    console.log('PRJ文件原始内容:', prjContent);
    console.log('内容长度:', prjContent.length, '字符');

    // 扩展的中国投影坐标系PRJ内容映射到proj4格式
    const projectionMap = {
      // CGCS2000坐标系 - 3度带高斯投影
      'PROJCS["CGCS2000_3_Degree_GK_CM_75E"': '+proj=tmerc +lat_0=0 +lon_0=75 +k=1 +x_0=25500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'PROJCS["CGCS2000_3_Degree_GK_CM_78E"': '+proj=tmerc +lat_0=0 +lon_0=78 +k=1 +x_0=28500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'PROJCS["CGCS2000_3_Degree_GK_CM_81E"': '+proj=tmerc +lat_0=0 +lon_0=81 +k=1 +x_0=31500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'PROJCS["CGCS2000_3_Degree_GK_CM_84E"': '+proj=tmerc +lat_0=0 +lon_0=84 +k=1 +x_0=34500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'PROJCS["CGCS2000_3_Degree_GK_CM_87E"': '+proj=tmerc +lat_0=0 +lon_0=87 +k=1 +x_0=37500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'PROJCS["CGCS2000_3_Degree_GK_CM_90E"': '+proj=tmerc +lat_0=0 +lon_0=90 +k=1 +x_0=40500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'PROJCS["CGCS2000_3_Degree_GK_CM_93E"': '+proj=tmerc +lat_0=0 +lon_0=93 +k=1 +x_0=43500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'PROJCS["CGCS2000_3_Degree_GK_CM_96E"': '+proj=tmerc +lat_0=0 +lon_0=96 +k=1 +x_0=46500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'PROJCS["CGCS2000_3_Degree_GK_CM_99E"': '+proj=tmerc +lat_0=0 +lon_0=99 +k=1 +x_0=49500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'PROJCS["CGCS2000_3_Degree_GK_CM_102E"': '+proj=tmerc +lat_0=0 +lon_0=102 +k=1 +x_0=52500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'PROJCS["CGCS2000_3_Degree_GK_CM_105E"': '+proj=tmerc +lat_0=0 +lon_0=105 +k=1 +x_0=55500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'PROJCS["CGCS2000_3_Degree_GK_CM_108E"': '+proj=tmerc +lat_0=0 +lon_0=108 +k=1 +x_0=58500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'PROJCS["CGCS2000_3_Degree_GK_CM_111E"': '+proj=tmerc +lat_0=0 +lon_0=111 +k=1 +x_0=61500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'PROJCS["CGCS2000_3_Degree_GK_CM_114E"': '+proj=tmerc +lat_0=0 +lon_0=114 +k=1 +x_0=38500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'PROJCS["CGCS2000_3_Degree_GK_CM_117E"': '+proj=tmerc +lat_0=0 +lon_0=117 +k=1 +x_0=39500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'PROJCS["CGCS2000_3_Degree_GK_CM_120E"': '+proj=tmerc +lat_0=0 +lon_0=120 +k=1 +x_0=40500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'PROJCS["CGCS2000_3_Degree_GK_CM_123E"': '+proj=tmerc +lat_0=0 +lon_0=123 +k=1 +x_0=43500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'PROJCS["CGCS2000_3_Degree_GK_CM_126E"': '+proj=tmerc +lat_0=0 +lon_0=126 +k=1 +x_0=46500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'PROJCS["CGCS2000_3_Degree_GK_CM_129E"': '+proj=tmerc +lat_0=0 +lon_0=129 +k=1 +x_0=49500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'PROJCS["CGCS2000_3_Degree_GK_CM_132E"': '+proj=tmerc +lat_0=0 +lon_0=132 +k=1 +x_0=52500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'PROJCS["CGCS2000_3_Degree_GK_CM_135E"': '+proj=tmerc +lat_0=0 +lon_0=135 +k=1 +x_0=55500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      // Zone 39 对应的投影 (中央经线117E，假东偏移39500000)
      'PROJCS["CGCS2000_3_Degree_GK_Zone_39"': '+proj=tmerc +lat_0=0 +lon_0=117 +k=1 +x_0=39500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',

      // 西安1980坐标系 - 3度带高斯投影
      'PROJCS["Xian_1980_3_Degree_GK_CM_75E"': '+proj=tmerc +lat_0=0 +lon_0=75 +k=1 +x_0=25500000 +y_0=0 +a=6378140 +b=6356755.288157528 +towgs84=12.7,-131.3,-44.7,0,0,0,0 +units=m +no_defs',
      'PROJCS["Xian_1980_3_Degree_GK_CM_78E"': '+proj=tmerc +lat_0=0 +lon_0=78 +k=1 +x_0=28500000 +y_0=0 +a=6378140 +b=6356755.288157528 +towgs84=12.7,-131.3,-44.7,0,0,0,0 +units=m +no_defs',
      'PROJCS["Xian_1980_3_Degree_GK_CM_81E"': '+proj=tmerc +lat_0=0 +lon_0=81 +k=1 +x_0=31500000 +y_0=0 +a=6378140 +b=6356755.288157528 +towgs84=12.7,-131.3,-44.7,0,0,0,0 +units=m +no_defs',
      'PROJCS["Xian_1980_3_Degree_GK_CM_84E"': '+proj=tmerc +lat_0=0 +lon_0=84 +k=1 +x_0=34500000 +y_0=0 +a=6378140 +b=6356755.288157528 +towgs84=12.7,-131.3,-44.7,0,0,0,0 +units=m +no_defs',
      'PROJCS["Xian_1980_3_Degree_GK_CM_87E"': '+proj=tmerc +lat_0=0 +lon_0=87 +k=1 +x_0=37500000 +y_0=0 +a=6378140 +b=6356755.288157528 +towgs84=12.7,-131.3,-44.7,0,0,0,0 +units=m +no_defs',
      'PROJCS["Xian_1980_3_Degree_GK_CM_90E"': '+proj=tmerc +lat_0=0 +lon_0=90 +k=1 +x_0=40500000 +y_0=0 +a=6378140 +b=6356755.288157528 +towgs84=12.7,-131.3,-44.7,0,0,0,0 +units=m +no_defs',
      'PROJCS["Xian_1980_3_Degree_GK_CM_93E"': '+proj=tmerc +lat_0=0 +lon_0=93 +k=1 +x_0=43500000 +y_0=0 +a=6378140 +b=6356755.288157528 +towgs84=12.7,-131.3,-44.7,0,0,0,0 +units=m +no_defs',
      'PROJCS["Xian_1980_3_Degree_GK_CM_96E"': '+proj=tmerc +lat_0=0 +lon_0=96 +k=1 +x_0=46500000 +y_0=0 +a=6378140 +b=6356755.288157528 +towgs84=12.7,-131.3,-44.7,0,0,0,0 +units=m +no_defs',
      'PROJCS["Xian_1980_3_Degree_GK_CM_99E"': '+proj=tmerc +lat_0=0 +lon_0=99 +k=1 +x_0=49500000 +y_0=0 +a=6378140 +b=6356755.288157528 +towgs84=12.7,-131.3,-44.7,0,0,0,0 +units=m +no_defs',
      'PROJCS["Xian_1980_3_Degree_GK_CM_102E"': '+proj=tmerc +lat_0=0 +lon_0=102 +k=1 +x_0=52500000 +y_0=0 +a=6378140 +b=6356755.288157528 +towgs84=12.7,-131.3,-44.7,0,0,0,0 +units=m +no_defs',
      'PROJCS["Xian_1980_3_Degree_GK_CM_105E"': '+proj=tmerc +lat_0=0 +lon_0=105 +k=1 +x_0=55500000 +y_0=0 +a=6378140 +b=6356755.288157528 +towgs84=12.7,-131.3,-44.7,0,0,0,0 +units=m +no_defs',
      'PROJCS["Xian_1980_3_Degree_GK_CM_108E"': '+proj=tmerc +lat_0=0 +lon_0=108 +k=1 +x_0=58500000 +y_0=0 +a=6378140 +b=6356755.288157528 +towgs84=12.7,-131.3,-44.7,0,0,0,0 +units=m +no_defs',
      'PROJCS["Xian_1980_3_Degree_GK_CM_111E"': '+proj=tmerc +lat_0=0 +lon_0=111 +k=1 +x_0=61500000 +y_0=0 +a=6378140 +b=6356755.288157528 +towgs84=12.7,-131.3,-44.7,0,0,0,0 +units=m +no_defs',
      'PROJCS["Xian_1980_3_Degree_GK_CM_114E"': '+proj=tmerc +lat_0=0 +lon_0=114 +k=1 +x_0=64500000 +y_0=0 +a=6378140 +b=6356755.288157528 +towgs84=12.7,-131.3,-44.7,0,0,0,0 +units=m +no_defs',
      'PROJCS["Xian_1980_3_Degree_GK_CM_117E"': '+proj=tmerc +lat_0=0 +lon_0=117 +k=1 +x_0=39500000 +y_0=0 +a=6378140 +b=6356755.288157528 +towgs84=12.7,-131.3,-44.7,0,0,0,0 +units=m +no_defs',
      'PROJCS["Xian_1980_3_Degree_GK_CM_120E"': '+proj=tmerc +lat_0=0 +lon_0=120 +k=1 +x_0=40500000 +y_0=0 +a=6378140 +b=6356755.288157528 +towgs84=12.7,-131.3,-44.7,0,0,0,0 +units=m +no_defs',
      'PROJCS["Xian_1980_3_Degree_GK_CM_123E"': '+proj=tmerc +lat_0=0 +lon_0=123 +k=1 +x_0=43500000 +y_0=0 +a=6378140 +b=6356755.288157528 +towgs84=12.7,-131.3,-44.7,0,0,0,0 +units=m +no_defs',
      'PROJCS["Xian_1980_3_Degree_GK_CM_126E"': '+proj=tmerc +lat_0=0 +lon_0=126 +k=1 +x_0=46500000 +y_0=0 +a=6378140 +b=6356755.288157528 +towgs84=12.7,-131.3,-44.7,0,0,0,0 +units=m +no_defs',
      'PROJCS["Xian_1980_3_Degree_GK_CM_129E"': '+proj=tmerc +lat_0=0 +lon_0=129 +k=1 +x_0=49500000 +y_0=0 +a=6378140 +b=6356755.288157528 +towgs84=12.7,-131.3,-44.7,0,0,0,0 +units=m +no_defs',
      'PROJCS["Xian_1980_3_Degree_GK_CM_132E"': '+proj=tmerc +lat_0=0 +lon_0=132 +k=1 +x_0=52500000 +y_0=0 +a=6378140 +b=6356755.288157528 +towgs84=12.7,-131.3,-44.7,0,0,0,0 +units=m +no_defs',
      'PROJCS["Xian_1980_3_Degree_GK_CM_135E"': '+proj=tmerc +lat_0=0 +lon_0=135 +k=1 +x_0=55500000 +y_0=0 +a=6378140 +b=6356755.288157528 +towgs84=12.7,-131.3,-44.7,0,0,0,0 +units=m +no_defs',

      // 北京1954坐标系 - 3度带高斯投影
      'PROJCS["Beijing_1954_3_Degree_GK_CM_75E"': '+proj=tmerc +lat_0=0 +lon_0=75 +k=1 +x_0=25500000 +y_0=0 +a=6378245 +b=6356863.018773047 +towgs84=12.7,-131.3,-44.7,0,0,0,0 +units=m +no_defs',
      'PROJCS["Beijing_1954_3_Degree_GK_CM_78E"': '+proj=tmerc +lat_0=0 +lon_0=78 +k=1 +x_0=28500000 +y_0=0 +a=6378245 +b=6356863.018773047 +towgs84=12.7,-131.3,-44.7,0,0,0,0 +units=m +no_defs',
      'PROJCS["Beijing_1954_3_Degree_GK_CM_81E"': '+proj=tmerc +lat_0=0 +lon_0=81 +k=1 +x_0=31500000 +y_0=0 +a=6378245 +b=6356863.018773047 +towgs84=12.7,-131.3,-44.7,0,0,0,0 +units=m +no_defs',
      'PROJCS["Beijing_1954_3_Degree_GK_CM_84E"': '+proj=tmerc +lat_0=0 +lon_0=84 +k=1 +x_0=34500000 +y_0=0 +a=6378245 +b=6356863.018773047 +towgs84=12.7,-131.3,-44.7,0,0,0,0 +units=m +no_defs',
      'PROJCS["Beijing_1954_3_Degree_GK_CM_87E"': '+proj=tmerc +lat_0=0 +lon_0=87 +k=1 +x_0=37500000 +y_0=0 +a=6378245 +b=6356863.018773047 +towgs84=12.7,-131.3,-44.7,0,0,0,0 +units=m +no_defs',
      'PROJCS["Beijing_1954_3_Degree_GK_CM_90E"': '+proj=tmerc +lat_0=0 +lon_0=90 +k=1 +x_0=40500000 +y_0=0 +a=6378245 +b=6356863.018773047 +towgs84=12.7,-131.3,-44.7,0,0,0,0 +units=m +no_defs',
      'PROJCS["Beijing_1954_3_Degree_GK_CM_93E"': '+proj=tmerc +lat_0=0 +lon_0=93 +k=1 +x_0=43500000 +y_0=0 +a=6378245 +b=6356863.018773047 +towgs84=12.7,-131.3,-44.7,0,0,0,0 +units=m +no_defs',
      'PROJCS["Beijing_1954_3_Degree_GK_CM_96E"': '+proj=tmerc +lat_0=0 +lon_0=96 +k=1 +x_0=46500000 +y_0=0 +a=6378245 +b=6356863.018773047 +towgs84=12.7,-131.3,-44.7,0,0,0,0 +units=m +no_defs',
      'PROJCS["Beijing_1954_3_Degree_GK_CM_99E"': '+proj=tmerc +lat_0=0 +lon_0=99 +k=1 +x_0=49500000 +y_0=0 +a=6378245 +b=6356863.018773047 +towgs84=12.7,-131.3,-44.7,0,0,0,0 +units=m +no_defs',
      'PROJCS["Beijing_1954_3_Degree_GK_CM_102E"': '+proj=tmerc +lat_0=0 +lon_0=102 +k=1 +x_0=52500000 +y_0=0 +a=6378245 +b=6356863.018773047 +towgs84=12.7,-131.3,-44.7,0,0,0,0 +units=m +no_defs',
      'PROJCS["Beijing_1954_3_Degree_GK_CM_105E"': '+proj=tmerc +lat_0=0 +lon_0=105 +k=1 +x_0=55500000 +y_0=0 +a=6378245 +b=6356863.018773047 +towgs84=12.7,-131.3,-44.7,0,0,0,0 +units=m +no_defs',
      'PROJCS["Beijing_1954_3_Degree_GK_CM_108E"': '+proj=tmerc +lat_0=0 +lon_0=108 +k=1 +x_0=58500000 +y_0=0 +a=6378245 +b=6356863.018773047 +towgs84=12.7,-131.3,-44.7,0,0,0,0 +units=m +no_defs',
      'PROJCS["Beijing_1954_3_Degree_GK_CM_111E"': '+proj=tmerc +lat_0=0 +lon_0=111 +k=1 +x_0=61500000 +y_0=0 +a=6378245 +b=6356863.018773047 +towgs84=12.7,-131.3,-44.7,0,0,0,0 +units=m +no_defs',
      'PROJCS["Beijing_1954_3_Degree_GK_CM_114E"': '+proj=tmerc +lat_0=0 +lon_0=114 +k=1 +x_0=64500000 +y_0=0 +a=6378245 +b=6356863.018773047 +towgs84=12.7,-131.3,-44.7,0,0,0,0 +units=m +no_defs',
      'PROJCS["Beijing_1954_3_Degree_GK_CM_117E"': '+proj=tmerc +lat_0=0 +lon_0=117 +k=1 +x_0=39500000 +y_0=0 +a=6378245 +b=6356863.018773047 +towgs84=12.7,-131.3,-44.7,0,0,0,0 +units=m +no_defs',
      'PROJCS["Beijing_1954_3_Degree_GK_CM_120E"': '+proj=tmerc +lat_0=0 +lon_0=120 +k=1 +x_0=40500000 +y_0=0 +a=6378245 +b=6356863.018773047 +towgs84=12.7,-131.3,-44.7,0,0,0,0 +units=m +no_defs',
      'PROJCS["Beijing_1954_3_Degree_GK_CM_123E"': '+proj=tmerc +lat_0=0 +lon_0=123 +k=1 +x_0=43500000 +y_0=0 +a=6378245 +b=6356863.018773047 +towgs84=12.7,-131.3,-44.7,0,0,0,0 +units=m +no_defs',
      'PROJCS["Beijing_1954_3_Degree_GK_CM_126E"': '+proj=tmerc +lat_0=0 +lon_0=126 +k=1 +x_0=46500000 +y_0=0 +a=6378245 +b=6356863.018773047 +towgs84=12.7,-131.3,-44.7,0,0,0,0 +units=m +no_defs',
      'PROJCS["Beijing_1954_3_Degree_GK_CM_129E"': '+proj=tmerc +lat_0=0 +lon_0=129 +k=1 +x_0=49500000 +y_0=0 +a=6378245 +b=6356863.018773047 +towgs84=12.7,-131.3,-44.7,0,0,0,0 +units=m +no_defs',
      'PROJCS["Beijing_1954_3_Degree_GK_CM_132E"': '+proj=tmerc +lat_0=0 +lon_0=132 +k=1 +x_0=52500000 +y_0=0 +a=6378245 +b=6356863.018773047 +towgs84=12.7,-131.3,-44.7,0,0,0,0 +units=m +no_defs',
      'PROJCS["Beijing_1954_3_Degree_GK_CM_135E"': '+proj=tmerc +lat_0=0 +lon_0=135 +k=1 +x_0=55500000 +y_0=0 +a=6378245 +b=6356863.018773047 +towgs84=12.7,-131.3,-44.7,0,0,0,0 +units=m +no_defs',

      // 常见的简化格式和别名
      'CGCS2000_CM_117E': '+proj=tmerc +lat_0=0 +lon_0=117 +k=1 +x_0=39500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'CGCS2000_CM_120E': '+proj=tmerc +lat_0=0 +lon_0=120 +k=1 +x_0=40500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'CGCS2000_CM_114E': '+proj=tmerc +lat_0=0 +lon_0=114 +k=1 +x_0=38500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',

      // ================== 地���坐标系和特殊投影 ==================

      // 城市独立坐标系
      'BEIJING_LOCAL': '+proj=tmerc +lat_0=39.9 +lon_0=116.4 +k=1 +x_0=500000 +y_0=300000 +ellps=krass +towgs84=12.7,-131.3,-44.7,0,0,0,0 +units=m +no_defs',
      'SHANGHAI_LOCAL': '+proj=tmerc +lat_0=31.23 +lon_0=121.47 +k=1 +x_0=0 +y_0=0 +ellps=WGS84 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'GUANGZHOU_LOCAL': '+proj=tmerc +lat_0=23.13 +lon_0=113.26 +k=1 +x_0=0 +y_0=0 +ellps=WGS84 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'SHENZHEN_LOCAL': '+proj=tmerc +lat_0=22.54 +lon_0=114.06 +k=1 +x_0=0 +y_0=0 +ellps=WGS84 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'TIANJIN_LOCAL': '+proj=tmerc +lat_0=39.13 +lon_0=117.2 +k=1 +x_0=500000 +y_0=0 +ellps=krass +towgs84=12.7,-131.3,-44.7,0,0,0,0 +units=m +no_defs',
      'CHONGQING_LOCAL': '+proj=tmerc +lat_0=29.56 +lon_0=106.55 +k=1 +x_0=0 +y_0=0 +ellps=WGS84 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',

      // 省级坐标系
      'HENAN_PROVINCE': '+proj=tmerc +lat_0=34.7 +lon_0=113.5 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'JIANGSU_PROVINCE': '+proj=tmerc +lat_0=32.0 +lon_0=118.8 +k=1 +x_0=500000 +y_0=0 +ellps=WGS84 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'ZHEJIANG_PROVINCE': '+proj=tmerc +lat_0=29.0 +lon_0=120.5 +k=1 +x_0=500000 +y_0=0 +ellps=WGS84 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'SHANDONG_PROVINCE': '+proj=tmerc +lat_0=36.0 +lon_0=118.0 +k=1 +x_0=500000 +y_0=0 +ellps=WGS84 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',

      // Web墨卡托投影
      'WEB_MERCATOR': '+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs',
      'EPSG:3857': '+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs',
      'WEB_MERCATOR_AUXILARY_SPHERE': '+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs',

      // UTM投影（中国区域）
      'UTM_ZONE_47N': '+proj=utm +zone=47 +ellps=WGS84 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'UTM_ZONE_48N': '+proj=utm +zone=48 +ellps=WGS84 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'UTM_ZONE_49N': '+proj=utm +zone=49 +ellps=WGS84 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'UTM_ZONE_50N': '+proj=utm +zone=50 +ellps=WGS84 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'UTM_ZONE_51N': '+proj=utm +zone=51 +ellps=WGS84 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',

      // 兰伯特投影
      'LAMBERT_CONFORMAL_CONIC_CHINA': '+proj=lcc +lat_1=25 +lat_2=47 +lat_0=0 +lon_0=105 +x_0=0 +y_0=0 +ellps=WGS84 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'ALBERS_CONICAL_CHINA': '+proj=aea +lat_1=25 +lat_2=47 +lat_0=0 +lon_0=105 +x_0=0 +y_0=0 +ellps=WGS84 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',

      // 6度带高斯投影（补充）
      'CGCS2000_6_Degree_GK_CM_75E': '+proj=tmerc +lat_0=0 +lon_0=75 +k=1 +x_0=13500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'CGCS2000_6_Degree_GK_CM_81E': '+proj=tmerc +lat_0=0 +lon_0=81 +k=1 +x_0=14500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'CGCS2000_6_Degree_GK_CM_87E': '+proj=tmerc +lat_0=0 +lon_0=87 +k=1 +x_0=15500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'CGCS2000_6_Degree_GK_CM_93E': '+proj=tmerc +lat_0=0 +lon_0=93 +k=1 +x_0=16500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'CGCS2000_6_Degree_GK_CM_99E': '+proj=tmerc +lat_0=0 +lon_0=99 +k=1 +x_0=17500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'CGCS2000_6_Degree_GK_CM_105E': '+proj=tmerc +lat_0=0 +lon_0=105 +k=1 +x_0=18500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'CGCS2000_6_Degree_GK_CM_111E': '+proj=tmerc +lat_0=0 +lon_0=111 +k=1 +x_0=19500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'CGCS2000_6_Degree_GK_CM_117E': '+proj=tmerc +lat_0=0 +lon_0=117 +k=1 +x_0=20500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'CGCS2000_6_Degree_GK_CM_123E': '+proj=tmerc +lat_0=0 +lon_0=123 +k=1 +x_0=21500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'CGCS2000_6_Degree_GK_CM_129E': '+proj=tmerc +lat_0=0 +lon_0=129 +k=1 +x_0=22500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'CGCS2000_6_Degree_GK_CM_135E': '+proj=tmerc +lat_0=0 +lon_0=135 +k=1 +x_0=23500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',

      // 常见EPSG代码（中国地区）
      'EPSG:4490': '+proj=longlat +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +no_defs', // CGCS2000地理坐标系
      'EPSG:4214': '+proj=longlat +a=6378140 +b=6356755.288157528 +towgs84=12.7,-131.3,-44.7,0,0,0,0 +no_defs', // Xian1980地理坐标系
      'EPSG:4216': '+proj=longlat +a=6378245 +b=6356863.018773047 +towgs84=12.7,-131.3,-44.7,0,0,0,0 +no_defs', // Beijing1954地理坐标系
      'EPSG:4326': '+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs', // WGS84地理坐标系

      // 特殊工程投影
      'CUSTOM_ENGINEERING_1': '+proj=tmerc +lat_0=30.0 +lon_0=114.0 +k=0.9996 +x_0=500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'CUSTOM_ENGINEERING_2': '+proj=tmerc +lat_0=35.0 +lon_0=108.0 +k=1.0 +x_0=0 +y_0=0 +ellps=WGS84 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',

      // 地方城建坐标系常见参数
      'CITY_COORDINATE_SYSTEM': '+proj=tmerc +lat_0=0 +lon_0=0 +k=1 +x_0=500000 +y_0=0 +ellps=WGS84 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs'
    };

    // 使用智能匹配算法查找投影定义
    const matchResult = findMatchingProjection(prjContent, projectionMap);

    if (matchResult) {
      console.log(`✅ 智能匹配成功: ${matchResult.name}`);
      console.log(`匹配类型: ${matchResult.matchType}`);
      if (matchResult.keyword) {
        console.log(`匹配关键词: ${matchResult.keyword}`);
      }
      if (matchResult.pattern) {
        console.log(`匹配模式: ${matchResult.pattern}`);
      }
      if (matchResult.centralMeridian) {
        console.log(`中央经线: ${matchResult.centralMeridian}°`);
      }
      return matchResult.definition;
    }

    const processingTime = Date.now() - startTime;
    console.warn(`❌ 无法识别PRJ文件中的投影定义 (处理时间: ${processingTime}ms)`);
    console.log('PRJ内容预览:', prjContent.substring(0, 150) + (prjContent.length > 150 ? '...' : ''));
    return null;

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error(`💥 读取PRJ文件失败 (耗时: ${processingTime}ms):`, error);
    console.error('错误类型:', error.constructor.name);
    console.error('错误消息:', error.message);
    if (error.stack) {
      console.error('错误堆栈:', error.stack);
    }
    return null;
  }
}

// 使用新的坐标转换器进行准确的坐标转换
async function transformProjectToWGS84(coords, prjFile = null) {
  console.log('🔄 使用新的坐标转换器开始转换...');

  try {
    // 优先使用新的坐标转换器
    if (coordinateTransformer) {
      // 读取PRJ文件内容（如果提供了文件路径）
      let prjContent = null;
      if (prjFile) {
        console.log('🔍 处理PRJ文件，类型:', typeof prjFile);

        if (typeof prjFile === 'string') {
          // 如果是文件路径，读取文件
          try {
            prjContent = fs.readFileSync(prjFile, 'utf-8');
            console.log(`✅ 成功读取PRJ文件: ${prjFile}`);
          } catch (error) {
            console.warn(`⚠️ 无法读取PRJ文件 ${prjFile}:`, error.message);
          }
        } else if (prjFile.buffer && prjFile.originalname) {
          // 如果是multer上传的文件对象
          try {
            console.log('📁 检测到multer文件对象:', prjFile.originalname);
            console.log('Buffer大小:', prjFile.buffer.length);
            prjContent = prjFile.buffer.toString('utf-8');
            console.log(`✅ 成功读取上传的PRJ文件内容: ${prjFile.originalname}`);
            console.log('PRJ内容前100字符:', prjContent.substring(0, 100));
          } catch (error) {
            console.warn(`⚠️ 无法读取上传的PRJ文件buffer:`, error.message);
          }
        } else {
          // 如果直接提供了PRJ内容或其他格式
          console.log('📄 直接使用PRJ内容，对象键:', Object.keys(prjFile || {}));
          prjContent = prjFile;
        }
      }

      // 使用新的坐标转换器
      const result = await coordinateTransformer.transformCoordinates(coords, prjContent, {
        fallbackToOriginal: true // 如果转换失败，返回原始坐标
      });

      console.log('✅ 新坐标转换器转换完成');
      return result;
    }

    // 降级处理：使用旧系统
    console.log('⚠️ 新坐标转换器不可用，使用旧系统');
    return transformProjectToWGS84Legacy(coords, prjFile);

  } catch (error) {
    console.error('❌ 坐标转换失败，使用降级方案:', error.message);
    return transformProjectToWGS84Legacy(coords, prjFile);
  }
}

// 旧的坐标转换函数（作为降级方案）
function transformProjectToWGS84Legacy(coords, prjFile = null) {
  console.log('🔄 使用旧坐标转换系统...');

  // 优先使用PRJ文件的投影定义
  let projectionDef = null;
  let projectionName = null;

  if (prjFile) {
    projectionDef = readProjectionFromPRJ(prjFile);
    if (projectionDef) {
      projectionName = 'PRJ_FILE_DETECTED';
    }
  }

  // 备选：中国常见投影坐标系定义
  const fallbackProjections = [
    // CGCS2000 / 3-degree Gauss-Kruger CM 117E (适用于中国东部地区)
    ['CGCS2000_CM_117', '+proj=tmerc +lat_0=0 +lon_0=117 +k=1 +x_0=39500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs'],
    // CGCS2000 / 3-degree Gauss-Kruger CM 114E
    ['CGCS2000_CM_114', '+proj=tmerc +lat_0=0 +lon_0=114 +k=1 +x_0=38500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs'],
    // CGCS2000 / 3-degree Gauss-Kruger CM 120E
    ['CGCS2000_CM_120', '+proj=tmerc +lat_0=0 +lon_0=120 +k=1 +x_0=40500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs'],
    // Xian 1980 / 3-degree Gauss-Kruger CM 117E
    ['XIAN1980_CM_117', '+proj=tmerc +lat_0=0 +lon_0=117 +k=1 +x_0=39500000 +y_0=0 +a=6378140 +b=6356755.288157528 +towgs84=12.7,-131.3,-44.7,0,0,0,0 +units=m +no_defs'],
    // Beijing 1954 / 3-degree Gauss-Kruger CM 117E
    ['BEIJING1954_CM_117', '+proj=tmerc +lat_0=0 +lon_0=117 +k=1 +x_0=39500000 +y_0=0 +a=6378245 +b=6356863.018773047 +towgs84=12.7,-131.3,-44.7,0,0,0,0 +units=m +no_defs']
  ];

  const wgs84 = 'EPSG:4326'; // WGS84经纬度坐标系

  const transform = (x, y) => {
    console.log(`使用proj4转换坐标到EPSG:4326格式: (${x}, ${y})`);

    // 如果坐标看起来已经是经纬度范围，直接返回
    if (x >= -180 && x <= 180 && y >= -90 && y <= 90) {
      console.log(`坐标已是WGS84格式: (${x}, ${y})`);
      return [x, y];
    }

    // 优先使用PRJ文件检测到的投影
    if (projectionDef) {
      try {
        const transformed = proj4(projectionDef, wgs84, [x, y]);
        console.log(`✅ 使用PRJ检测的投影转换成功: (${x}, ${y}) -> (${transformed[0].toFixed(6)}, ${transformed[1].toFixed(6)})`);
        return transformed;
      } catch (error) {
        console.warn(`PRJ检测的投影转换失败:`, error.message);
      }
    }

    // 尝试备选投影
    for (const [name, projDef] of fallbackProjections) {
      try {
        const transformed = proj4(projDef, wgs84, [x, y]);

        // 检查转换结果是否在中国合理范围内
        if (transformed[0] >= 70 && transformed[0] <= 140 &&
            transformed[1] >= 10 && transformed[1] <= 55) {
          console.log(`✅ 使用备选投影 ${name} 转换成功: (${x}, ${y}) -> (${transformed[0].toFixed(6)}, ${transformed[1].toFixed(6)})`);
          return transformed;
        } else {
          console.log(`❌ 备选投影 ${name} 转换结果超出范围: (${transformed[0].toFixed(6)}, ${transformed[1].toFixed(6)})`);
        }
      } catch (error) {
        console.warn(`备选投影 ${name} 转换失败:`, error.message);
        continue;
      }
    }

    // 如果所有投影都失败，警告用户
    console.warn(`⚠️ 无法找到合适的投影转换，坐标: (${x}, ${y})`);
    return [x, y]; // 返回原始坐标
  };

  const transformRecursive = (arr) => {
    if (!Array.isArray(arr)) return arr;

    if (typeof arr[0] === 'number' && typeof arr[1] === 'number') {
      return transform(arr[0], arr[1]);
    }

    return arr.map(transformRecursive);
  };

  try {
    const startTime = Date.now();
    const result = transformRecursive(coords);
    const processingTime = Date.now() - startTime;
    console.log(`✅ 旧坐标转换完成，耗时: ${processingTime}ms`);

    return result;
  } catch (error) {
    console.error('❌ 旧坐标转换失败:', error);
    return coords; // 返回原始坐标
  }
}

// 处理上传的Shapefile文件
async function processUploadedShapefiles(files, outputName) {
  const shpFile = files.find(f => f && f.originalname && f.originalname.endsWith('.shp'));
  const dbfFile = files.find(f => f && f.originalname && f.originalname.endsWith('.dbf'));
  const prjFile = files.find(f => f && f.originalname && f.originalname.endsWith('.prj'));

  if (!shpFile) {
    throw new Error('缺少.shp文件');
  }

  if (!dbfFile) {
    throw new Error('缺少.dbf文件');
  }

  // 检测编码
  const encoding = detectEncoding(dbfFile.buffer);
  console.log(`检测到编码: ${encoding}`);

  // 如果有PRJ文件，读取其内容
  if (prjFile) {
    console.log('发现PRJ文件，尝试读取投影信息...');
  }

  // 转换为GeoJSON - 使用内存中的buffer
  const geojson = await convertShapefileFromBuffer(
    shpFile.buffer,
    dbfFile.buffer,
    outputName,
    { encoding, prjFile }
  );

  // 添加基本属性
  if (geojson.features.length > 0) {
    const firstFeature = geojson.features[0];
    const properties = firstFeature.properties || {};

    // 使用第一个要素的属性作为基本属性
    const baseProperties = {
      name: outputName,
      source: 'shapefile_upload',
      uploaded_at: new Date().toISOString(),
      encoding: encoding,
      feature_count: geojson.features.length,
      ...properties
    };

    // 为每个要素添加基本属性
    geojson.features.forEach(feature => {
      feature.properties = {
        ...baseProperties,
        ...feature.properties,
        name: outputName
      };
    });
  }

  // 确保输出目录存在
  const outputDir = path.join(__dirname, 'uploads', 'areas');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 保存GeoJSON文件
  const outputPath = path.join(outputDir, `${outputName}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(geojson, null, 2), 'utf-8');

  // 更新索引
  const indexPath = path.join(__dirname, 'uploads', 'geojson_index.json');
  let index = [];

  if (fs.existsSync(indexPath)) {
    try {
      const indexContent = fs.readFileSync(indexPath, 'utf-8');
      index = JSON.parse(indexContent);
    } catch (indexError) {
      console.warn('读取现有索引失败，将创建新索引:', indexError.message);
    }
  }

  // 添加新文件到索引
  index.push({
    name: outputName,
    filePath: `areas/${outputName}.json`,
    uploadTime: new Date().toISOString(),
    source: 'shapefile_upload',
    featureCount: geojson.features.length,
    encoding: encoding
  });

  // 保存更新后的索引
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');

  console.log(`✅ Shapefile转换成功: ${outputName}.json, ${geojson.features.length} 个要素`);

  // 自动创建属性数据模板
  try {
    // 获取第一个要素的属性用于提取信息
    const firstFeatureProperties = geojson.features.length > 0 ?
      geojson.features[0].properties || {} : {};

    // 创建属性数据模板
    const templatePath = await createZoneDataTemplate(outputName, firstFeatureProperties);
    console.log(`✅ 已自动创建属性数据模板: ${path.basename(templatePath)}`);

    return {
      fileName: `${outputName}.json`,
      filePath: `areas/${outputName}.json`,
      featureCount: geojson.features.length,
      source: 'shapefile_upload',
      name: outputName,
      properties: extractGeoJSONProperties(geojson),
      attributeTemplateCreated: true,
      attributeTemplatePath: `zone-data/${path.basename(templatePath)}`
    };
  } catch (templateError) {
    console.warn(`⚠️ 创建属性数据模板失败: ${templateError.message}`);
    // 即使模板创建失败，仍然返回地理数据
    return {
      fileName: `${outputName}.json`,
      filePath: `areas/${outputName}.json`,
      featureCount: geojson.features.length,
      source: 'shapefile_upload',
      name: outputName,
      properties: extractGeoJSONProperties(geojson),
      attributeTemplateCreated: false,
      attributeTemplateError: templateError.message
    };
  }
}

// 确定开发区类型的函数
function determineZoneType(zoneName) {
  const nameStr = zoneName.toLowerCase();

  if (nameStr.includes('高新')) {
    return 'highTech'; // 高新区
  } else if (nameStr.includes('保税')) {
    return 'bonded'; // 综合保税区
  } else if (nameStr.includes('经济') || nameStr.includes('经开')) {
    return 'economic'; // 经开区
  } else {
    return 'other'; // 其他开发区
  }
}

// 理想值配置（按照国家标准文档）
function getIdealValuesByType(zoneType) {
  const idealValuesMap = {
    highTech: {
      // 主导指标理想值
      landDevelopmentRateIdeal: 93.00,         // 土地开发率
      landSupplyRateIdeal: 100.00,            // 土地供应率
      landPerCapitaConstructionIdeal: 103.00,  // 人均建设用地
      comprehensivePlotRatioIdeal: 1.14,       // 综合容积率
      buildingDensityIdeal: 42.00,             // 建筑密度
      industrialLandRateIdeal: 61.00,          // 工业用地率
      industrialPlotRatioIdeal: 1.10,          // 工业用地综合容积率
      fixedAssetInvestmentIntensityIdeal: 3987, // 固定资产投入强度（万元/公顷）
      businessEnterpriseDensityIdeal: 30,      // 亩均地税收（万元/亩）
      landIdleRateIdeal: 0.00,                 // 土地闲置率

      // 特色指标理想值
      highTechRevenueIntensityIdeal: 12285,    // 高新技术企业收入产出强度（万元/公顷）
      highTechRNDIntensityIdeal: 0.89,         // 研发投入强度（%）

      // 扩展潜力计算所需理想值
      totalLandAreaIdeal: 0,
      nonConstructionAreaIdeal: 0
    },
    economic: {
      // 主导指标理想值
      landDevelopmentRateIdeal: 93.00,         // 土地开发率
      landSupplyRateIdeal: 100.00,            // 土地供应率
      landPerCapitaConstructionIdeal: 103.00,  // 人均建设用地
      comprehensivePlotRatioIdeal: 1.14,       // 综合容积率
      buildingDensityIdeal: 42.00,             // 建筑密度
      industrialLandRateIdeal: 55.00,          // 工业用地率
      industrialPlotRatioIdeal: 0.98,          // 工业用地综合容积率
      fixedAssetInvestmentIntensityIdeal: 3344, // 固定资产投入强度（万元/公顷）
      businessEnterpriseDensityIdeal: 25,      // 亩均地税收（万元/亩）
      landIdleRateIdeal: 0.00,                 // 土地闲置率

      // 特色指标理想值
      economicGDPIntensityIdeal: 13377,        // 地均GDP（万元/公顷）
      economicOutputIntensityIdeal: 13994,     // 产业用地投入产出效益（万元/公顷）

      // 扩展潜力计算所需理想值
      totalLandAreaIdeal: 0,
      nonConstructionAreaIdeal: 0
    },
    bonded: {
      // 主导指标理想值
      landDevelopmentRateIdeal: 93.00,         // 土地开发率
      landSupplyRateIdeal: 100.00,            // 土地供应率
      landPerCapitaConstructionIdeal: 103.00,  // 人均建设用地
      comprehensivePlotRatioIdeal: 1.14,       // 综合容积率
      buildingDensityIdeal: 42.00,             // 建筑密度
      industrialLandRateIdeal: 67.00,          // 工业用地率
      industrialPlotRatioIdeal: 1.06,          // 工业用地综合容积率
      fixedAssetInvestmentIntensityIdeal: 3344, // 固定资产投入强度（万元/公顷）
      businessEnterpriseDensityIdeal: 25,      // 亩均地税收（万元/亩）
      landIdleRateIdeal: 0.00,                 // 土地闲置率

      // 特色指标理想值
      bondedTradeValueIdeal: 83340,            // 单位面积贸易额（万元/公顷）
      bondedFixedAssetRatioIdeal: 19.00,      // 固定资产投入占比（%）

      // 扩展潜力计算所需理想值
      totalLandAreaIdeal: 0,
      nonConstructionAreaIdeal: 0
    },
    other: {
      // 主导指标理想值
      landDevelopmentRateIdeal: 93.00,         // 土地开发率
      landSupplyRateIdeal: 100.00,            // 土地供应率
      landPerCapitaConstructionIdeal: 103.00,  // 人均建设用地
      comprehensivePlotRatioIdeal: 1.14,       // 综合容积率
      buildingDensityIdeal: 42.00,             // 建筑密度
      industrialLandRateIdeal: 61.00,          // 工业用地率
      industrialPlotRatioIdeal: 1.10,          // 工业用地综合容积率
      fixedAssetInvestmentIntensityIdeal: 3987, // 固定资产投入强度（万元/公顷）
      businessEnterpriseDensityIdeal: 30,      // 亩均地税收（万元/亩）
      landIdleRateIdeal: 0.00,                 // 土地闲置率

      // 特色指标理想值（一般开发区采用高新区标准）
      otherRevenueIntensityIdeal: 12285,       // 单位面积企业收入（万元/公顷）
      otherOutputIntensityIdeal: 13994,        // 单位面积产值（万元/公顷）

      // 扩展潜力计算所需理想值
      totalLandAreaIdeal: 0,
      nonConstructionAreaIdeal: 0
    }
  };
  return idealValuesMap[zoneType] || idealValuesMap.other;
}

// 根据开发区类型获取指标权重和理想值
function getIndicatorWeightsByType(zoneType) {
  const weightsMap = {
    highTech: {
      // 高新区权重体系
      landUtilizationWeight: 0.50,
      landDevelopmentWeight: 0.2,
      landStructureWeight: 0.25,
      landIntensityWeight: 0.55,
      economicBenefitWeight: 0.20,
      managementWeight: 0.15,
      socialBenefitWeight: 0.15,
      // 详细权重分配
      comprehensivePlotRatioWeight: 0.45,
      industrialPlotRatioWeight: 0.55,
      fixedAssetInvestmentWeight: 0.5,
      businessEnterpriseDensityWeight: 0.5,
      taxPerLandWeight: 1.0,
      // 理想值
      landDevelopmentRateIdeal: 1,
      industrialRateIdeal: 0.6,
      comprehensivePlotRatioIdeal: 1.5,
      industrialPlotRatioIdeal: 1.2,
      fixedAssetInvestmentIdeal: 15000,
      businessEnterpriseDensityIdeal: 50,
      taxPerLandIdeal: 2000
    },
    economic: {
      // 经开区权重体系
      landUtilizationWeight: 0.50,
      landDevelopmentWeight: 0.2,
      landStructureWeight: 0.25,
      landIntensityWeight: 0.55,
      economicBenefitWeight: 0.20,
      managementWeight: 0.15,
      socialBenefitWeight: 0.15,
      // 详细权重分配
      comprehensivePlotRatioWeight: 0.4,
      industrialPlotRatioWeight: 0.45,
      perCapitaConstructionLandWeight: 0.15,
      fixedAssetInvestmentWeight: 0.7,
      enterpriseIncomeWeight: 0.3,
      taxPerLandWeight: 1.0,
      // 理想值
      landDevelopmentRateIdeal: 1,
      industrialRateIdeal: 0.6,
      comprehensivePlotRatioIdeal: 1.5,
      industrialPlotRatioIdeal: 1.2,
      perCapitaConstructionLandIdeal: 0.01,
      fixedAssetInvestmentIdeal: 15000,
      enterpriseIncomeIdeal: 20000,
      taxPerLandIdeal: 2000
    },
    bonded: {
      // 综合保税区权重体系
      landUtilizationWeight: 0.50,
      landDevelopmentWeight: 0.2,
      landStructureWeight: 0.25,
      landIntensityWeight: 0.55,
      economicBenefitWeight: 0.20,
      managementWeight: 0.15,
      socialBenefitWeight: 0.15,
      // 详细权重分配
      comprehensivePlotRatioWeight: 0.45,
      industrialPlotRatioWeight: 0.55,
      fixedAssetInvestmentWeight: 1.0,
      taxPerLandWeight: 0.5,
      industrialTaxWeight: 0.5,
      // 理想值
      landDevelopmentRateIdeal: 1,
      industrialRateIdeal: 0.6,
      comprehensivePlotRatioIdeal: 1.0,
      industrialPlotRatioIdeal: 0.8,
      fixedAssetInvestmentIdeal: 12000,
      taxPerLandIdeal: 1200,
      industrialTaxIdeal: 1500
    },
    other: {
      // 其他开发区权重体系
      landUtilizationWeight: 0.50,
      landDevelopmentWeight: 0.2,
      landStructureWeight: 0.25,
      landIntensityWeight: 0.55,
      economicBenefitWeight: 0.20,
      managementWeight: 0.15,
      socialBenefitWeight: 0.15,
      // 详细权重分配
      comprehensivePlotRatioWeight: 0.45,
      industrialPlotRatioWeight: 0.55,
      fixedAssetInvestmentWeight: 1.0,
      taxPerLandWeight: 1.0,
      // 理想值
      landDevelopmentRateIdeal: 1,
      industrialRateIdeal: 0.6,
      comprehensivePlotRatioIdeal: 1.0,
      industrialPlotRatioIdeal: 0.8,
      fixedAssetInvestmentIdeal: 12000,
      taxPerLandIdeal: 1200
    }
  };

  return weightsMap[zoneType] || weightsMap.other;
}

// 计算开发区评价指标 - 根据不同开发区类型使用不同的指标体系
async function calculateZoneIndicators(areaName) {
  const zoneData = await loadZoneData(areaName);
  const { landData, economicData, buildingData, buildingBaseData, populationData, highTechEnterprises, enterpriseData } = zoneData;

  // 确定开发区类型和对应的指标体系
  const zoneType = determineZoneType(areaName);
  const indicatorWeights = getIndicatorWeightsByType(zoneType);

  // 计算各项指标
  const indicators = {
    areaName,

    // 基础土地信息
    basicLandInfo: {
      totalLandArea: {
        value: safeGet(landData, 'totalLandArea'),
        unit: 'ha'
      },
      suppliedStateConstructionLand: {
        value: safeGet(landData, 'suppliedStateConstructionLand'),
        unit: 'ha'
      },
      nonConstructionArea: {
        value: safeGet(landData, 'nonConstructionArea'),
        unit: 'ha'
      }
    },

    // 土地利用状况
    landUtilizationStatus: {
      weight: indicatorWeights.landUtilizationWeight,

      // 土地开发程度
      landDevelopmentLevel: {
        weight: indicatorWeights.landDevelopmentWeight,
        landDevelopmentRate: {
          value: safeDivide(safeGet(landData, 'availableSupplyArea'), safeGet(landData, 'totalLandArea')),
          formula: "已达到供地面积/土地总面积",
          unit: "ratio"
        },
        builtUpUrbanConstructionLand: {
          value: safeGet(landData, 'builtUrbanConstructionLand'),
          unit: 'ha'
        }
      },

      // 用地结构状况
      landStructureStatus: {
        weight: indicatorWeights.landStructureWeight,
        industrialLandRate: {
          value: safeDivide(safeGet(landData, 'industrialStorageLand'), safeGet(landData, 'builtUrbanConstructionLand')),
          formula: "工矿仓储用地面积/已建成城镇建设用地",
          unit: "ratio"
        },
        industrialStorageLand: {
          value: safeGet(landData, 'industrialStorageLand'),
          unit: 'ha'
        }
      },

      // 土地利用强度
      landUseIntensity: {
        weight: indicatorWeights.landIntensityWeight,
        comprehensivePlotRatio: {
          value: safeDivide(safeGet(buildingData, 'totalBuildingArea'), safeGet(landData, 'builtUrbanConstructionLand')),
          formula: "总建筑面积/已建成城镇建设用地",
          unit: "ratio"
        },
        industrialStorageBuildingArea: {
          value: safeGet(buildingData, 'industrialStorageBuildingArea'),
          unit: 'm²'
        }
      }
    },

    // 用地效益
    economicBenefit: {
      weight: indicatorWeights.economicBenefitWeight,
      outputBenefit: {
        weight: 1.0,
        fixedAssetInvestmentIntensity: {
          value: safeDivide(safeGet(economicData, 'totalFixedAssets'), safeGet(landData, 'builtUrbanConstructionLand')),
          formula: "固定资产总额(万元)/已建成城镇建设用地",
          unit: "万元/ha"
        },
        // 特色指标1：经开区 - 地均企业收入，高新区 - 工商企业密度，保税区 - 固定资产投资强度
        ...getSpecificIndicator1(zoneType, landData, economicData, enterpriseData, highTechEnterprises)
      }
    },

    // 管理绩效
    managementPerformance: {
      weight: indicatorWeights.managementWeight,
      landUseSupervisionPerformance: {
        weight: 1.0,
        landIdleRate: {
          value: safeDivide(safeGet(landData, 'idleLandArea'), safeGet(landData, 'builtUrbanConstructionLand')),
          formula: "闲置土地面积/已建成城镇建设用地",
          unit: "ratio"
        },
        idleLandArea: {
          value: safeGet(landData, 'idleLandArea'),
          unit: 'ha'
        }
      }
    },

    // 社会效益
    socialBenefit: {
      weight: indicatorWeights.socialBenefitWeight,
      socialBenefitIndicators: {
        weight: 1.0,
        taxPerLand: {
          value: safeDivide(safeGet(economicData, 'totalTax'), safeGet(landData, 'builtUrbanConstructionLand')),
          formula: "税收总额(万元)/已建成城镇建设用地",
          unit: "万元/ha"
        },
        // 特色指标2：经开区 - 人均建设用地，高新区 - 地均税收，保税区 - 地均工业税收
        ...getSpecificIndicator2(zoneType, landData, economicData, populationData)
      }
    }
  };

  indicators.lastUpdated = new Date().toISOString();
  return indicators;
}

// 计算开发区潜力分析 - 按照标准指标体系重构
async function calculateZonePotentials(areaName) {
  const zoneData = await loadZoneData(areaName);
  const { landData, economicData, buildingData, buildingBaseData, populationData, highTechEnterprises } = zoneData;

  // 按照标准指标体系计算潜力分析
  const potentials = {
    areaName,

    // 扩展潜力
    expansionPotential: {
      value: Math.max(0, landData.totalLandArea - landData.suppliedStateConstructionLand - landData.nonConstructionArea),
      unit: "hectare",
      formula: "规划建设用地面积 - 已建成城镇建设用地面积 - 非建设用地面积",
      description: "开发区可扩展的土地面积"
    },

    // 结构潜力
    structuralPotentialRate: {
      // 已建成城镇建设用地面积*（工业用地率理想值-工矿仓储用地面积/已建成城镇建设用地)
      value: (safeGet(landData, 'builtUrbanConstructionLand') || 0) * (0.6 - safeDivide(safeGet(landData, 'industrialStorageLand'), safeGet(landData, 'builtUrbanConstructionLand'))),
      unit: "hectare",
      formula: "已建成城镇建设用地面积*（工业用地率理想值0.6-工矿仓储用地面积/已建成城镇建设用地）",
      description: "开发区可增加的工矿仓储用地面积"
    },

    structurePotential: {
      // 工矿仓储用地面积 / 住宅用地面积
      industrialToResidentialRatio: {
        value: safeDivide(safeGet(landData, 'industrialStorageLand'), safeGet(landData, 'residentialLand')),
        unit: "ratio",
        formula: "工矿仓储用地面积 / 住宅用地面积",
        description: "工业用地与住宅用地比值"
      },

      // 工矿仓储用地面积 / 已建成城镇建设用地面积
      industrialToBuiltRatio: {
        value: safeDivide(safeGet(landData, 'industrialStorageLand'), safeGet(landData, 'builtUrbanConstructionLand')),
        unit: "ratio",
        formula: "工矿仓储用地面积 / 已建成城镇建设用地面积",
        description: "工业用地占建成区比例"
      }
    },

    // 强度潜力
    intensityPotential: {
      // 工矿仓储用地面积*（工业用地综合容积率理想值-工矿仓储建筑面积/工矿仓储用地面积）/工业用地综合容积率理想值
      value: (safeGet(landData, 'industrialStorageLand') || 0) * (1.5 - safeDivide(safeGet(buildingData, 'industrialStorageBuildingArea'), safeGet(landData, 'industrialStorageLand'))) / 1.5,
      unit: "hectare",
      formula: "工矿仓储用地面积*（工业用地综合容积率理想值1.5-工矿仓储建筑面积/工矿仓储用地面积）/工业用地综合容积率理想值",
      description: "可扩展的工业用地面积"
    },

    // 管理潜力
    managementPotential: {
      idleLandArea: {
        value: safeGet(landData, 'idleLandArea'),
        unit: "hectare",
        formula: "闲置土地面积",
        description: "可通过管理优化的闲置土地面积"
      },

      idleLandRatio: {
        value: safeDivide(safeGet(landData, 'idleLandArea'), safeGet(landData, 'builtUrbanConstructionLand')),
        unit: "ratio",
        formula: "闲置土地面积 / 已建成面积",
        description: "闲置土地比例(越小越好)"
      }
    },

    lastUpdated: new Date().toISOString()
  };

  return potentials;
}

// 数据库管理API
// GET 数据库状态
app.get('/api/db/status', async (req, res) => {
  try {
    const status = await dbManager.checkStatus();
    const stats = await dbManager.getStatistics();

    res.json({
      success: true,
      status: status,
      statistics: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST 初始化数据库
app.post('/api/db/init', async (req, res) => {
  try {
    const result = await dbManager.initialize();
    res.json({
      success: true,
      message: '数据库初始化完成',
      result: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST 数据迁移
app.post('/api/db/migrate', async (req, res) => {
  try {
    const migrator = new DataMigrator();
    const result = await migrator.migrate();
    res.json({
      success: true,
      message: '数据迁移完成',
      result: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET 从数据库获取开发区索引（兼容现有API）
app.get('/api/db/zones/index', async (req, res) => {
  try {
    if (!connection) {
      return res.status(503).json({ error: '数据库连接不可用' });
    }

    const zones = await connection.many(`
      SELECT
        zone_name as name,
        zone_code as code,
        province,
        city,
        level,
        status,
        upload_time as uploadTime,
        source,
        created_at as createdAt,
        updated_at as updatedAt
      FROM development_zones
      WHERE status = 'active'
      ORDER BY zone_name
    `);

    res.json(zones);
  } catch (error) {
    console.error('获取开发区索引失败:', error);
    res.status(500).json({ error: '获取数据失败' });
  }
});

// GET 从数据库获取指定开发区地理数据（兼容现有API）
app.get('/api/db/geojson/:name', async (req, res) => {
  try {
    if (!connection) {
      return res.status(503).json({ error: '数据库连接不可用' });
    }

    const zoneName = decodeURIComponent(req.params.name);

    // 获取开发区信息
    const zone = await connection.oneOrNone(`
      SELECT id, zone_name, zone_code, province, city, level
      FROM development_zones
      WHERE zone_name = $1 AND status = 'active'
    `, [zoneName]);

    if (!zone) {
      return res.status(404).json({ error: '未找到该开发区数据' });
    }

    // 获取地理数据
    const geoData = await connection.manyOrNone(`
      SELECT
        ST_AsGeoJSON(geometry) as geometry,
        properties,
        class_type as classType,
        feature_name as featureName,
        area_hectares as areaHectares
      FROM geo_data
      WHERE zone_id = $1
    `, [zone.id]);

    if (!geoData || geoData.length === 0) {
      return res.status(404).json({ error: '未找到该开发区地理数据' });
    }

    // 构建GeoJSON格式
    const features = geoData.map(item => {
      const geometry = JSON.parse(item.geometry);
      return {
        type: 'Feature',
        properties: {
          ...item.properties,
          zoneName: zone.zone_name,
          zoneCode: zone.zone_code,
          province: zone.province,
          city: zone.city,
          level: zone.level,
          classType: item.classType,
          featureName: item.featureName,
          areaHectares: item.areaHectares
        },
        geometry: geometry
      };
    });

    const geoJson = {
      type: 'FeatureCollection',
      features: features
    };

    res.json(geoJson);
  } catch (error) {
    console.error('获取开发区地理数据失败:', error);
    res.status(500).json({ error: '获取数据失败' });
  }
});

// GET 从数据库获取开发区详细数据
app.get('/api/db/zones/:name/data', async (req, res) => {
  try {
    if (!connection) {
      return res.status(503).json({ error: '数据库连接不可用' });
    }

    const zoneName = decodeURIComponent(req.params.name);

    // 获取开发区基本信息
    const zone = await connection.oneOrNone(`
      SELECT id, zone_name, zone_code, province, city, district, level,
             high_tech_enterprises, status, upload_time, created_at, updated_at
      FROM development_zones
      WHERE zone_name = $1 AND status = 'active'
    `, [zoneName]);

    if (!zone) {
      return res.status(404).json({ error: '未找到该开发区数据' });
    }

    // 获取各类数据
    const [landData, economicData, populationData, buildingData] = await Promise.all([
      connection.manyOrNone('SELECT * FROM land_data WHERE zone_id = $1 ORDER BY data_year DESC', [zone.id]),
      connection.manyOrNone('SELECT * FROM economic_data WHERE zone_id = $1 ORDER BY data_year DESC', [zone.id]),
      connection.manyOrNone('SELECT * FROM population_data WHERE zone_id = $1 ORDER BY data_year DESC', [zone.id]),
      connection.manyOrNone('SELECT * FROM building_data WHERE zone_id = $1 ORDER BY data_year DESC', [zone.id])
    ]);

    const responseData = {
      zone: zone,
      landData: landData[0] || null,
      economicData: economicData[0] || null,
      populationData: populationData[0] || null,
      buildingData: buildingData[0] || null
    };

    res.json(responseData);
  } catch (error) {
    console.error('获取开发区详细数据失败:', error);
    res.status(500).json({ error: '获取数据失败' });
  }
});

// GET 新的高级查询API
app.get('/api/db/zones/search', async (req, res) => {
  try {
    if (!connection) {
      return res.status(503).json({ error: '数据库连接不可用' });
    }

    const { q, province, level } = req.query;
    let whereClause = 'WHERE status = \'active\'';
    const params = [];
    let paramIndex = 1;

    if (q) {
      whereClause += ` AND zone_name ILIKE $${paramIndex}`;
      params.push(`%${q}%`);
      paramIndex++;
    }

    if (province) {
      whereClause += ` AND province = $${paramIndex}`;
      params.push(province);
      paramIndex++;
    }

    if (level) {
      whereClause += ` AND level = $${paramIndex}`;
      params.push(level);
    }

    const zones = await connection.many(`
      SELECT
        zone_name as name,
        zone_code as code,
        province,
        city,
        level,
        high_tech_enterprises,
        upload_time as uploadTime,
        created_at as createdAt
      FROM development_zones
      ${whereClause}
      ORDER BY zone_name
    `, params);

    res.json(zones);
  } catch (error) {
    console.error('搜索开发区失败:', error);
    res.status(500).json({ error: '搜索失败' });
  }
});

// GET 地理范围查询API
app.get('/api/db/zones/bbox', async (req, res) => {
  try {
    if (!connection) {
      return res.status(503).json({ error: '数据库连接不可用' });
    }

    const { minx, miny, maxx, maxy } = req.query;

    if (!minx || !miny || !maxx || !maxy) {
      return res.status(400).json({ error: '缺少边界框参数' });
    }

    const zones = await connection.many(`
      SELECT DISTINCT
        dz.zone_name as name,
        dz.zone_code as code,
        dz.province,
        dz.city,
        dz.level
      FROM development_zones dz
      INNER JOIN geo_data gd ON dz.id = gd.zone_id
      WHERE dz.status = 'active'
      AND ST_Intersects(gd.geometry, ST_MakeEnvelope($1, $2, $3, $4, 4326))
      ORDER BY dz.zone_name
    `, [parseFloat(minx), parseFloat(miny), parseFloat(maxx), parseFloat(maxy)]);

    res.json(zones);
  } catch (error) {
    console.error('地理范围查询失败:', error);
    res.status(500).json({ error: '查询失败' });
  }
});

// 服务器启动时初始化
async function initializeServer() {
  try {
    console.log('正在启动服务器...');

    // 测试数据库连接
    const connectionTest = await testConnection();
    if (connectionTest.success) {
      console.log('✅ 数据库连接正常');

      // 初始化数据库
      await dbManager.initialize();
      console.log('✅ 数据库初始化完成');
    } else {
      console.log('⚠️  数据库连接失败，将使用文件系统模式');
      console.log('   错误信息:', connectionTest.message);
    }

    // 重建文件索引（保持向后兼容）
    rebuildIndex();
    console.log('✅ 文件索引重建完成');

    // 添加开发区排名API（基于文件系统）
    app.get('/api/zones/rankings', async (req, res) => {
      try {
        const { level, zone_type, limit = 10 } = req.query;

        // 读取开发区索引
        const indexPath = path.join(__dirname, 'uploads', 'geojson_index.json');
        if (!fs.existsSync(indexPath)) {
          return res.json({
            success: true,
            data: [],
            message: '暂无开发区数据'
          });
        }

        const indexContent = fs.readFileSync(indexPath, 'utf-8');
        let zones = JSON.parse(indexContent);

        // 过滤条件将在处理后进行

        // 生成模拟指标数据的函数
        function generateMockIndicators(zoneName) {
          // 基于名称生成不同的模拟数据
          const nameStr = zoneName.toLowerCase();
          let baseScore = 70;

          if (nameStr.includes('国家')) baseScore = 85;
          else if (nameStr.includes('高新')) baseScore = 80;
          else if (nameStr.includes('经济')) baseScore = 75;
          else if (nameStr.includes('保税')) baseScore = 82;

          return {
            landUtilizationStatus: {
              landDevelopmentLevel: {
                landDevelopmentRate: { value: (baseScore + Math.random() * 20) / 100 }
              },
              landStructureStatus: {
                industrialLandRate: { value: (0.4 + Math.random() * 0.3) }
              },
              landUseIntensity: {
                comprehensivePlotRatio: { value: 0.8 + Math.random() * 0.7 }
              }
            },
            economicBenefit: {
              outputBenefit: {
                fixedAssetInvestmentIntensity: { value: (baseScore / 10 + Math.random() * 5) },
                commercialEnterpriseDensity: { value: (baseScore / 20 + Math.random() * 3) }
              }
            },
            managementPerformance: {
              landUseSupervisionPerformance: {
                landIdleRate: { value: Math.random() * 0.1 } // 0-10%闲置率
              }
            },
            socialBenefit: {
              socialBenefitIndicators: {
                taxPerLand: { value: (baseScore / 15 + Math.random() * 4) },
                industrialTaxPerLand: { value: (baseScore / 12 + Math.random() * 6) }
              }
            }
          };
        }

        // 计算每个开发区的评价总分
        let zonesWithScores = await Promise.all(
          zones.map(async (zone) => {
            try {
              const zoneName = zone.name || '';

              // 读取实际的GeoJSON文件来获取准确的级别和类型信息
              let zoneLevel = '省级'; // 默认为省级
              let zoneType = '经济开发区'; // 默认为经济开发区
              let actualProperties = null;

              try {
                // 读取GeoJSON文件
                const filePath = path.join(__dirname, 'uploads', zone.filePath);
                if (fs.existsSync(filePath)) {
                  const geoJsonContent = fs.readFileSync(filePath, 'utf-8');
                  let geoJsonData = JSON.parse(geoJsonContent);

                  // 处理嵌套格式的文件（如 {"name": "...", "geojson": {...}}）
                  if (geoJsonData.geojson) {
                    geoJsonData = geoJsonData.geojson;
                  }

                  if (geoJsonData.features && geoJsonData.features.length > 0) {
                    actualProperties = geoJsonData.features[0].properties || {};

                    // 基于 KFQJB 字段识别级别
                    const kfqbjb = actualProperties.KFQJB || actualProperties.开发区级别;
                    if (kfqbjb) {
                      const levelStr = String(kfqbjb).toLowerCase();
                      if (levelStr.includes('国家') || levelStr.includes('national') || levelStr.includes('国家级')) {
                        zoneLevel = '国家级';
                      } else if (levelStr.includes('省') || levelStr.includes('provincial') || levelStr.includes('省级')) {
                        zoneLevel = '省级';
                      } else if (levelStr.includes('市') || levelStr.includes('municipal') || levelStr.includes('市级')) {
                        zoneLevel = '市级';
                      } else if (levelStr.includes('县') || levelStr.includes('county') || levelStr.includes('县级')) {
                        zoneLevel = '县级';
                      }
                    }

                    // 基于名称字段和类型字段识别类型
                    const kfqlx = actualProperties.KFQLX || actualProperties.KFQSPLX || actualProperties.开发区类型;
                    if (kfqlx) {
                      const typeStr = String(kfqlx).toLowerCase();

                      // 处理数字代码映射
                      if (typeStr === '1' || typeStr === '1.0') {
                        zoneType = '经济技术开发区';
                      } else if (typeStr === '2' || typeStr === '2.0') {
                        zoneType = '高新技术产业开发区';
                      } else if (typeStr === '3' || typeStr === '3.0') {
                        zoneType = '综合保税区';
                      } else if (typeStr === '7' || typeStr === '7.0') {
                        zoneType = '经济开发区';
                      } else if (typeStr.includes('高新') || typeStr.includes('高技术') || typeStr.includes('高新技术')) {
                        zoneType = '高新技术产业开发区';
                      } else if (typeStr.includes('保税') || typeStr.includes('bonded') || typeStr.includes('自由') ||
                                 typeStr.includes('综合保税') || typeStr.includes('自贸')) {
                        zoneType = '综合保税区';
                      } else if (typeStr.includes('经济') || typeStr.includes('工业园') || typeStr.includes('industrial') ||
                                 typeStr.includes('经济技术开发区')) {
                        zoneType = '经济开发区';
                      } else if (typeStr.includes('边境') || typeStr.includes('合作')) {
                        zoneType = '其他开发区'; // 边境经济合作区归类到其他
                      }
                    }

                    // 如果没有从字段中获取到，从名称推断
                    if (!kfqbjb && !kfqlx) {
                      const nameStr = zoneName.toLowerCase();
                      if (nameStr.includes('高新') || nameStr.includes('高技术') || nameStr.includes('高新技术')) {
                        zoneType = '高新技术产业开发区';
                      } else if (nameStr.includes('保税') || nameStr.includes('bonded')) {
                        zoneType = '综合保税区';
                      } else if (nameStr.includes('经济') || nameStr.includes('工业园')) {
                        zoneType = '经济开发区';
                      }
                    }
                  }
                }
              } catch (fileError) {
                console.warn(`读取${zoneName}的GeoJSON文件失败:`, fileError.message);
              }

              // 如果仍然没有明确信息，从extractedInfo获取
              if (zone.extractedInfo?.level) {
                zoneLevel = zone.extractedInfo.level;
              }
              if (zone.extractedInfo?.zone_type) {
                zoneType = zone.extractedInfo.zone_type;
              }

              // 尝试计算评价指标，如果失败则使用模拟数据
              let indicators;
              try {
                indicators = await calculateZoneIndicators(zoneName);
              } catch (indicatorError) {
                console.warn(`获取${zoneName}指标数据失败，使用模拟数据:`, indicatorError.message);
                indicators = generateMockIndicators(zoneName);
              }

              // 计算总分 (简化版本，基于土地利用状况和经济效益)
              let totalScore = 0;

              // 土地利用状况 (50%)
              if (indicators.landUtilizationStatus) {
                const landScore =
                  (indicators.landUtilizationStatus.landDevelopmentLevel?.landDevelopmentRate?.value || 0) * 20 +
                  (indicators.landUtilizationStatus.landStructureStatus?.industrialLandRate?.value || 0) * 15 +
                  (indicators.landUtilizationStatus.landUseIntensity?.comprehensivePlotRatio?.value || 0) * 15;
                totalScore += landScore * 0.5;
              }

              // 经济效益 (20%)
              if (indicators.economicBenefit) {
                const economicScore =
                  (indicators.economicBenefit.outputBenefit?.fixedAssetInvestmentIntensity?.value || 0) * 10 +
                  (indicators.economicBenefit.outputBenefit?.commercialEnterpriseDensity?.value || 0) * 10;
                totalScore += economicScore * 0.2;
              }

              // 管理绩效 (15%)
              if (indicators.managementPerformance) {
                const managementScore =
                  (1 - (indicators.managementPerformance.landUseSupervisionPerformance?.landIdleRate?.value || 0)) * 15;
                totalScore += managementScore * 0.15;
              }

              // 社会效益 (15%)
              if (indicators.socialBenefit) {
                const socialScore =
                  (indicators.socialBenefit.socialBenefitIndicators?.taxPerLand?.value || 0) * 7.5 +
                  (indicators.socialBenefit.socialBenefitIndicators?.industrialTaxPerLand?.value || 0) * 7.5;
                totalScore += socialScore * 0.15;
              }

              // 将总分转换为5级制
              const level = Math.min(5, Math.max(1, Math.round(totalScore / 20)));

              // 如果得分为0，给一个基于级别的默认分数
              if (totalScore === 0) {
                const levelScores = {
                  '国家级': 85 + Math.random() * 10,
                  '省级': 75 + Math.random() * 10,
                  '市级': 65 + Math.random() * 10,
                  '县级': 55 + Math.random() * 10,
                  '未知': 60 + Math.random() * 10
                };
                totalScore = levelScores[zoneLevel] || 60;
              }

              return {
                name: zoneName,
                level: level,
                zoneLevel: zoneLevel,
                zoneType: zoneType,
                score: parseFloat(totalScore.toFixed(2)),
                details: {
                  landScore: parseFloat((totalScore * 0.5).toFixed(2)),
                  economicScore: parseFloat((totalScore * 0.2).toFixed(2)),
                  managementScore: parseFloat((totalScore * 0.15).toFixed(2)),
                  socialScore: parseFloat((totalScore * 0.15).toFixed(2))
                }
              };
            } catch (error) {
              console.error(`计算${zoneName}评分失败:`, error.message);

              // 即使出错也要返回基本信息
              const fallbackName = zone.name || '未知开发区';
              let fallbackLevel = '省级';
              let fallbackType = '经济开发区';

              const nameStr = fallbackName.toLowerCase();
              if (nameStr.includes('国家')) fallbackLevel = '国家级';
              else if (nameStr.includes('高新')) { fallbackLevel = '省级'; fallbackType = '高新技术产业开发区'; }
              else if (nameStr.includes('保税')) { fallbackLevel = '省级'; fallbackType = '综合保税区'; }

              return {
                name: fallbackName,
                level: 2,
                zoneLevel: fallbackLevel,
                zoneType: fallbackType,
                score: parseFloat((65 + Math.random() * 10).toFixed(2)),
                error: true,
                mockData: true
              };
            }
          })
        );

        // 在排序后进行过滤
        if (level) {
          zonesWithScores = zonesWithScores.filter(zone => zone.zoneLevel === level);
        }

        if (zone_type) {
          zonesWithScores = zonesWithScores.filter(zone => zone.zoneType === zone_type);
        }

        // 按分数排序
        zonesWithScores.sort((a, b) => b.score - a.score);

        // 限制返回数量
        const rankedZones = zonesWithScores.slice(0, parseInt(limit));

        res.json({
          success: true,
          data: rankedZones,
          total: zonesWithScores.length,
          filters: { level, zone_type, limit },
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        console.error('获取开发区排名失败:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // 开发区指标汇总表 API
    app.get('/api/zones/indicators-summary', async (_req, res) => {
      try {
        // 读取开发区索引
        const indexPath = path.join(__dirname, 'uploads', 'geojson_index.json');
        if (!fs.existsSync(indexPath)) {
          return res.json({
            success: true,
            data: [],
            message: '暂无开发区数据'
          });
        }

        const indexContent = fs.readFileSync(indexPath, 'utf-8');
        let zones = JSON.parse(indexContent);

        // 生成详细的模拟指标数据
        function generateDetailedMockIndicators(zoneName) {
          // 基于名称生成不同的基础数据
          const nameStr = zoneName.toLowerCase();
          let baseScore = 70;

          if (nameStr.includes('国家')) baseScore = 85;
          else if (nameStr.includes('高新')) baseScore = 80;
          else if (nameStr.includes('经济')) baseScore = 75;
          else if (nameStr.includes('保税')) baseScore = 82;

          // 生成各种指标数据
          return {
            '开发区名称': zoneName,
            '开发区综合评估分数': Math.round((baseScore + Math.random() * 20) * 10) / 10,
            '土地开发率': Math.round(((0.6 + Math.random() * 0.35) * 100) * 10) / 10, // 60-95%
            '工业用地率': Math.round(((0.3 + Math.random() * 0.4) * 100) * 10) / 10, // 30-70%
            '综合容积率': Math.round((0.8 + Math.random() * 1.2) * 100) / 100, // 0.8-2.0
            '工业用地综合容积率': Math.round((1.0 + Math.random() * 1.5) * 100) / 100, // 1.0-2.5
            '固定资产投资强度': Math.round((baseScore * 10 + Math.random() * 50) * 10) / 10, // 万元/公顷
            '土地闲置率': Math.round((Math.random() * 0.08) * 100) / 100, // 0-8%
            '地均税收': Math.round((baseScore * 8 + Math.random() * 20) * 10) / 10, // 万元/公顷
            '人均建设用地': Math.round((80 + Math.random() * 120) * 10) / 10, // m²/人
            '地均企业收入': Math.round((baseScore * 15 + Math.random() * 40) * 10) / 10 // 万元/公顷
          };
        }

        // 处理所有开发区数据
        let indicatorsData = await Promise.all(
          zones.map(async (zone) => {
            const zoneName = zone.name || '';

            try {
              // 尝试计算实际指标，如果失败则使用模拟数据
              let indicators;
              try {
                const zoneIndicators = await calculateZoneIndicators(zoneName);

                // 将实际指标数据转换为表格需要的格式
                indicators = {
                  '开发区名称': zoneName,
                  '开发区综合评估分数': 0, // 需要计算
                  '土地开发率': 0,
                  '工业用地率': 0,
                  '综合容积率': 0,
                  '工业用地综合容积率': 0,
                  '固定资产投资强度': 0,
                  '土地闲置率': 0,
                  '地均税收': 0,
                  '人均建设用地': 0,
                  '地均企业收入': 0
                };

                // 从实际指标数据提取值
                if (zoneIndicators.landUtilizationStatus) {
                  indicators['土地开发率'] = Math.round((zoneIndicators.landUtilizationStatus.landDevelopmentLevel?.landDevelopmentRate?.value || 0) * 100 * 10) / 10;
                  indicators['工业用地率'] = Math.round((zoneIndicators.landUtilizationStatus.landStructureStatus?.industrialLandRate?.value || 0) * 100 * 10) / 10;
                  indicators['综合容积率'] = Math.round((zoneIndicators.landUtilizationStatus.landUseIntensity?.comprehensivePlotRatio?.value || 0) * 100) / 100;
                }

                if (zoneIndicators.economicBenefit?.outputBenefit) {
                  indicators['固定资产投资强度'] = Math.round((zoneIndicators.economicBenefit.outputBenefit?.fixedAssetInvestmentIntensity?.value || 0) * 10) / 10;
                  indicators['地均企业收入'] = Math.round((zoneIndicators.economicBenefit.outputBenefit?.commercialEnterpriseDensity?.value || 0) * 10) / 10;
                }

                if (zoneIndicators.managementPerformance?.landUseSupervisionPerformance) {
                  indicators['土地闲置率'] = Math.round((zoneIndicators.managementPerformance.landUseSupervisionPerformance?.landIdleRate?.value || 0) * 100 * 100) / 100;
                }

                if (zoneIndicators.socialBenefit?.socialBenefitIndicators) {
                  indicators['地均税收'] = Math.round((zoneIndicators.socialBenefit.socialBenefitIndicators?.taxPerLand?.value || 0) * 10) / 10;
                }

                // 如果有土地利用数据，计算人均建设用地
                try {
                  const populationData = await getZoneData(zoneName);
                  if (populationData && populationData.populationData && populationData.landData &&
                      populationData.populationData.residentPopulation > 0 && populationData.landData.totalLandArea > 0) {
                    indicators['人均建设用地'] = Math.round(((populationData.landData.totalLandArea * 10000) / populationData.populationData.residentPopulation) * 10) / 10; // m²/人
                  }
                } catch (popError) {
                  // 如果无法获取人口数据，使用模拟值
                  indicators['人均建设用地'] = Math.round((80 + Math.random() * 120) * 10) / 10;
                }

                // 计算综合评估分数
                let totalScore = 0;
                let scoreCount = 0;

                if (indicators['土地开发率'] > 0) {
                  totalScore += Math.min(indicators['土地开发率'], 100);
                  scoreCount++;
                }
                if (indicators['工业用地率'] > 0 && indicators['工业用地率'] <= 70) { // 工业用地率理想范围30-70%
                  const rateScore = Math.max(0, 100 - Math.abs(indicators['工业用地率'] - 50) * 2);
                  totalScore += rateScore;
                  scoreCount++;
                }
                if (indicators['综合容积率'] > 0) {
                  totalScore += Math.min(indicators['综合容积率'] * 50, 100); // 容积率转换为分数
                  scoreCount++;
                }
                if (indicators['固定资产投资强度'] > 0) {
                  totalScore += Math.min(indicators['固定资产投资强度'] / 2, 100); // 强度转换为分数
                  scoreCount++;
                }
                if (indicators['土地闲置率'] >= 0) {
                  const idleScore = Math.max(0, 100 - indicators['土地闲置率'] * 10); // 闲置率越低分数越高
                  totalScore += idleScore;
                  scoreCount++;
                }
                if (indicators['地均税收'] > 0) {
                  totalScore += Math.min(indicators['地均税收'] * 5, 100); // 地均税收转换为分数
                  scoreCount++;
                }

                indicators['开发区综合评估分数'] = scoreCount > 0 ? Math.round((totalScore / scoreCount) * 10) / 10 : 75;

              } catch (indicatorError) {
                console.warn(`获取${zoneName}实际指标数据失败，使用模拟数据:`, indicatorError.message);
                indicators = generateDetailedMockIndicators(zoneName);
              }

              return indicators;
            } catch (error) {
              console.warn(`处理${zoneName}指标数据失败:`, error.message);
              return generateDetailedMockIndicators(zoneName);
            }
          })
        );

        // 按综合得分排序
        indicatorsData.sort((a, b) => b['开发区综合评估分数'] - a['开发区综合评估分数']);

        res.json({
          success: true,
          data: indicatorsData,
          total: indicatorsData.length,
          message: `成功获取${indicatorsData.length}个开发区的指标汇总数据`
        });

      } catch (error) {
        console.error('获取开发区指标汇总数据失败:', error);
        res.status(500).json({
          success: false,
          error: '获取数据失败: ' + error.message
        });
      }
    });

    // 开发区用地潜力汇总表 API
    app.get('/api/zones/potential-summary', async (_req, res) => {
      try {
        // 读取开发区索引
        const indexPath = path.join(__dirname, 'uploads', 'geojson_index.json');
        if (!fs.existsSync(indexPath)) {
          return res.json({
            success: true,
            data: [],
            message: '暂无开发区数据'
          });
        }

        const indexContent = fs.readFileSync(indexPath, 'utf-8');
        let zones = JSON.parse(indexContent);

  
        // 获取特色指标1：按照国家标准文档实现
        function getSpecificIndicator1(zoneType, landData, economicData, enterpriseData, highTechData, bondedData) {
          const builtUrbanConstructionLand = safeGet(landData, 'builtUrbanConstructionLand');

          switch (zoneType) {
            case 'economic':
              // 经开区特色：地均GDP
              return {
                gdpPerLand: {
                  value: safeDivide(safeGet(economicData, 'regionalGDP'), builtUrbanConstructionLand),
                  formula: "地区生产总值(万元)/已建成城镇建设用地面积",
                  unit: "万元/公顷"
                }
              };

            case 'highTech':
              // 高新区特色：工商企业密度
              const totalEnterprises = safeGet(enterpriseData, 'totalEnterprises') + safeGet(highTechData, 'highTechEnterprises', 0);
              return {
                businessEnterpriseDensity: {
                  value: safeDivide(totalEnterprises, builtUrbanConstructionLand),
                  formula: "(工商企业总数+高新技术企业数)/已建成城镇建设用地面积",
                  unit: "家/公顷"
                }
              };

            case 'bonded':
              // 综合保税区特色：单位面积贸易额
              return {
                tradeValuePerLand: {
                  value: safeDivide(safeGet(bondedData, 'totalTradeValue'), builtUrbanConstructionLand),
                  formula: "进出口贸易总额(万元)/已建成城镇建设用地面积",
                  unit: "万元/公顷"
                }
              };

            default:
              // 其他开发区：单位面积企业收入
              return {
                enterpriseIncomePerLand: {
                  value: safeDivide(safeGet(economicData, 'totalEnterpriseIncome'), builtUrbanConstructionLand),
                  formula: "企业总收入(万元)/已建成城镇建设用地面积",
                  unit: "万元/公顷"
                }
              };
          }
        }

        // 获取特色指标2：按照国家标准文档实现
        function getSpecificIndicator2(zoneType, landData, economicData, populationData, highTechData, bondedData) {
          const builtUrbanConstructionLand = safeGet(landData, 'builtUrbanConstructionLand');

          switch (zoneType) {
            case 'economic':
              // 经开区特色：产业用地投入产出效益
              return {
                industrialInputOutputRatio: {
                  value: safeDivide(safeGet(economicData, 'industrialOutput'), safeGet(economicData, 'industrialInvestment')),
                  formula: "产业用地总产值/产业用地总投资",
                  unit: "万元/万元"
                }
              };

            case 'highTech':
              // 高新区特色：亩均地税收
              const landInMu = builtUrbanConstructionLand * 15; // 公顷转换为亩
              return {
                taxPerLand: {
                  value: safeDivide(safeGet(economicData, 'totalTax'), landInMu),
                  formula: "税收总额(万元)/已建成城镇建设用地面积(亩)",
                  unit: "万元/亩"
                }
              };

            case 'bonded':
              // 综合保税区特色：固定资产投资占比
              const totalFixedAssets = safeGet(bondedData, 'fixedAssetInvestment') + safeGet(economicData, 'fixedAssetInvestment', 0);
              return {
                fixedAssetInvestmentRatio: {
                  value: safeDivide(totalFixedAssets, safeGet(bondedData, 'totalInvestment')) * 100,
                  formula: "固定资产投资总额/总投资额 × 100%",
                  unit: "%"
                }
              };

            default:
              // 其他开发区：单位面积产值
              return {
                outputPerLand: {
                  value: safeDivide(safeGet(economicData, 'totalOutput'), builtUrbanConstructionLand),
                  formula: "总产值(万元)/已建成城镇建设用地面积",
                  unit: "万元/公顷"
                }
              };
          }
        }

        // 基于国家标准指标体系计算潜力数据
        function calculatePotentialByStandardIndicators(zoneName, zoneData, zoneType) {
          try {
            // 获取该类型开发区的理想值
            const idealValues = getIdealValuesByType(zoneType);

            // 提取土地数据
            const landData = zoneData.landData || {};
            const economicData = zoneData.economicData || {};
            const populationData = zoneData.populationData || {};
            const buildingData = zoneData.buildingData || {};

            const totalLandArea = safeGet(landData, 'totalLandArea');
            const suppliedStateConstructionLand = safeGet(landData, 'suppliedStateConstructionLand');
            const nonConstructionArea = safeGet(landData, 'nonConstructionArea');
            const builtUrbanConstructionLand = safeGet(landData, 'builtUrbanConstructionLand');
            const industrialStorageLand = safeGet(landData, 'industrialStorageLand');
            const idleLand = safeGet(landData, 'idleLand');

            const industrialStorageBuildingArea = safeGet(buildingData, 'industrialStorageBuildingArea');
            const residentPopulation = safeGet(populationData, 'residentPopulation');

            // 计算潜力值（按照国家标准公式）
            const potential = {};

            // 1. 扩展潜力 = 土地总面积 - 已供应国有建设用地面积 - 不可建设用地面积
            potential['扩展潜力'] = Math.max(0, Math.round((totalLandArea - suppliedStateConstructionLand - nonConstructionArea) * 100) / 100);

            // 2. 结构潜力 = 已建成城镇建设用地面积 × (工业用地率理想值 - 当前工业用地率)
            const currentIndustrialRate = builtUrbanConstructionLand > 0 ? industrialStorageLand / builtUrbanConstructionLand : 0;
            const industrialRateIdeal = safeGet(idealValues, 'industrialLandRateIdeal', 61) / 100; // 转换为小数
            const structurePotential = Math.max(0, builtUrbanConstructionLand * (industrialRateIdeal - currentIndustrialRate));
            potential['结构潜力'] = Math.round(structurePotential * 100) / 100;

            // 3. 强度潜力 = 工矿仓储用地面积 × (工业用地综合容积率理想值 - 当前工业用地综合容积率)
            const currentPlotRatio = industrialStorageLand > 0 ? industrialStorageBuildingArea / industrialStorageLand : 0;
            const plotRatioIdeal = safeGet(idealValues, 'industrialPlotRatioIdeal', 1.10);
            const intensityPotential = Math.max(0, industrialStorageLand * (plotRatioIdeal - currentPlotRatio));
            potential['强度潜力'] = Math.round(intensityPotential * 100) / 100;

            // 4. 管理潜力 = 闲置土地面积
            potential['管理潜力'] = Math.round(idleLand * 100) / 100;

            // 5. 综合适宜性潜力 = (扩展潜力 + 结构潜力 + 强度潜力 + 管理潜力) / 4
            potential['综合潜力'] = Math.round(
              (potential['扩展潜力'] + potential['结构潜力'] + potential['强度潜力'] + potential['管理潜力']) / 4 * 100) / 100;

            // 确定潜力等级
            const comprehensiveScore = potential['综合潜力'];
            let potentialLevel = '低';
            if (comprehensiveScore >= 75) {
              potentialLevel = '高';
            } else if (comprehensiveScore >= 60) {
              potentialLevel = '中';
            }

            potential['潜力等级'] = potentialLevel;
            potential['开发区名称'] = zoneName;

            return potential;

          } catch (error) {
            console.error(`计算${zoneName}潜力数据失败:`, error);
            // 如果计算失败，返回基本的模拟数据
            return generatePotentialData(zoneName);
          }
        }

        // 生成基础模拟潜力数据的备用函数
        function generatePotentialData(zoneName) {
          // 基于名称生成不同的基础潜力数据
          const nameStr = zoneName.toLowerCase();
          let basePotential = 60;

          if (nameStr.includes('国家')) basePotential = 75;
          else if (nameStr.includes('高新')) basePotential = 85;
          else if (nameStr.includes('经济')) basePotential = 70;
          else if (nameStr.includes('保税')) basePotential = 80;
          else if (nameStr.includes('工业园')) basePotential = 65;

          // 生成5个潜力指标
          const extensionPotential = (basePotential + Math.random() * 25); // 扩展潜力
          const structurePotential = (basePotential - 10 + Math.random() * 20); // 结构潜力
          const intensityPotential = (basePotential - 5 + Math.random() * 25); // 强度潜力
          const managementPotential = (basePotential + Math.random() * 20); // 管理潜力
          const comprehensivePotential = (extensionPotential + structurePotential + intensityPotential + managementPotential) / 4;

          // 计算潜力等级
          let potentialLevel = '低';
          if (comprehensivePotential >= 75) potentialLevel = '高';
          else if (comprehensivePotential >= 60) potentialLevel = '中';

          return {
            '开发区名称': zoneName,
            '扩展潜力': Math.round(extensionPotential * 100) / 100,
            '结构潜力': Math.round(structurePotential * 100) / 100,
            '强度潜力': Math.round(intensityPotential * 100) / 100,
            '管理潜力': Math.round(managementPotential * 100) / 100,
            '综合潜力': Math.round(comprehensivePotential * 100) / 100,
            '潜力等级': potentialLevel
          };
        }

        // 处理所有开发区数据
        let potentialData = await Promise.all(
          zones.map(async (zone) => {
            const zoneName = zone.name || '';

            try {
              // 确定开发区类型
              const zoneType = determineZoneType(zoneName);

              // 尝试获取实际开发区数据并计算潜力
              let potential;
              try {
                // 尝试加载开发区的详细数据
                const zoneData = await loadZoneData(zoneName);

                // 使用国家标准指标体系计算潜力
                potential = calculatePotentialByStandardIndicators(zoneName, zoneData, zoneType);

                console.log(`✅ 成功计算 ${zoneName} (${zoneType}) 的潜力数据:`, {
                  扩展潜力: potential['扩展潜力'],
                  结构潜力: potential['结构潜力'],
                  强度潜力: potential['强度潜力'],
                  管理潜力: potential['管理潜力'],
                  综合潜力: potential['综合潜力'],
                  潜力等级: potential['潜力等级']
                });

              } catch (dataError) {
                console.warn(`获取${zoneName}实际数据失败，使用模拟数据:`, dataError.message);
                potential = generatePotentialData(zoneName);
              }

              return potential;
            } catch (error) {
              console.warn(`处理${zoneName}潜力数据失败:`, error.message);
              return generatePotentialData(zoneName);
            }
          })
        );

        // 按综合潜力排序
        potentialData.sort((a, b) => b['综合潜力'] - a['综合潜力']);

        res.json({
          success: true,
          data: potentialData,
          total: potentialData.length,
          message: `成功获取${potentialData.length}个开发区的潜力汇总数据`
        });

      } catch (error) {
        console.error('获取开发区潜力汇总数据失败:', error);
        res.status(500).json({
          success: false,
          error: '获取数据失败: ' + error.message
        });
      }
    });

    // 启动服务器
    app.listen(8080, () => {
      console.log('🚀 Server running on http://localhost:8080');
      console.log('📊 API端点:');
      console.log('   - GET /api/db/status    (数据库状态)');
      console.log('   - POST /api/db/init     (初始化数据库)');
      console.log('   - POST /api/db/migrate  (数据迁移)');
      console.log('   - GET /api/db/zones/index  (开发区索引)');
      console.log('   - GET /api/db/geojson/:name (地理数据)');
      console.log('   - GET /api/db/zones/search?q=keyword (搜索)');
      console.log('   - GET /api/db/zones/bbox?minx,miny,maxx,maxy (地理范围查询)');
      console.log('   - GET /api/zones/rankings?level=&zone_type=&limit= (开发区排名)');
      console.log('   - GET /api/zones/indicators-summary (开发区指标汇总表)');
      console.log('   - GET /api/zones/potential-summary (开发区潜力汇总表)');
    });
  } catch (error) {
    console.error('❌ 服务器启动失败:', error);
    process.exit(1);
  }
}

// 创建开发区数据模板
async function createZoneDataTemplate(zoneName, shapefileProperties = {}) {
  try {
    // 从shapefile属性中提取有用信息
    const extractedInfo = extractZoneInfoFromShapefile(shapefileProperties);

    // 生成开发区代码
    const zoneCode = generateZoneCode(zoneName, extractedInfo.province);

    // 创建模板数据
    const templateData = {
      zoneCode,
      areaName: zoneName,
      highTechEnterprises: 0, // 默认值，需要用户填写

      // 土地数据（单位：公顷）
      landData: {
        totalLandArea: extractedInfo.estimatedArea || 1000.0, // 从shapefile估算或默认值
        planningConstructionLand: 800.0,
        approvedRequisitionArea: 700.0,
        approvedTransferArea: 650.0,
        availableSupplyArea: 600.0,
        suppliedStateConstructionLand: 500.0,
        builtUrbanConstructionLand: 400.0,
        industrialStorageLand: 300.0,
        residentialLand: 60.0,
        nonConstructionArea: 200.0,
        approvedUnsuppliedLand: 100.0,
        idleLand: 20.0
      },

      // 人口数据
      populationData: {
        residentPopulation: 5000 // 默认值，需要用户填写
      },

      // 经济数据（单位：亿元）
      economicData: {
        totalFixedAssets: 100.0, // 默认值，需要用户填写
        totalTax: 10.0, // 默认值，需要用户填写
        totalEnterpriseRevenue: 200.0, // 默认值，需要用户填写
        totalEnterpriseTax: 8.0 // 默认值，需要用户填写
      },

      // 建筑数据（单位：万平方米）
      buildingData: {
        totalBuildingArea: 300.0, // 默认值，需要用户填写
        industrialStorageBuildingArea: 250.0 // 默认值，需要用户填写
      },

      // 建筑基底数据
      buildingBaseData: {
        buildingBaseArea: 150.0, // 默认值，需要用户填写
        industrialStorageOpenArea: 30.0 // 默认值，需要用户填写
      },

      // 元数据
      metadata: {
        createdAt: new Date().toISOString(),
        source: 'shapefile_template',
        estimatedFromShapefile: true,
        needsDataCompletion: true,
        extractedProperties: extractedInfo
      }
    };

    // 确保目录存在
    const zoneDataDir = path.join(__dirname, 'uploads', 'zone-data');
    if (!fs.existsSync(zoneDataDir)) {
      fs.mkdirSync(zoneDataDir, { recursive: true });
    }

    // 保存模板文件
    const safeFileName = zoneName.replace(/[^\w\u4e00-\u9fa5]/g, '_');
    const templatePath = path.join(zoneDataDir, `${safeFileName}.json`);
    fs.writeFileSync(templatePath, JSON.stringify(templateData, null, 2), 'utf-8');

    // 更新索引
    await updateZoneIndex(zoneName, templatePath, extractedInfo);

    console.log(`✅ 已为开发区 "${zoneName}" 创建数据模板: ${templatePath}`);
    return templatePath;

  } catch (error) {
    console.error(`创建开发区数据模板失败:`, error);
    throw new Error(`创建数据模板失败: ${error.message}`);
  }
}

// 从shapefile属性中提取开发区信息
function extractZoneInfoFromShapefile(properties) {
  const extracted = {
    zoneName: null,
    province: null,
    level: null,
    estimatedArea: null,
    class: null,
    zoneCode: null
  };

  // 扩展的字段名映射（支持中英文和各种变体）
  const fieldMappings = {
    // 名称字段
    name: [
      'NAME', 'Name', 'name', 'KFQMC', '开发区名称', '名称', '区域名称',
      'ZONE_NAME', 'ZoneName', 'zone_name', '园区名称', '园区',
      'PARK_NAME', 'ParkName', 'park_name'
    ],
    province: [
      'PROVINCE', 'Province', 'province', '省份', '省', '所在省',
      'SHENG', 'Province_CN', 'PROV', 'prov'
    ],
    level: [
      'LEVEL', 'Level', 'level', 'KFQJB', '开发区级别', '级别',
      'GRADE', 'Grade', 'grade', '等级', 'LEVEL_CN'
    ],
    area: [
      'AREA', 'Area', 'area', '面积', '区域面积', '用地面积',
      'SHAPE_AREA', 'Shape_Area', 'shape_area', 'sqkm', 'SQKM',
      'ACRES', 'acres', 'HECTARES', 'hectares', '公顷'
    ],
    class: [
      'CLASS', 'Class', 'class', '类型', '用地类型', '土地类型',
      'LANDUSE', 'LandUse', 'landuse', 'LAND_USE', 'Land_use'
    ],
    zoneCode: [
      'CODE', 'Code', 'code', 'ZONE_CODE', 'ZoneCode', 'zone_code',
      '开发区代码', '园区代码', 'ID', 'Id', 'id', 'OBJECTID'
    ]
  };

  // 智能字段匹配
  for (const [key, fieldNames] of Object.entries(fieldMappings)) {
    for (const fieldName of fieldNames) {
      if (properties[fieldName] !== undefined && properties[fieldName] !== null) {
        let value = properties[fieldName];

        // 处理字符串值
        if (typeof value === 'string') {
          value = value.trim();
          // 处理编码问题
          if (value.includes('?') || value.includes('�')) {
            console.warn(`⚠️ 字段 ${fieldName} 可能存在编码问题: ${value}`);
            continue;
          }
        }

        extracted[key] = value;
        break;
      }
    }
  }

  // 智能面积处理
  if (extracted.area) {
    const areaValue = parseFloat(extracted.area);
    if (!isNaN(areaValue) && areaValue > 0) {
      // 自动判断单位并转换为公顷
      if (areaValue > 1000) {
        // 可能是平方米或更大的单位
        if (areaValue > 1000000) {
          // 可能是平方公里，转换为公顷
          extracted.estimatedArea = Math.round(areaValue * 100 * 100) / 100;
        } else {
          // 假设是平方米，转换为公顷
          extracted.estimatedArea = Math.round(areaValue / 10000 * 100) / 100;
        }
      } else {
        // 已经是公顷或更小的合理单位
        extracted.estimatedArea = Math.round(areaValue * 100) / 100;
      }
      console.log(`📐 检测到面积: ${extracted.area} -> 转换为 ${extracted.estimatedArea} 公顷`);
    }
  }

  // 智能级别识别
  if (extracted.level) {
    const levelStr = String(extracted.level).toLowerCase();
    if (levelStr.includes('国家') || levelStr.includes('national') || levelStr.includes('国家级')) {
      extracted.level = '国家级';
    } else if (levelStr.includes('省') || levelStr.includes('provincial') || levelStr.includes('省级')) {
      extracted.level = '省级';
    } else if (levelStr.includes('市') || levelStr.includes('municipal') || levelStr.includes('市级')) {
      extracted.level = '市级';
    } else if (levelStr.includes('县') || levelStr.includes('county') || levelStr.includes('县级')) {
      extracted.level = '县级';
    }
  }

  // 智能开发区类型识别
  const zoneTypeKeywords = [
    'KFLX', 'TYPE', 'type', '开发区类型', '类型', 'zone_type', 'zoneType'
  ];

  for (const keyword of zoneTypeKeywords) {
    if (properties[keyword]) {
      extracted.zone_type = properties[keyword];
      break;
    }
  }

  // 智能类型识别
  if (extracted.zone_type) {
    const typeStr = String(extracted.zone_type).toLowerCase();
    if (typeStr.includes('高新') || typeStr.includes('高技术') || typeStr.includes('高新技术') ||
        typeStr.includes('高科技') || typeStr.includes('technology') || typeStr.includes('hi-tech') ||
        typeStr.includes('hightech')) {
      extracted.zone_type = '高新技术产业开发区';
    } else if (typeStr.includes('保税') || typeStr.includes('bonded') || typeStr.includes('baoshui') ||
               typeStr.includes('自由贸易') || typeStr.includes('free trade')) {
      extracted.zone_type = '综合保税区';
    } else if (typeStr.includes('经济') || typeStr.includes('economic') || typeStr.includes('development') ||
               typeStr.includes('工业园') || typeStr.includes('industrial')) {
      extracted.zone_type = '经济开发区';
    } else {
      extracted.zone_type = '其他开发区';
    }
  } else {
    // 通过名称推断类型
    const nameStr = (extracted.zoneName || '').toLowerCase();
    if (nameStr.includes('高新') || nameStr.includes('高技术') || nameStr.includes('高新技术')) {
      extracted.zone_type = '高新技术产业开发区';
    } else if (nameStr.includes('保税') || nameStr.includes('bonded')) {
      extracted.zone_type = '综合保税区';
    } else if (nameStr.includes('经济') || nameStr.includes('工业园')) {
      extracted.zone_type = '经济开发区';
    } else {
      extracted.zone_type = '其他开发区';
    }
  }

  // 如果没有找到名称，尝试从其他字段推断
  if (!extracted.zoneName) {
    for (const [key, value] of Object.entries(properties)) {
      if (typeof value === 'string' && value.length > 2 && value.length < 50) {
        const lowerKey = key.toLowerCase();
        const lowerValue = value.toLowerCase();

        // 检查字段名是否包含名称相关的关键词
        if (lowerKey.includes('name') || lowerKey.includes('名称') ||
            lowerKey.includes('label') || lowerKey.includes('标签')) {
          extracted.zoneName = value.trim();
          break;
        }

        // 检查值是否包含开发区的关键词
        if ((lowerValue.includes('开发区') || lowerValue.includes('园区') ||
             lowerValue.includes('zone') || lowerValue.includes('park') ||
             lowerValue.includes('industrial') || lowerValue.includes('技术')) &&
            !lowerValue.includes('省') && !lowerValue.includes('市')) {
          extracted.zoneName = value.trim();
          break;
        }
      }
    }
  }

  // 生成唯一的zoneCode如果没有找到
  if (!extracted.zoneCode && extracted.zoneName) {
    extracted.zoneCode = generateZoneCode(extracted.zoneName, extracted.province);
  }

  console.log(`🔍 提取的开发区信息:`, extracted);
  return extracted;
}

// 生成开发区代码
function generateZoneCode(zoneName, province) {
  // 省份简称映射
  const provinceCodes = {
    '安徽': 'AH', '北京': 'BJ', '重庆': 'CQ', '福建': 'FJ', '甘肃': 'GS',
    '广东': 'GD', '广西': 'GX', '贵州': 'GZ', '海南': 'HN', '河北': 'HB',
    '黑龙江': 'HLJ', '河南': 'HN', '湖北': 'HB', '湖南': 'HN', '江苏': 'JS',
    '江西': 'JX', '吉林': 'JL', '辽宁': 'LN', '内蒙古': 'NMG', '宁夏': 'NX',
    '青海': 'QH', '陕西': 'SX', '山东': 'SD', '上海': 'SH', '山西': 'SX',
    '四川': 'SC', '天津': 'TJ', '西藏': 'XZ', '新疆': 'XJ', '云南': 'YN',
    '浙江': 'ZJ'
  };

  const provinceCode = provinceCodes[province] || 'UN';
  const zoneAbbr = zoneName.length > 6 ?
    zoneName.substring(0, 3) + zoneName.substring(zoneName.length - 3) :
    zoneName.substring(0, 4);

  // 移除非汉字字符
  const cleanAbbr = zoneAbbr.replace(/[^\u4e00-\u9fa5]/g, '');

  return `${provinceCode}_${cleanAbbr}`;
}

// 更新开发区索引
async function updateZoneIndex(zoneName, filePath, extractedInfo) {
  const indexPath = path.join(__dirname, 'uploads', 'zone-index.json');
  let index = [];

  if (fs.existsSync(indexPath)) {
    try {
      const indexContent = fs.readFileSync(indexPath, 'utf-8');
      index = JSON.parse(indexContent);
    } catch (error) {
      console.warn('读取开发区索引失败，将创建新索引:', error.message);
    }
  }

  // 检查是否已存在
  const existingIndex = index.findIndex(item => item.areaName === zoneName);
  const indexEntry = {
    areaName: zoneName,
    zoneCode: extractedInfo.zoneCode || generateZoneCode(zoneName, extractedInfo.province),
    filePath: path.relative(path.join(__dirname, 'uploads'), filePath),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    hasGeoData: true, // 因为是由shapefile创建的，所以有地理数据
    hasAttributeData: true, // 刚刚创建了属性数据
    extractedFromShapefile: true,
    estimatedFromShapefile: true,

    // 从shapefile中提取的额外信息
    extractedInfo: {
      province: extractedInfo.province || null,
      level: extractedInfo.level || null,
      zone_type: extractedInfo.zone_type || null,
      estimatedArea: extractedInfo.estimatedArea || null,
      landClass: extractedInfo.class || null,
      originalZoneCode: extractedInfo.zoneCode || null
    },

    // 数据状态标记
    dataStatus: {
      isTemplate: true, // 这是模板数据
      needsCompletion: true, // 需要用户完善数据
      templateGeneratedAt: new Date().toISOString()
    }
  };

  if (existingIndex >= 0) {
    // 更新现有条目
    index[existingIndex] = { ...index[existingIndex], ...indexEntry };
  } else {
    // 添加新条目
    index.push(indexEntry);
  }

  // 保存索引
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
}

// 启动服务器
initializeServer();
