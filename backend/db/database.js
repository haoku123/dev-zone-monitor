const fs = require('fs');
const path = require('path');
const { connection, testConnection } = require('./connection');

class DatabaseManager {
  constructor() {
    this.connection = connection;
    this.initialized = false;
  }

  // 初始化数据库
  async initialize() {
    if (!this.connection) {
      console.log('数据库连接不可用，跳过数据库初始化');
      return false;
    }

    try {
      console.log('开始初始化数据库...');

      // 读取并执行SQL文件
      const schemaPath = path.join(__dirname, 'schema.sql');
      const schemaSql = fs.readFileSync(schemaPath, 'utf-8');

      // 分割SQL语句并执行
      const statements = schemaSql
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

      for (const statement of statements) {
        try {
          await this.connection.none(statement);
        } catch (error) {
          // 忽略IF NOT EXISTS的错误
          if (!error.message.includes('already exists')) {
            console.warn('SQL执行警告:', error.message);
          }
        }
      }

      this.initialized = true;
      console.log('✅ 数据库初始化完成');
      return true;

    } catch (error) {
      console.error('❌ 数据库初始化失败:', error);
      return false;
    }
  }

  // 检查数据库状态
  async checkStatus() {
    if (!this.connection) {
      return {
        status: 'disconnected',
        message: '数据库连接不可用',
        tables: []
      };
    }

    try {
      // 检查连接
      const connectionTest = await testConnection();
      if (!connectionTest.success) {
        return {
          status: 'error',
          message: connectionTest.message,
          tables: []
        };
      }

      // 检查表是否存在
      const tablesQuery = `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `;

      const tables = await this.connection.many(tablesQuery);
      const tableNames = tables.map(t => t.table_name);

      // 检查是否有数据
      const zoneCount = await this.connection.oneOrNone(
        'SELECT COUNT(*) as count FROM development_zones',
        [],
        d => d ? parseInt(d.count) : 0
      );

      return {
        status: 'connected',
        message: '数据库连接正常',
        initialized: this.initialized,
        tables: tableNames,
        zoneCount: zoneCount,
        hasPostGIS: tableNames.includes('geo_data')
      };

    } catch (error) {
      return {
        status: 'error',
        message: error.message,
        tables: []
      };
    }
  }

  // 清理数据库（谨慎使用）
  async clearDatabase() {
    if (!this.connection) {
      throw new Error('数据库连接不可用');
    }

    try {
      console.log('⚠️  正在清理数据库...');

      // 按依赖关系删除表数据
      await this.connection.none('DELETE FROM geo_data');
      await this.connection.none('DELETE FROM building_data');
      await this.connection.none('DELETE FROM population_data');
      await this.connection.none('DELETE FROM economic_data');
      await this.connection.none('DELETE FROM land_data');
      await this.connection.none('DELETE FROM development_zones');

      console.log('✅ 数据库清理完成');
      return true;

    } catch (error) {
      console.error('❌ 数据库清理失败:', error);
      throw error;
    }
  }

  // 备份数据库
  async backupDatabase() {
    if (!this.connection) {
      throw new Error('数据库连接不可用');
    }

    try {
      console.log('🔄 正在备份数据库...');

      const backup = {
        timestamp: new Date().toISOString(),
        development_zones: await this.connection.many('SELECT * FROM development_zones'),
        geo_data: await this.connection.many('SELECT * FROM geo_data'),
        land_data: await this.connection.many('SELECT * FROM land_data'),
        economic_data: await this.connection.many('SELECT * FROM economic_data'),
        population_data: await this.connection.many('SELECT * FROM population_data'),
        building_data: await this.connection.many('SELECT * FROM building_data')
      };

      // 保存备份文件
      const backupDir = path.join(__dirname, '..', 'backups');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      const backupFile = path.join(backupDir, `backup_${Date.now()}.json`);
      fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));

      console.log(`✅ 数据库备份完成: ${backupFile}`);
      return backupFile;

    } catch (error) {
      console.error('❌ 数据库备份失败:', error);
      throw error;
    }
  }

  // 获取统计信息
  async getStatistics() {
    if (!this.connection) {
      return null;
    }

    try {
      const stats = await this.connection.one(`
        SELECT
          (SELECT COUNT(*) FROM development_zones WHERE status = 'active') as active_zones,
          (SELECT COUNT(*) FROM development_zones) as total_zones,
          (SELECT COUNT(*) FROM geo_data) as geo_features,
          (SELECT COUNT(DISTINCT province) FROM development_zones WHERE province IS NOT NULL) as provinces
      `);

      return stats;

    } catch (error) {
      console.error('获取统计信息失败:', error);
      return null;
    }
  }
}

// 创建单例实例
const dbManager = new DatabaseManager();

module.exports = dbManager;