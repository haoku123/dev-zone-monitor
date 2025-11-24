const proj4 = require('proj4');
const ProjectionDetector = require('./projectionDetector');

/**
 * 坐标转换器 - 使用proj4js进行精确的坐标系转换
 * 支持中国坐标系的自动检测和转换
 */
class CoordinateTransformer {
  constructor() {
    this.detector = new ProjectionDetector();
    this.wgs84 = 'EPSG:4326';
    this.transformCache = new Map();
    this.stats = {
      successfulTransforms: 0,
      failedTransforms: 0,
      cachedTransforms: 0
    };
  }

  /**
   * 转换坐标从投影坐标系到WGS84
   * @param {Array|Object} coords - 坐标数据（可以是单个坐标、坐标数组或GeoJSON几何体）
   * @param {string} prjContent - PRJ文件内容
   * @param {Object} options - 转换选项
   * @returns {Array|Object} 转换后的坐标
   */
  async transformCoordinates(coords, prjContent = null, options = {}) {
    try {
      console.log('🔄 开始坐标转换...');

      // 检查是否需要转换（已经是WGS84格式）
      if (this.isWGS84Coordinate(coords)) {
        console.log('坐标已是WGS84格式，无需转换');
        return coords;
      }

      // 检测投影定义
      const projectionInfo = await this.getProjectionInfo(prjContent);
      if (!projectionInfo) {
        console.warn('⚠️ 无法检测投影，返回原始坐标');
        return coords;
      }

      // 创建缓存键
      const cacheKey = this.createCacheKey(projectionInfo.definition);

      // 执行转换
      const result = this.performTransformation(coords, projectionInfo.definition, cacheKey, options);

      this.stats.successfulTransforms++;
      console.log(`✅ 坐标转换成功，成功统计: ${this.stats.successfulTransforms}`);

      return result;

    } catch (error) {
      this.stats.failedTransforms++;
      console.error('❌ 坐标转换失败:', error.message);

      if (options.fallbackToOriginal) {
        console.log('回退到原始坐标');
        return coords;
      }

      throw error;
    }
  }

  /**
   * 获取投影信息
   * @param {string} prjContent - PRJ文件内容
   * @returns {Object|null} 投影信息
   */
  async getProjectionInfo(prjContent) {
    if (!prjContent) {
      return this.getDefaultProjection();
    }

    // 使用投影检测器自动检测
    const projectionInfo = await this.detector.detectProjectionFromPRJ(prjContent);

    if (projectionInfo) {
      // 验证投影定义
      if (this.detector.validateProjection(projectionInfo.definition)) {
        return projectionInfo;
      } else {
        console.warn(`投影定义验证失败: ${projectionInfo.name}`);
      }
    }

    // 如果自动检测失败，尝试默认投影
    return this.getDefaultProjection();
  }

  /**
   * 获取默认投影（用于回退）
   * @returns {Object} 默认投影信息
   */
  getDefaultProjection() {
    // 使用CGCS2000 3度带Zone 39作为默认
    const defaultDef = '+proj=tmerc +lat_0=0 +lon_0=117 +k=1 +x_0=39500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';

    return {
      type: 'default',
      name: 'CGCS2000_3_Degree_GK_Zone_39 (默认)',
      definition: defaultDef,
      method: 'fallback'
    };
  }

  /**
   * 检查坐标是否为WGS84格式
   * @param {Array|Object} coords - 坐标
   * @returns {boolean} 是否为WGS84
   */
  isWGS84Coordinate(coords) {
    const getFirstCoord = (coord) => {
      if (Array.isArray(coord[0])) {
        return getFirstCoord(coord[0]);
      }
      return coord;
    };

    try {
      const firstCoord = getFirstCoord(coords);
      const [x, y] = firstCoord;

      // WGS84经纬度范围检查
      return (x >= -180 && x <= 180 && y >= -90 && y <= 90);
    } catch (error) {
      return false;
    }
  }

  /**
   * 执行实际的坐标转换
   * @param {Array|Object} coords - 输入坐标
   * @param {string} projDef - 投影定义
   * @param {string} cacheKey - 缓存键
   * @param {Object} options - 选项
   * @returns {Array|Object} 转换结果
   */
  performTransformation(coords, projDef, cacheKey, options) {
    // 注册投影定义（如果尚未注册）
    if (!proj4.defs[cacheKey]) {
      proj4.defs(cacheKey, projDef);
    }

    // 根据输入类型进行转换
    if (this.isGeoJSONGeometry(coords)) {
      return this.transformGeoJSONGeometry(coords, cacheKey);
    } else if (this.isCoordinateArray(coords)) {
      return this.transformCoordinateArray(coords, cacheKey);
    } else {
      throw new Error('不支持的坐标格式');
    }
  }

  /**
   * 转换GeoJSON几何体
   * @param {Object} geometry - GeoJSON几何体
   * @param {string} sourceProj - 源投影
   * @returns {Object} 转换后的几何体
   */
  transformGeoJSONGeometry(geometry, sourceProj) {
    const transformedGeometry = { ...geometry };

    switch (geometry.type) {
      case 'Point':
        transformedGeometry.coordinates = this.transformSinglePoint(
          geometry.coordinates, sourceProj
        );
        break;

      case 'LineString':
      case 'MultiPoint':
        transformedGeometry.coordinates = this.transformCoordinateArray(
          geometry.coordinates, sourceProj
        );
        break;

      case 'Polygon':
        transformedGeometry.coordinates = geometry.coordinates.map(ring =>
          this.transformCoordinateArray(ring, sourceProj)
        );
        break;

      case 'MultiPolygon':
        transformedGeometry.coordinates = geometry.coordinates.map(polygon =>
          polygon.map(ring => this.transformCoordinateArray(ring, sourceProj))
        );
        break;

      case 'MultiLineString':
        transformedGeometry.coordinates = geometry.coordinates.map(line =>
          this.transformCoordinateArray(line, sourceProj)
        );
        break;

      case 'GeometryCollection':
        transformedGeometry.geometries = geometry.geometries.map(geom =>
          this.transformGeoJSONGeometry(geom, sourceProj)
        );
        break;

      default:
        console.warn(`不支持的几何类型: ${geometry.type}`);
    }

    return transformedGeometry;
  }

  /**
   * 转换坐标数组
   * @param {Array} coords - 坐标数组
   * @param {string} sourceProj - 源投影
   * @returns {Array} 转换后的坐标
   */
  transformCoordinateArray(coords, sourceProj) {
    return coords.map(coord => {
      if (Array.isArray(coord[0])) {
        // 递归处理嵌套数组
        return this.transformCoordinateArray(coord, sourceProj);
      } else {
        // 转换单个坐标点
        return this.transformSinglePoint(coord, sourceProj);
      }
    });
  }

  /**
   * 转换单个坐标点
   * @param {Array} point - 坐标点 [x, y]
   * @param {string} sourceProj - 源投影
   * @returns {Array} 转换后的坐标点
   */
  transformSinglePoint(point, sourceProj) {
    try {
      const [x, y] = point;

      // 使用缓存的转换函数
      let transformFunction = this.transformCache.get(sourceProj);
      if (!transformFunction) {
        transformFunction = (x, y) => proj4(sourceProj, this.wgs84, [x, y]);
        this.transformCache.set(sourceProj, transformFunction);
        this.stats.cachedTransforms++;
      }

      const transformed = transformFunction(x, y);

      // 验证转换结果
      if (!this.isValidWGS84Coordinate(transformed)) {
        console.warn(`转换结果可能无效: [${x}, ${y}] -> [${transformed[0]}, ${transformed[1]}]`);
      }

      return transformed;

    } catch (error) {
      console.error(`坐标转换失败 [${point}]:`, error.message);
      throw error;
    }
  }

  /**
   * 检查是否为有效的WGS84坐标
   * @param {Array} coord - 坐标
   * @returns {boolean} 是否有效
   */
  isValidWGS84Coordinate(coord) {
    if (!Array.isArray(coord) || coord.length < 2) {
      return false;
    }

    const [lng, lat] = coord;

    // 经度范围: -180 到 180
    // 纬度范围: -90 到 90
    return lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90 &&
           !isNaN(lng) && !isNaN(lat) && isFinite(lng) && isFinite(lat);
  }

  /**
   * 检查是否为GeoJSON几何体
   * @param {Object} obj - 对象
   * @returns {boolean} 是否为GeoJSON几何体
   */
  isGeoJSONGeometry(obj) {
    return obj && typeof obj === 'object' &&
           obj.type && obj.coordinates &&
           ['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString',
            'MultiPolygon', 'GeometryCollection'].includes(obj.type);
  }

  /**
   * 检查是否为坐标数组
   * @param {Array} arr - 数组
   * @returns {boolean} 是否为坐标数组
   */
  isCoordinateArray(arr) {
    if (!Array.isArray(arr)) {
      return false;
    }

    // 检查是否为坐标点 [x, y]
    if (arr.length >= 2 && typeof arr[0] === 'number' && typeof arr[1] === 'number') {
      return true;
    }

    // 检查是否为坐标数组 [[x, y], [x, y], ...]
    if (arr.length > 0 && Array.isArray(arr[0])) {
      return arr.every(coord => Array.isArray(coord) &&
                               coord.length >= 2 &&
                               typeof coord[0] === 'number' &&
                               typeof coord[1] === 'number');
    }

    return false;
  }

  /**
   * 创建缓存键
   * @param {string} projDef - 投影定义
   * @returns {string} 缓存键
   */
  createCacheKey(projDef) {
    // 使用哈希或截取方式创建简短的缓存键
    const hash = this.simpleHash(projDef);
    return `proj_${hash}`;
  }

  /**
   * 简单哈希函数
   * @param {string} str - 输入字符串
   * @returns {string} 哈希值
   */
  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * 批量转换坐标
   * @param {Array} coordinateList - 坐标列表
   * @param {string} prjContent - PRJ内容
   * @param {Object} options - 选项
   * @returns {Array} 转换结果
   */
  async batchTransform(coordinateList, prjContent, options = {}) {
    console.log(`🔄 开始批量转换 ${coordinateList.length} 个坐标...`);

    const results = [];
    const batchSize = options.batchSize || 100;

    // 获取投影信息（只需要检测一次）
    const projectionInfo = await this.getProjectionInfo(prjContent);
    if (!projectionInfo) {
      throw new Error('无法���取投影信息');
    }

    const cacheKey = this.createCacheKey(projectionInfo.definition);

    // 分批处理
    for (let i = 0; i < coordinateList.length; i += batchSize) {
      const batch = coordinateList.slice(i, i + batchSize);
      const batchResults = batch.map(coord => {
        try {
          return this.transformSinglePoint(coord, cacheKey);
        } catch (error) {
          console.error(`坐标 ${i} 转换失败:`, error.message);
          return options.includeFailures ? { error: error.message, original: coord } : null;
        }
      });

      results.push(...batchResults.filter(result => result !== null));

      // 进度报告
      if (options.onProgress) {
        options.onProgress(Math.min(i + batchSize, coordinateList.length), coordinateList.length);
      }
    }

    console.log(`✅ 批量转换完成，成功: ${results.length}/${coordinateList.length}`);
    return results;
  }

  /**
   * 获取转换统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      ...this.stats,
      cacheSize: this.transformCache.size,
      memoryUsage: process.memoryUsage()
    };
  }

  /**
   * 清理缓存
   */
  clearCache() {
    this.transformCache.clear();
    console.log('🧹 坐标转换缓存已清理');
  }

  /**
   * 估算转换时间
   * @param {number} coordinateCount - 坐标数量
   * @returns {number} 估算时间（毫秒）
   */
  estimateTransformTime(coordinateCount) {
    // 基于经验值的简单估算
    const timePerCoord = 0.1; // 每个坐标大约0.1ms
    return Math.ceil(coordinateCount * timePerCoord);
  }

  /**
   * 验证转换结果
   * @param {Array} originalCoords - 原始坐标
   * @param {Array} transformedCoords - 转换后坐标
   * @param {string} projDef - 投影定义
   * @returns {Object} 验证结果
   */
  validateTransform(originalCoords, transformedCoords, projDef) {
    try {
      // 反向转换验证
      const cacheKey = this.createCacheKey(projDef);
      const reversed = this.transformSinglePoint(transformedCoords, `EPSG:4326`);
      const backTransformed = proj4(this.wgs84, cacheKey, reversed);

      const tolerance = 0.001; // 米级精度
      const isAccurate = Math.abs(originalCoords[0] - backTransformed[0]) < tolerance &&
                        Math.abs(originalCoords[1] - backTransformed[1]) < tolerance;

      return {
        isValid: isAccurate,
        originalError: [
          Math.abs(originalCoords[0] - backTransformed[0]),
          Math.abs(originalCoords[1] - backTransformed[1])
        ],
        tolerance: tolerance
      };
    } catch (error) {
      return {
        isValid: false,
        error: error.message
      };
    }
  }
}

module.exports = CoordinateTransformer;