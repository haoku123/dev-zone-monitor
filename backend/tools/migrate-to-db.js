const fs = require('fs');
const path = require('path');
const { connection } = require('../db/connection');
const dbManager = require('../db/database');

class DataMigrator {
  constructor() {
    this.uploadPath = path.join(__dirname, '..', 'uploads');
    this.areasPath = path.join(this.uploadPath, 'areas');
    this.zoneDataPath = path.join(this.uploadPath, 'zone-data');
    this.migrationLog = [];
  }

  // 记录迁移日志
  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, level, message };
    this.migrationLog.push(logEntry);
    console.log(`[${level.toUpperCase()}] ${message}`);
  }

  // 读取JSON文件
  readJsonFile(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        this.log(`文件不存在: ${filePath}`, 'warn');
        return null;
      }

      const content = fs.readFileSync(filePath, 'utf-8');

      // 移除BOM标记（如果存在）
      if (content.charCodeAt(0) === 0xFEFF) {
        return JSON.parse(content.substring(1));
      }

      return JSON.parse(content);
    } catch (error) {
      this.log(`读取文件失败 ${filePath}: ${error.message}`, 'error');
      return null;
    }
  }

  // 读取索引文件
  readIndexFile() {
    const indexPath = path.join(this.uploadPath, 'geojson_index.json');
    return this.readJsonFile(indexPath) || [];
  }

  // 提取省份信息
  extractProvince(properties) {
    const provinceFields = ['province', 'SZSMC', 'SZQXMC', 'city', 'location'];

    for (const field of provinceFields) {
      if (properties[field]) {
        const value = properties[field];
        // 清理省份名称
        if (value.includes('省')) return value.replace(/[市区县]/g, '');
        if (['北京', '天津', '上海', '重庆'].includes(value)) return value;
        if (['��蒙古自治区', '新疆维吾尔自治区', '广西壮族自治区', '宁夏回族自治区', '西藏自治区'].includes(value)) return value;
        if (value.endsWith('自治区')) return value;
      }
    }

    return '未知';
  }

  // 转换地理数据到数据库格式
  convertGeoData(geoJson, zoneId, zoneName) {
    if (!geoJson || !geoJson.features) {
      return [];
    }

    const geoDataRecords = [];

    geoJson.features.forEach((feature, index) => {
      const properties = feature.properties || {};
      const geometry = feature.geometry;

      if (!geometry) {
        this.log(`跳过没有几何数据的要素: ${zoneName} - ${index}`, 'warn');
        return;
      }

      // 转换几何格式为WKT
      let geometryWKT = null;
      try {
        if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
          // 这里应该使用PostGIS的ST_GeomFromGeoJSON函数
          // 现在先保存为GeoJSON格式
          geometryWKT = JSON.stringify(geometry);
        }
      } catch (error) {
        this.log(`几何数据转换失败: ${zoneName} - ${index}`, 'error');
        return;
      }

      const record = {
        zone_id: zoneId,
        geometry: geometryWKT,
        properties: properties,
        class_type: properties.Class || properties.class || properties.CLASS || null,
        feature_name: properties.KFQMC || zoneName,
        created_at: new Date()
      };

      // 计算面积（如果是多边形）
      if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
        // 这里应该使用PostGIS的ST_Area函数计算面积
        // 暂时使用属性中的面积信息或估算
        record.area_hectares = properties.SHAPE_Area ? parseFloat(properties.SHAPE_Area) : null;
      }

      geoDataRecords.push(record);
    });

    return geoDataRecords;
  }

  // 迁移单个开发区
  async migrateZone(zoneInfo) {
    try {
      this.log(`开始迁移开发区: ${zoneInfo.name}`);

      // 读取地理数据文件
      const geoFilePath = path.join(this.areasPath, `${zoneInfo.name}.json`);
      const geoData = this.readJsonFile(geoFilePath);

      if (!geoData) {
        this.log(`无法读取地理数据: ${zoneInfo.name}`, 'error');
        return false;
      }

      // 提取实际的数据
      let actualGeoJson = geoData;
      if (geoData.geojson) {
        actualGeoJson = geoData.geojson;
      }

      // 创建开发区记录
      const zoneRecord = {
        zone_name: zoneInfo.name,
        zone_code: actualGeoJson.features?.[0]?.properties?.KFQDM || null,
        province: zoneInfo.province || this.extractProvince(actualGeoJson.features?.[0]?.properties || {}),
        city: actualGeoJson.features?.[0]?.properties?.SZSMC || null,
        district: actualGeoJson.features?.[0]?.properties?.SZQXMC || null,
        level: actualGeoJson.features?.[0]?.properties?.KFQJB || null,
        status: 'active',
        source: zoneInfo.source || 'migration',
        upload_time: zoneInfo.uploadTime || new Date(),
        created_at: new Date(),
        updated_at: new Date()
      };

      // 插入开发区数据
      let zoneId;
      try {
        const insertResult = await connection.one(
          `INSERT INTO development_zones (${Object.keys(zoneRecord).join(', ')})
           VALUES (${Object.keys(zoneRecord).map((_, i) => `$${i + 1}`).join(', ')})
           RETURNING id`,
          Object.values(zoneRecord)
        );
        zoneId = insertResult.id;
        this.log(`开发区创建成功: ${zoneInfo.name} (ID: ${zoneId})`);
      } catch (error) {
        // 检查是否是重复插入
        if (error.message.includes('duplicate key')) {
          this.log(`开发区已存在，跳过: ${zoneInfo.name}`, 'warn');
          return true;
        }
        throw error;
      }

      // 迁移地理数据
      const geoDataRecords = this.convertGeoData(actualGeoJson, zoneId, zoneInfo.name);
      if (geoDataRecords.length > 0) {
        for (const record of geoDataRecords) {
          try {
            await connection.none(
              `INSERT INTO geo_data (zone_id, geometry, properties, class_type, feature_name, area_hectares, created_at)
               VALUES ($1, ST_GeomFromGeoJSON($2), $3, $4, $5, $6, $7)`,
              [record.zone_id, record.geometry, JSON.stringify(record.properties), record.class_type, record.feature_name, record.area_hectares, record.created_at]
            );
          } catch (error) {
            this.log(`地理数据插入失败 ${zoneInfo.name}: ${error.message}`, 'error');
          }
        }
        this.log(`地理数据迁移完成: ${zoneInfo.name} (${geoDataRecords.length} 个要素)`);
      }

      // 尝试读取和迁移属性数据
      const zoneDataPath = path.join(this.zoneDataPath, `${zoneInfo.name}.json`);
      const zoneData = this.readJsonFile(zoneDataPath);

      if (zoneData) {
        await this.migrateZoneData(zoneId, zoneData, zoneInfo.name);
      }

      return true;

    } catch (error) {
      this.log(`迁移失败 ${zoneInfo.name}: ${error.message}`, 'error');
      return false;
    }
  }

  // 迁移开发区属性数据
  async migrateZoneData(zoneId, zoneData, zoneName) {
    try {
      // 土地数据
      if (zoneData.landData) {
        const landRecord = {
          zone_id: zoneId,
          ...zoneData.landData,
          data_year: zoneData.metadata?.importTime ? new Date(zoneData.metadata.importTime).getFullYear() : new Date().getFullYear(),
          updated_at: new Date()
        };

        await connection.none(
          `INSERT INTO land_data (${Object.keys(landRecord).join(', ')})
           VALUES (${Object.keys(landRecord).map((_, i) => `$${i + 1}`).join(', ')})`,
          Object.values(landRecord)
        );
      }

      // 经济数据
      if (zoneData.economicData) {
        const economicRecord = {
          zone_id: zoneId,
          ...zoneData.economicData,
          data_year: new Date().getFullYear(),
          updated_at: new Date()
        };

        await connection.none(
          `INSERT INTO economic_data (${Object.keys(economicRecord).join(', ')})
           VALUES (${Object.keys(economicRecord).map((_, i) => `$${i + 1}`).join(', ')})`,
          Object.values(economicRecord)
        );
      }

      // 人口数据
      if (zoneData.populationData) {
        const populationRecord = {
          zone_id: zoneId,
          ...zoneData.populationData,
          data_year: new Date().getFullYear(),
          updated_at: new Date()
        };

        await connection.none(
          `INSERT INTO population_data (${Object.keys(populationRecord).join(', ')})
           VALUES (${Object.keys(populationRecord).map((_, i) => `$${i + 1}`).join(', ')})`,
          Object.values(populationRecord)
        );
      }

      // 建筑数据
      if (zoneData.buildingData) {
        const buildingRecord = {
          zone_id: zoneId,
          ...zoneData.buildingData,
          data_year: new Date().getFullYear(),
          updated_at: new Date()
        };

        await connection.none(
          `INSERT INTO building_data (${Object.keys(buildingRecord).join(', ')})
           VALUES (${Object.keys(buildingRecord).map((_, i) => `$${i + 1}`).join(', ')})`,
          Object.values(buildingRecord)
        );
      }

      this.log(`属性数据迁移完成: ${zoneName}`);

    } catch (error) {
      this.log(`属性数据迁移失败 ${zoneName}: ${error.message}`, 'error');
    }
  }

  // 执行完整迁移
  async migrate() {
    try {
      this.log('🚀 开始数据迁移...');

      // 检查数据库连接
      if (!connection) {
        throw new Error('数据库连接不可用');
      }

      // 初始化数据库
      const initialized = await dbManager.initialize();
      if (!initialized) {
        throw new Error('数据库初始化失败');
      }

      // 读取索引文件
      const indexData = this.readIndexFile();
      this.log(`找到 ${indexData.length} 个开发区记录`);

      if (indexData.length === 0) {
        this.log('没有找到需要迁移的数据', 'warn');
        return;
      }

      // 迁移统计
      let successCount = 0;
      let failCount = 0;

      // 逐个迁移开发区
      for (const zoneInfo of indexData) {
        const success = await this.migrateZone(zoneInfo);
        if (success) {
          successCount++;
        } else {
          failCount++;
        }
      }

      // 迁移完成
      this.log(`✅ 数据迁移完成: 成功 ${successCount} 个, 失败 ${failCount} 个`);

      // 生成迁移报告
      await this.generateMigrationReport(successCount, failCount);

      return {
        success: true,
        successCount,
        failCount,
        total: indexData.length
      };

    } catch (error) {
      this.log(`❌ 数据迁移失败: ${error.message}`, 'error');
      throw error;
    }
  }

  // 生成迁移报告
  async generateMigrationReport(successCount, failCount) {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total: successCount + failCount,
        success: successCount,
        failed: failCount
      },
      logs: this.migrationLog
    };

    const reportPath = path.join(__dirname, '..', 'migration-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    this.log(`迁移报告已生成: ${reportPath}`);
  }

  // 回滚迁移
  async rollback() {
    try {
      this.log('⚠️  开始回滚迁移...');

      if (!connection) {
        throw new Error('数据库连接不可用');
      }

      // 清理所有表数据
      await connection.none('DELETE FROM geo_data');
      await connection.none('DELETE FROM building_data');
      await connection.none('DELETE FROM population_data');
      await connection.none('DELETE FROM economic_data');
      await connection.none('DELETE FROM land_data');
      await connection.none('DELETE FROM development_zones');

      this.log('✅ 迁移回滚完成');
      return true;

    } catch (error) {
      this.log(`❌ 回滚失败: ${error.message}`, 'error');
      throw error;
    }
  }
}

// 如果直接运行此文件，执行迁移
if (require.main === module) {
  const migrator = new DataMigrator();

  migrator.migrate()
    .then(result => {
      console.log('迁移结果:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('迁移失败:', error);
      process.exit(1);
    });
}

module.exports = DataMigrator;