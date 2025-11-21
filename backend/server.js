const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const XLSX = require('xlsx');
const cors = require('cors');
const app = express();

app.use(cors());
// 增加请求体积限制到10MB
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const upload = multer({ dest: 'uploads/' });

// 存储路径
const DATA_PATH = './uploads/geojsons.json';
const DELETED_PATH = './uploads/deleted.json';

// POST 保存
app.post('/api/geojson', (req, res) => {
  const { name, geojson } = req.body;
  
  if (!name || !geojson) {
    return res.status(400).json({ error: '缺少必要参数' });
  }
  
  // 使用分文件存储方式，每个开发区保存为单独的文件
  const safeFileName = name.replace(/[^\w\u4e00-\u9fa5]/g, '_');
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
  const safeFileName = name.replace(/[^\w\u4e00-\u9fa5]/g, '_');
  const filePath = path.join(__dirname, 'uploads', 'areas', `${safeFileName}.json`);
  
  fs.readFile(filePath, 'utf-8', (err, data) => {
    if (err || !data) {
      console.error(`读取开发区 ${name} 数据失败:`, err);
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
      landReadyForSupply: parseFloat(excelRow['已达到供地面积'] || excelRow['到达供地条件面积'] || 0),
      suppliedStateConstructionLand: parseFloat(excelRow['已供应国有建设用地'] || 0),
      builtUrbanConstructionLand: parseFloat(excelRow['已建成面积'] || excelRow['已建成城镇建设用地'] || 0),
      industrialStorageLand: parseFloat(excelRow['工矿仓储用地面积'] || 0),
      residentialLand: parseFloat(excelRow['住宅用地面积'] || 0),
      nonConstructionArea: parseFloat(excelRow['不可建设面积'] || 0),
      approvedUnsuppliedLand: parseFloat(excelRow['批而未供面积'] || 0),
      idleLand: parseFloat(excelRow['闲置土地面积'] || 0)
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

// 计算开发区评价指标 - 按照标准指标体系重构
async function calculateZoneIndicators(areaName) {
  const zoneData = await loadZoneData(areaName);
  const { landData, economicData, buildingData, buildingBaseData, populationData, highTechEnterprises, enterpriseData } = zoneData;

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
          value: landData.totalLandArea > 0 ? landData.landReadyForSupply / landData.totalLandArea : 0,
          formula: "已达到供地面积/土地总面积",
          unit: "ratio"
        }
      },

      // 用地结构状况 (权重: 0.25)
      landStructureStatus: {
        weight: 0.25,
        industrialLandRate: {
          value: landData.builtUrbanConstructionLand > 0 ? landData.industrialStorageLand / landData.builtUrbanConstructionLand : 0,
          formula: "工矿仓储用地面积/已建成面积",
          unit: "ratio"
        }
      },

      // 土地利用强度 (权重: 0.55)
      landUseIntensity: {
        weight: 0.55,
        comprehensivePlotRatio: {
          value: landData.builtUrbanConstructionLand > 0 ? buildingData.totalBuildingArea / landData.builtUrbanConstructionLand : 0,
          formula: "总建筑面积/已建成面积",
          unit: "ratio"
        },
        industrialPlotRatio: {
          value: landData.industrialStorageLand > 0 ? buildingData.industrialStorageBuildingArea / landData.industrialStorageLand : 0,
          formula: "工矿仓储建筑面积/工矿仓储用地面积",
          unit: "ratio"
        },
        perCapitaConstructionLand: {
          value: populationData.residentPopulation > 0 ? landData.builtUrbanConstructionLand / populationData.residentPopulation : 0,
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
          value: landData.builtUrbanConstructionLand > 0 ? economicData.totalFixedAssets / landData.builtUrbanConstructionLand : 0,
          formula: "固定资产总额/已建成面积",
          unit: "billion/ha"
        },
        commercialEnterpriseDensity: {
          value: landData.builtUrbanConstructionLand > 0 ? (enterpriseData?.totalEnterprises || 0) / landData.builtUrbanConstructionLand : 0,
          formula: "工商企业数量/已建成面积",
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
          value: landData.builtUrbanConstructionLand > 0 ? landData.idleLand / landData.builtUrbanConstructionLand : 0,
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
          value: landData.builtUrbanConstructionLand > 0 ? economicData.totalTax / landData.builtUrbanConstructionLand : 0,
          formula: "税收总额/已建成面积",
          unit: "billion/ha"
        },
        industrialTaxPerLand: {
          value: landData.builtUrbanConstructionLand > 0 ? (economicData.industrialEnterpriseTax || 0) / landData.builtUrbanConstructionLand : 0,
          formula: "工业企业税收总额/已建成面积",
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
  const { landData, economicData, buildingData, buildingBaseData, populationData, highTechEnterprises, enterpriseData } = zoneData;

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
        value: landData.residentialLand > 0 ? landData.industrialStorageLand / landData.residentialLand : 0,
        unit: "ratio",
        formula: "工矿仓储用地面积 / 住宅用地面积",
        description: "工业用地与住宅用地比值"
      },

      // 工矿仓储用地面积 / 已建成城镇建设用地面积
      industrialToBuiltRatio: {
        value: landData.builtUrbanConstructionLand > 0 ? landData.industrialStorageLand / landData.builtUrbanConstructionLand : 0,
        unit: "ratio",
        formula: "工矿仓储用地面积 / 已建成城镇建设用地面积",
        description: "工业用地占建成区比例"
      }
    },

    // 强度潜力
    intensityPotential: {
      // 工业仓储建筑面积 / 工矿仓储用地面积 (正向指标)
      industrialBuildingIntensity: {
        value: landData.industrialStorageLand > 0 ? buildingData.industrialStorageBuildingArea / landData.industrialStorageLand : 0,
        unit: "ratio",
        formula: "工业仓储建筑面积 / 工矿仓储用地面积",
        description: "工业建筑开发强度(越高越好)"
      },

      // (已供应面积 - 已建面积) / 已供应面积 (负向指标，越小越好)
      landUtilizationGap: {
        value: landData.suppliedStateConstructionLand > 0 ?
          Math.max(0, landData.suppliedStateConstructionLand - landData.builtUrbanConstructionLand) / landData.suppliedStateConstructionLand : 0,
        unit: "ratio",
        formula: "(已供应面积 - 已建面积) / 已供应面积",
        description: "土地利用缺口(越小越好)"
      }
    },

    // 管理潜力
    managementPotential: {
      idleLandArea: {
        value: landData.idleLand,
        unit: "hectare",
        formula: "闲置土地面积",
        description: "可通过管理优化的闲置土地面积"
      },

      idleLandRatio: {
        value: landData.builtUrbanConstructionLand > 0 ? landData.idleLand / landData.builtUrbanConstructionLand : 0,
        unit: "ratio",
        formula: "闲置土地面积 / 已建成面积",
        description: "闲置土地比例(越小越好)"
      }
    },

    lastUpdated: new Date().toISOString()
  };

  return potentials;
}

// 服务器启动时重建索引
rebuildIndex();

// 启动服务器
app.listen(8080, () => {
  console.log('Server running on http://localhost:8080');
});
