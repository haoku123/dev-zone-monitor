const proj4 = require('proj4');
const fs = require('fs');

/**
 * 投影检测器 - 自动识别PRJ文件中的投影信息
 * 支持中国��标系，包括CGCS2000、西安80、北京54等
 */
class ProjectionDetector {
  constructor() {
    this.initializeChineseEPSGCodes();
    this.epsgCache = new Map();
  }

  /**
   * 初始化中国坐标系EPSG代码定义
   */
  initializeChineseEPSGCodes() {
    // CGCS2000坐标系定义
    const cgcs2000Defs = {
      // CGCS2000 3度带高斯投影
      'EPSG:4523': '+proj=tmerc +lat_0=0 +lon_0=75 +k=1 +x_0=25500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'EPSG:4524': '+proj=tmerc +lat_0=0 +lon_0=78 +k=1 +x_0=28500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'EPSG:4525': '+proj=tmerc +lat_0=0 +lon_0=81 +k=1 +x_0=31500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'EPSG:4526': '+proj=tmerc +lat_0=0 +lon_0=84 +k=1 +x_0=34500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'EPSG:4527': '+proj=tmerc +lat_0=0 +lon_0=117 +k=1 +x_0=39500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs', // Zone 39
      'EPSG:4528': '+proj=tmerc +lat_0=0 +lon_0=120 +k=1 +x_0=40500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'EPSG:4529': '+proj=tmerc +lat_0=0 +lon_0=123 +k=1 +x_0=43500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'EPSG:4530': '+proj=tmerc +lat_0=0 +lon_0=126 +k=1 +x_0=46500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'EPSG:4531': '+proj=tmerc +lat_0=0 +lon_0=129 +k=1 +x_0=49500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'EPSG:4532': '+proj=tmerc +lat_0=0 +lon_0=132 +k=1 +x_0=52500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
      'EPSG:4533': '+proj=tmerc +lat_0=0 +lon_0=135 +k=1 +x_0=55500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',

      // CGCS2000 地理坐标系
      'EPSG:4490': '+proj=longlat +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +no_defs',
    };

    // 西安1980坐标系定义
    const xian1980Defs = {
      'EPSG:4610': '+proj=longlat +a=6378140 +b=6356755.288157528 +towgs84=12.7,-131.3,-44.7,0,0,0,0 +no_defs',
    };

    // 北京1954坐标系定义
    const beijing1954Defs = {
      'EPSG:4214': '+proj=longlat +a=6378245 +b=6356863.018773047 +towgs84=12.7,-131.3,-44.7,0,0,0,0 +no_defs',
    };

    // WGS84坐标系
    const wgs84Defs = {
      'EPSG:4326': '+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs',
    };

    // 注册所有定义
    Object.assign(cgcs2000Defs, xian1980Defs, beijing1954Defs, wgs84Defs);

    Object.entries(cgcs2000Defs).forEach(([epsg, def]) => {
      proj4.defs(epsg, def);
      this.epsgCache.set(epsg, def);
    });

    console.log(`✅ 已初始化 ${Object.keys(cgcs2000Defs).length} 个中国坐标系EPSG定义`);
  }

  /**
   * 从PRJ内容检测投影
   * @param {string} prjContent - PRJ文件内容
   * @returns {Object|null} 投影检测结果
   */
  async detectProjectionFromPRJ(prjContent) {
    console.log('🔍 开始自动检测投影...');
    console.log('PRJ内容长度:', prjContent.length, '字符');

    try {
      // 1. 尝试匹配EPSG代码
      const epsgMatch = this.extractEPSGCode(prjContent);
      if (epsgMatch) {
        console.log(`✅ 检测到EPSG代码: ${epsgMatch.code}`);
        return {
          type: 'epsg',
          code: epsgMatch.code,
          definition: epsgMatch.definition,
          name: epsgMatch.name,
          method: 'epsg_direct'
        };
      }

      // 2. 尝试匹配中国坐标系
      const chinaMatch = this.detectChineseProjection(prjContent);
      if (chinaMatch) {
        console.log(`✅ 检测到中国坐标系: ${chinaMatch.name}`);
        return {
          type: 'chinese',
          ...chinaMatch,
          method: 'chinese_auto'
        };
      }

      // 3. 尝试参数解析
      const paramMatch = this.parseProjectionParameters(prjContent);
      if (paramMatch) {
        console.log(`✅ 通过参数解析生成投影定义: ${paramMatch.name}`);
        return {
          type: 'parameter',
          ...paramMatch,
          method: 'parameter_parsing'
        };
      }

      console.warn('⚠️ 无法自动识别投影，返回null');
      return null;

    } catch (error) {
      console.error('❌ 投影检测失败:', error);
      return null;
    }
  }

  /**
   * 提取EPSG代码
   * @param {string} prjContent - PRJ内容
   * @returns {Object|null} EPSG信息
   */
  extractEPSGCode(prjContent) {
    // 匹配EPSG:xxxx 格式
    const epsgPatterns = [
      /EPSG[:\s]*(\d+)/gi,
      /AUTHORITY\["EPSG","(\d+)"\]/gi,
      /epsg[:\s]*(\d+)/gi
    ];

    for (const pattern of epsgPatterns) {
      const match = prjContent.match(pattern);
      if (match) {
        const epsgCode = parseInt(match[1].replace(/\D/g, ''));
        const definition = proj4.defs(`EPSG:${epsgCode}`);

        if (definition) {
          return {
            code: epsgCode,
            definition: definition,
            name: `EPSG:${epsgCode}`
          };
        }
      }
    }

    return null;
  }

  /**
   * 检测中国坐标系
   * @param {string} prjContent - PRJ内容
   * @returns {Object|null} 中国投影信息
   */
  detectChineseProjection(prjContent) {
    const content = prjContent.toUpperCase();

    // CGCS2000 3度带检测
    if (content.includes('CGCS2000') && content.includes('3_DEGREE') && content.includes('GK')) {
      // 提取Zone号
      const zoneMatch = content.match(/ZONE[_\s]*(\d+)/);
      const centralMeridianMatch = content.match(/CENTRAL[_\s]MERIDIAN["\s]*(\d+\.?\d*)/);

      if (zoneMatch) {
        const zone = parseInt(zoneMatch[1]);
        const centralMeridian = this.zoneToCentralMeridian(zone);
        return this.generateCGCS2000Definition(zone, centralMeridian);
      } else if (centralMeridianMatch) {
        const centralMeridian = parseFloat(centralMeridianMatch[1]);
        const zone = this.centralMeridianToZone(centralMeridian);
        return this.generateCGCS2000Definition(zone, centralMeridian);
      }
    }

    // 西安1980检测
    if (content.includes('XIAN') || content.includes('1980')) {
      const centralMeridianMatch = content.match(/CENTRAL[_\s]MERIDIAN["\s]*(\d+\.?\d*)/);
      if (centralMeridianMatch) {
        const centralMeridian = parseFloat(centralMeridianMatch[1]);
        return this.generateXian1980Definition(centralMeridian);
      }
    }

    // 北京1954检测
    if (content.includes('BEIJING') || content.includes('1954')) {
      const centralMeridianMatch = content.match(/CENTRAL[_\s]MERIDIAN["\s]*(\d+\.?\d*)/);
      if (centralMeridianMatch) {
        const centralMeridian = parseFloat(centralMeridianMatch[1]);
        return this.generateBeijing1954Definition(centralMeridian);
      }
    }

    return null;
  }

  /**
   * 解析投影参数
   * @param {string} prjContent - PRJ内容
   * @returns {Object|null} 参数解析结果
   */
  parseProjectionParameters(prjContent) {
    const parameters = this.extractParameters(prjContent);

    if (!parameters.centralMeridian) {
      return null;
    }

    // 推断椭球体
    const ellipsoid = this.inferEllipsoid(prjContent);

    // 生成proj4定义
    const proj4Def = this.generateProj4FromParameters({
      ...parameters,
      ellipsoid: ellipsoid
    });

    return {
      name: `参数解析: CM${parameters.centralMeridian}°`,
      definition: proj4Def,
      parameters: parameters
    };
  }

  /**
   * 提取投影参数
   * @param {string} prjContent - PRJ内容
   * @returns {Object} 投影参数
   */
  extractParameters(prjContent) {
    const parameters = {};

    // 中央经线
    const centralMeridianMatch = prjContent.match(/CENTRAL[_\s]MERIDIAN["\s]*(\d+\.?\d*)/i);
    if (centralMeridianMatch) {
      parameters.centralMeridian = parseFloat(centralMeridianMatch[1]);
    }

    // 假东偏移
    const falseEastingMatch = prjContent.match(/FALSE[_\s]EASTING["\s]*(\d+\.?\d*)/i);
    if (falseEastingMatch) {
      parameters.falseEasting = parseFloat(falseEastingMatch[1]);
    }

    // 假北偏移
    const falseNorthingMatch = prjContent.match(/FALSE[_\s]NORTHING["\s]*(\d+\.?\d*)/i);
    if (falseNorthingMatch) {
      parameters.falseNorthing = parseFloat(falseNorthingMatch[1]);
    }

    // 比例因子
    const scaleFactorMatch = prjContent.match(/SCALE[_\s]FACTOR["\s]*(\d+\.?\d*)/i);
    if (scaleFactorMatch) {
      parameters.scaleFactor = parseFloat(scaleFactorMatch[1]);
    }

    // 原点纬度
    const latitudeOriginMatch = prjContent.match(/LATITUDE[_\s]OF[_\s]ORIGIN["\s]*(\d+\.?\d*)/i);
    if (latitudeOriginMatch) {
      parameters.latitudeOfOrigin = parseFloat(latitudeOriginMatch[1]);
    }

    // 投影类型
    const projectionMatch = prjContent.match(/PROJECTION\["([^"]+)"\]/i);
    if (projectionMatch) {
      parameters.projection = projectionMatch[1].toLowerCase();
    }

    return parameters;
  }

  /**
   * 推断椭球体
   * @param {string} prjContent - PRJ内容
   * @returns {string} 椭球体类型
   */
  inferEllipsoid(prjContent) {
    const content = prjContent.toUpperCase();

    if (content.includes('CGCS2000') || content.includes('CHINA_2000')) {
      return 'GRS80';
    } else if (content.includes('XIAN') || content.includes('1980')) {
      return 'XIAN_1980';
    } else if (content.includes('BEIJING') || content.includes('1954')) {
      return 'BEIJING_1954';
    } else if (content.includes('WGS84')) {
      return 'WGS84';
    }

    return 'GRS80'; // 默认
  }

  /**
   * Zone号转中央经线 (3度带)
   * @param {number} zone - Zone号
   * @returns {number} 中央经线
   */
  zoneToCentralMeridian(zone) {
    return 75 + (zone - 25) * 3;
  }

  /**
   * 中央经线转Zone号 (3度带)
   * @param {number} centralMeridian - 中央经线
   * @returns {number} Zone号
   */
  centralMeridianToZone(centralMeridian) {
    return Math.round((centralMeridian - 75) / 3 + 25);
  }

  /**
   * 生成CGCS2000投影定义
   * @param {number} zone - Zone号
   * @param {number} centralMeridian - 中央经线
   * @returns {Object} 投影定义
   */
  generateCGCS2000Definition(zone, centralMeridian) {
    const falseEasting = 39500000 + (zone - 39) * 1000000;
    const definition = `+proj=tmerc +lat_0=0 +lon_0=${centralMeridian} +k=1 +x_0=${falseEasting} +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs`;

    return {
      name: `CGCS2000_3_Degree_GK_Zone_${zone}`,
      definition: definition,
      epsgCode: this.getEPSGCodeForCGCS2000(zone),
      zone: zone,
      centralMeridian: centralMeridian,
      falseEasting: falseEasting
    };
  }

  /**
   * 生成西安1980投影定义
   * @param {number} centralMeridian - 中央经线
   * @returns {Object} 投影定义
   */
  generateXian1980Definition(centralMeridian) {
    const zone = this.centralMeridianToZone(centralMeridian);
    const falseEasting = 39500000 + (zone - 39) * 1000000;
    const definition = `+proj=tmerc +lat_0=0 +lon_0=${centralMeridian} +k=1 +x_0=${falseEasting} +y_0=0 +a=6378140 +b=6356755.288157528 +towgs84=12.7,-131.3,-44.7,0,0,0,0 +units=m +no_defs`;

    return {
      name: `Xian_1980_3_Degree_GK_Zone_${zone}`,
      definition: definition,
      zone: zone,
      centralMeridian: centralMeridian,
      falseEasting: falseEasting
    };
  }

  /**
   * 生成北京1954投影定义
   * @param {number} centralMeridian - 中央经线
   * @returns {Object} 投影定义
   */
  generateBeijing1954Definition(centralMeridian) {
    const zone = this.centralMeridianToZone(centralMeridian);
    const falseEasting = 39500000 + (zone - 39) * 1000000;
    const definition = `+proj=tmerc +lat_0=0 +lon_0=${centralMeridian} +k=1 +x_0=${falseEasting} +y_0=0 +a=6378245 +b=6356863.018773047 +towgs84=12.7,-131.3,-44.7,0,0,0,0 +units=m +no_defs`;

    return {
      name: `Beijing_1954_3_Degree_GK_Zone_${zone}`,
      definition: definition,
      zone: zone,
      centralMeridian: centralMeridian,
      falseEasting: falseEasting
    };
  }

  /**
   * 根据参数生成proj4定义
   * @param {Object} parameters - 投影参数
   * @returns {string} proj4定义
   */
  generateProj4FromParameters(parameters) {
    let proj4Def = '+proj=';

    // 投影类型
    switch (parameters.projection) {
      case 'gauss_kruger':
      case 'transverse_mercator':
        proj4Def += 'tmerc';
        break;
      case 'mercator':
        proj4Def += 'merc';
        break;
      default:
        proj4Def += 'tmerc';
    }

    // ���加参数
    proj4Def += ` +lat_0=${parameters.latitudeOfOrigin || 0}`;
    proj4Def += ` +lon_0=${parameters.centralMeridian}`;
    proj4Def += ` +k=${parameters.scaleFactor || 1}`;
    proj4Def += ` +x_0=${parameters.falseEasting || 500000}`;
    proj4Def += ` +y_0=${parameters.falseNorthing || 0}`;

    // 添加椭球体参数
    switch (parameters.ellipsoid) {
      case 'GRS80':
        proj4Def += ' +ellps=GRS80 +towgs84=0,0,0,0,0,0,0';
        break;
      case 'XIAN_1980':
        proj4Def += ' +a=6378140 +b=6356755.288157528 +towgs84=12.7,-131.3,-44.7,0,0,0,0';
        break;
      case 'BEIJING_1954':
        proj4Def += ' +a=6378245 +b=6356863.018773047 +towgs84=12.7,-131.3,-44.7,0,0,0,0';
        break;
      case 'WGS84':
        proj4Def += ' +ellps=WGS84 +towgs84=0,0,0,0,0,0,0';
        break;
      default:
        proj4Def += ' +ellps=GRS80 +towgs84=0,0,0,0,0,0,0';
    }

    proj4Def += ' +units=m +no_defs';
    return proj4Def;
  }

  /**
   * 获取CGCS2000对应的EPSG代码
   * @param {number} zone - Zone号
   * @returns {number} EPSG代码
   */
  getEPSGCodeForCGCS2000(zone) {
    const epsgMap = {
      25: 4523, 26: 4524, 27: 4525, 28: 4526, 29: 4527,
      30: 4528, 31: 4529, 32: 4530, 33: 4531, 34: 4532, 35: 4533
    };
    return epsgMap[zone] || null;
  }

  /**
   * 验证投影定义
   * @param {string} proj4Def - proj4定义
   * @returns {boolean} 是否有效
   */
  validateProjection(proj4Def) {
    try {
      // 尝试注册投影定义
      const testDef = 'TEST_PROJ';
      proj4.defs(testDef, proj4Def);

      // 测试坐标转换
      const result = proj4(testDef, 'EPSG:4326', [39500000, 0]);

      // 清理测试定义
      delete proj4.defs[testDef];

      return result && result.length === 2;
    } catch (error) {
      console.warn('投影定义验证失败:', error.message);
      return false;
    }
  }
}

module.exports = ProjectionDetector;