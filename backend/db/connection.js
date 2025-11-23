const pgp = require('pg-promise')({
  capSQL: true,
  error(error) {
    console.error('Database Error:', error);
  }
});

// 数据库配置
const getDatabaseConfig = () => {
  // 检查是否设置了PostgreSQL环境变量
  if (process.env.DB_HOST && process.env.DB_NAME) {
    console.log('使用 PostgreSQL 数据库');
    return {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      max: 20, // 连接池最大连接数
      idleTimeoutMillis: 30000, // 空闲超时
      connectionTimeoutMillis: 2000, // 连接超时
    };
  }

  // 默认使用PostgreSQL配置（开发环境）
  console.log('使用默认 PostgreSQL 配置');
  return {
    host: 'localhost',
    port: 5432,
    database: 'dev_zone_db',
    user: 'postgres',
    password: 'password',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  };
};

// 创建数据库连接
const config = getDatabaseConfig();
let connection;

try {
  connection = pgp(config);
  console.log('数据库连接配置已创建');
} catch (error) {
  console.error('创建数据库连接失败:', error);
  console.log('将使用文件系统作为备用方案');
  connection = null;
}

// 数据库连接测试
const testConnection = async () => {
  if (!connection) {
    return { success: false, message: '数据库连接未初始化' };
  }

  try {
    const result = await connection.one('SELECT NOW() as current_time');
    console.log('数据库连接测试成功:', result.current_time);
    return { success: true, message: '连接正常', data: result };
  } catch (error) {
    console.error('数据库连接测试失败:', error);
    return { success: false, message: error.message };
  }
};

// 获取连接状态
const getConnectionStatus = () => {
  return {
    connected: !!connection,
    config: config,
    type: connection ? 'PostgreSQL' : 'File System'
  };
};

module.exports = {
  connection,
  testConnection,
  getConnectionStatus,
  pgp
};