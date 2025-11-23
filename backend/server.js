const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const XLSX = require('xlsx');
const cors = require('cors');
const shapefile = require('shapefile');

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

// 多文件上传存储配置（用于Shapefile）
const multiUpload = multer({
  storage: multer.memoryStorage(), // 使用内存存储，文件将被保存在buffer中
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.shp', '.shx', '.dbf', '.geojson'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`不支持的文件格式: ${ext}`), false);
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
  const name = decodeURIComponent(req.params.name);

  // 首先尝试直接使用名称查找文件
  let filePath = path.join(__dirname, 'uploads', 'areas', `${name}.json`);

  // 如果文件不存在，尝试使用safeFileName
  if (!fs.existsSync(filePath)) {
    const safeFileName = name.replace(/[^\w\u4e00-\u9fa5]/g, '_');
    filePath = path.join(__dirname, 'uploads', 'areas', `${safeFileName}.json`);
  }

  console.log(`查找文件: ${filePath}`);

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

    // 验证GeoJSON结构
    if (!geoJSON.type || !geoJSON.features) {
      throw new Error('无效的GeoJSON格式：缺少type或features字段');
    }

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

    return {
      fileName: `${outputName}.json`,
      filePath: `areas/${outputName}.json`,
      featureCount: geoJSON.features.length,
      source: 'geojson_upload',
      properties: extractGeoJSONProperties(geoJSON)
    };

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

// 获取开发区完整数据
app.get('/api/zones/:areaName/data', (req, res) => {
  const areaName = decodeURIComponent(req.params.areaName);
  const safeFileName = areaName.replace(/[^\w\u4e00-\u9fa5]/g, '_');
  const filePath = path.join(__dirname, 'uploads', 'zone-data', `${safeFileName}.json`);

  fs.readFile(filePath, 'utf-8', (err, data) => {
    if (err) {
      return res.status(404).json({ error: '未找到开发区数据' });
    }

    try {
      const zoneData = JSON.parse(data);
      res.json(zoneData);
    } catch (parseError) {
      res.status(500).json({ error: '数据解析失败' });
    }
  });
});

// 更新开发区数据
app.put('/api/zones/:areaName/data', (req, res) => {
  const areaName = decodeURIComponent(req.params.areaName);
  const updatedData = req.body;

  const safeFileName = areaName.replace(/[^\w\u4e00-\u9fa5]/g, '_');
  const filePath = path.join(__dirname, 'uploads', 'zone-data', `${safeFileName}.json`);

  // 添加更新时间
  updatedData.lastUpdated = new Date().toISOString();

  fs.writeFile(filePath, JSON.stringify(updatedData, null, 2), 'utf-8', (err) => {
    if (err) {
      return res.status(500).json({ error: '保存失败' });
    }
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
  const safeFileName = areaName.replace(/[^\w\u4e00-\u9fa5]/g, '_');
  const filePath = path.join(__dirname, 'uploads', 'zone-data', `${safeFileName}.json`);

  return new Promise((resolve, reject) => {
    fs.readFile(filePath, 'utf-8', (err, data) => {
      if (err) {
        reject(new Error('未找到开发区数据'));
        return;
      }

      try {
        const jsonData = JSON.parse(data);
        resolve(jsonData);
      } catch (parseError) {
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
  const { encoding = 'utf8' } = options;

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
      result.features.forEach(feature => {
        // 添加基本属性
        if (feature.properties) {
          feature.properties.source = 'shapefile_upload';
          feature.properties.converted_at = new Date().toISOString();
          feature.properties.output_name = outputName;
        }

        features.push(feature);
      });
    } else if (result) {
      // 如果是单个feature
      if (result.properties) {
        result.properties.source = 'shapefile_upload';
        result.properties.converted_at = new Date().toISOString();
        result.properties.output_name = outputName;
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

// 处理上传的Shapefile文件
async function processUploadedShapefiles(files, outputName) {
  const shpFile = files.find(f => f && f.originalname && f.originalname.endsWith('.shp'));
  const dbfFile = files.find(f => f && f.originalname && f.originalname.endsWith('.dbf'));

  if (!shpFile) {
    throw new Error('缺少.shp文件');
  }

  if (!dbfFile) {
    throw new Error('缺少.dbf文件');
  }

  // 检测编码
  const encoding = detectEncoding(dbfFile.buffer);
  console.log(`检测到编码: ${encoding}`);

  // 转换为GeoJSON - 使用内存中的buffer
  const geojson = await convertShapefileFromBuffer(
    shpFile.buffer,
    dbfFile.buffer,
    outputName,
    { encoding }
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

  return {
    fileName: `${outputName}.json`,
    filePath: `areas/${outputName}.json`,
    featureCount: geojson.features.length,
    source: 'shapefile_upload',
    name: outputName,
    properties: extractGeoJSONProperties(geojson)
  };
}

// 计算开发区评价指标 - 按照标准指标体系重构
async function calculateZoneIndicators(areaName) {
  const zoneData = await loadZoneData(areaName);
  const { landData, economicData, buildingData, buildingBaseData, populationData, highTechEnterprises } = zoneData;

  // 从zoneData中提取企业数据，如果没有则为空对象
  const enterpriseData = zoneData.enterpriseData || {};

  // 计算各项指标 - 标准指标体系权重分配
  const indicators = {
    areaName,

    // 土地利用状况 (权重: 0.50)
    landUtilizationStatus: {
      weight: 0.50,

      // 土地开发程度 (权重: 0.2)
      landDevelopmentLevel: {
        weight: 0.2,
        landDevelopmentRate: {
          value: safeDivide(safeGet(landData, 'availableSupplyArea'), safeGet(landData, 'totalLandArea')),
          formula: "已达到供地面积/土地总面积",
          unit: "ratio"
        }
      },

      // 用地结构状况 (权重: 0.25)
      landStructureStatus: {
        weight: 0.25,
        industrialLandRate: {
          value: safeDivide(safeGet(landData, 'industrialStorageLand'), safeGet(landData, 'builtUrbanConstructionLand')),
          formula: "工矿仓储用地面积/已建成面积",
          unit: "ratio"
        }
      },

      // 土地利用强度 (权重: 0.55)
      landUseIntensity: {
        weight: 0.55,
        comprehensivePlotRatio: {
          value: safeDivide(safeGet(buildingData, 'totalBuildingArea'), safeGet(landData, 'builtUrbanConstructionLand')),
          formula: "总建筑面积/已建成面积",
          unit: "ratio"
        },
        industrialPlotRatio: {
          value: safeDivide(safeGet(buildingData, 'industrialStorageBuildingArea'), safeGet(landData, 'industrialStorageLand')),
          formula: "工矿仓储建筑面积/工矿仓储用地面积",
          unit: "ratio"
        },
        perCapitaConstructionLand: {
          value: safeDivide(safeGet(landData, 'builtUrbanConstructionLand'), safeGet(populationData, 'residentPopulation')),
          formula: "已建成面积/常住人口",
          unit: "ha/people"
        }
      }
    },

    // 用地效益 (权重: 0.20)
    landUseBenefit: {
      weight: 0.20,

      outputBenefit: {
        weight: 1.0,
        fixedAssetInvestmentIntensity: {
          value: safeDivide(safeGet(economicData, 'totalFixedAssets') / 10000, safeGet(landData, 'builtUrbanConstructionLand')),
          formula: "固定资产总额(万元) ÷ 10000 ÷ 已建成面积",
          unit: "billion/ha"
        },
        commercialEnterpriseDensity: {
          value: safeDivide(highTechEnterprises || 0, safeGet(landData, 'builtUrbanConstructionLand')),
          formula: "高新技术企业数/已建成面积",
          unit: "enterprises/ha"
        }
      }
    },

    // 管理绩效 (权重: 0.15)
    managementPerformance: {
      weight: 0.15,

      landUseSupervisionPerformance: {
        weight: 1.0,
        landIdleRate: {
          value: safeDivide(safeGet(landData, 'idleLandArea'), safeGet(landData, 'builtUrbanConstructionLand')),
          formula: "闲置土地面积/已建成面积",
          unit: "ratio"
        }
      }
    },

    // 社会效益 (权重: 0.15)
    socialBenefit: {
      weight: 0.15,

      socialBenefitIndicators: {
        weight: 1.0,
        taxPerLand: {
          value: safeDivide(safeGet(economicData, 'totalTax') / 10000, safeGet(landData, 'builtUrbanConstructionLand')),
          formula: "税收总额(万元) ÷ 10000 ÷ 已建成面积",
          unit: "billion/ha"
        },
        industrialTaxPerLand: {
          value: safeDivide(safeGet(economicData, 'totalEnterpriseTax') / 10000, safeGet(landData, 'builtUrbanConstructionLand')),
          formula: "企业税收总额(万元) ÷ 10000 ÷ 已建成面积",
          unit: "billion/ha"
        }
      }
    },

    lastUpdated: new Date().toISOString()
  };

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
      value: Math.max(0, landData.planningConstructionLand - landData.builtUrbanConstructionLand),
      unit: "hectare",
      formula: "规划建设用地面积 - 已建成城镇建设用地面积",
      description: "开发区可扩展的土地面积"
    },

    // 结构潜力
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
      // 工业仓储建筑面积 / 工矿仓储用地面积 (正向指标)
      industrialBuildingIntensity: {
        value: safeDivide(safeGet(buildingData, 'industrialStorageBuildingArea'), safeGet(landData, 'industrialStorageLand')),
        unit: "ratio",
        formula: "工业仓储建筑面积 / 工矿仓储用地面积",
        description: "工业建筑开发强度(越高越好)"
      },

      // (已供应面积 - 已建面积) / 已供应面积 (负向指标，越小越好)
      landUtilizationGap: {
        value: safeDivide(
          Math.max(0, safeGet(landData, 'suppliedStateConstructionLand') - safeGet(landData, 'builtUrbanConstructionLand')),
          safeGet(landData, 'suppliedStateConstructionLand')
        ),
        unit: "ratio",
        formula: "(已供应面积 - 已建面积) / 已供应面积",
        description: "土地利用缺口(越小越好)"
      }
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
    });
  } catch (error) {
    console.error('❌ 服务器启动失败:', error);
    process.exit(1);
  }
}

// 启动服务器
initializeServer();
