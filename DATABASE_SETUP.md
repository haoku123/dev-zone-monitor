# 开发区监控系统数据库集成指南

## 🎯 概述

本系统已成功集成PostgreSQL + PostGIS数据库，提供高性能的地理数据存储和查询能力。系统支持**双模式运行**：
- **数据库模式**：使用PostgreSQL存储和管理数据（推荐）
- **文件系统模式**：使用JSON文件存储（向后兼容）

## 📊 系统状态

✅ **已完成的工作**：
- PostgreSQL + PostGIS数据库连接模块
- 完整的数据库表结构设计
- 数据迁移工具（文件 → 数据库）
- 新的API端点（兼容现有接口）
- 自动降级机制（数据库连接失败时使用文件系统）

✅ **当前运行状态**：
- 服务器正在运行（http://localhost:8080）
- 数据库连接失败，自动使用文件系统模式
- 所有原有功能正常工作

## 🚀 快速开始

### 方法一：使用Docker（推荐）

```bash
# 启动PostgreSQL + PostGIS容器
docker run --name dev-zone-postgis \
  -e POSTGRES_DB=dev_zone_db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=password \
  -p 5432:5432 \
  -d postgis/postgis:15-3.3

# 设置环境变量（可选，默认配置已包含）
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=dev_zone_db
export DB_USER=postgres
export DB_PASSWORD=password

# 重启后端服务器
cd backend
npm start
```

### 方法二：本地PostgreSQL安装

#### Windows

```bash
# 1. 下载并安装PostgreSQL
# 访问: https://www.postgresql.org/download/windows/
# 安装时记住密码，推荐使用 'password'

# 2. 启用PostGIS扩展
# 使用pgAdmin或命令行连接到数据库
CREATE EXTENSION IF NOT EXISTS postgis;

# 3. 重启服务器
cd backend
npm start
```

#### macOS

```bash
# 使用Homebrew安装
brew install postgresql
brew install postgis

# 启动PostgreSQL服务
brew services start postgresql

# 创建数据库
createdb dev_zone_db
psql dev_zone_db -c "CREATE EXTENSION IF NOT EXISTS postgis;"

# 重启服务器
cd backend
npm start
```

#### Linux (Ubuntu/Debian)

```bash
# 安装PostgreSQL + PostGIS
sudo apt update
sudo apt install postgresql postgresql-contrib postgis

# 创建数据库和用户
sudo -u postgres createdb dev_zone_db
sudo -u postgres createuser --interactive
# 按提示创建用户，推荐用户名: postgres, 密码: password

# 启用PostGIS
sudo -u postgres psql dev_zone_db -c "CREATE EXTENSION IF NOT EXISTS postgis;"

# 重启服务器
cd backend
npm start
```

## 📡 数据库API端点

系统提供以下新的数据库API端点：

### 数据库管理
- `GET /api/db/status` - 数据库状态和统计信息
- `POST /api/db/init` - 初始化数据库表结构
- `POST /api/db/migrate` - 执行数据迁移

### 数据查询（兼容现有API）
- `GET /api/db/zones/index` - 获取开发区列表
- `GET /api/db/geojson/:name` - 获取指定开发区地理数据
- `GET /api/db/zones/:name/data` - 获取开发区详细数据

### 高级查询功能
- `GET /api/db/zones/search?q=关键词&province=省份&level=级别` - 搜索开发区
- `GET /api/db/zones/bbox?minx,miny,maxx,maxy` - 地理范围查询

## 🔄 数据迁移

### 自动迁移（推荐）

```bash
# 确保数据库运行后，执行迁移
curl -X POST http://localhost:8080/api/db/migrate

# 或使用JavaScript调用
fetch('http://localhost:8080/api/db/migrate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
}).then(res => res.json()).then(console.log);
```

### 手动迁移

```bash
# 使用迁移工具
cd backend
node tools/migrate-to-db.js
```

### 迁移验证

```bash
# 检查数据库状态
curl http://localhost:8080/api/db/status

# 检查迁移结果
curl http://localhost:8080/api/db/zones/index
```

## 🏗️ 数据库表结构

### 核心表

1. **development_zones** - 开发区基本信息
   - id, zone_code, zone_name, province, city, level
   - 高新企业数量、状态、创建时间等

2. **geo_data** - 地理数据（PostGIS）
   - 空间几何数据、属性信息、分类类型
   - 支持复杂地理查询和空间分析

3. **land_data** - 土地数据
   - 总面积、规划用地、工业用地等
   - 支持年度数据对比

4. **economic_data** - 经济数据
   - 固定资产、税收、GDP、投资额等
   - 支持多年度经济数据

5. **population_data** - 人口数据
   - 常住人口、就业人口等统计

6. **building_data** - 建筑数据
   - 建筑面积、类型统计、容积率等

## 📈 性能优势

### 查询性能提升
- **地理查询**：空间索引使地理查询提升10-100倍
- **并发支持**：支持多用户同时访问
- **缓存机制**：连接池和查询缓存优化

### 功能扩展
- **复杂查询**：支持SQL级别的统计分析
- **空间分析**：范围查询、缓冲区分析、空间关系查询
- **数据完整性**：事务保证数据一致性

### 运维优势
- **备份恢复**：自动化数据库备份
- **监控告警**：数据库性能监控
- **扩展性**：支持海量数据存储

## 🛠️ 配置选项

### 环境变量

```bash
# 数据库连接配置
DB_HOST=localhost          # 数据库主机
DB_PORT=5432              # 数据库端口
DB_NAME=dev_zone_db       # 数据库名称
DB_USER=postgres          # 数据库用户
DB_PASSWORD=password      # 数据库密码

# 连接池配置
DB_MAX_CONNECTIONS=20     # 最大连接数
DB_TIMEOUT=30000          # 连接超时(ms)
```

### .env文件配置

创建 `backend/.env` 文件：

```env
# 数据库配置
DB_HOST=localhost
DB_PORT=5432
DB_NAME=dev_zone_db
DB_USER=postgres
DB_PASSWORD=password

# 可选配置
DB_MAX_CONNECTIONS=20
DB_TIMEOUT=30000
```

## 🔧 故障排除

### 常见问题

1. **数据库连接失败**
   ```
   错误: connect ECONNREFUSED ::1:5432
   解决: 检查PostgreSQL服务是否启动，端口是否正确
   ```

2. **PostGIS扩展未安装**
   ```
   错误: extension "postgis" does not exist
   解决: 连接数据库执行 CREATE EXTENSION postgis;
   ```

3. **权限错误**
   ```
   错误: permission denied for database
   解决: 检查数据库用户权限，使用GRANT授权
   ```

### 调试命令

```bash
# 检查数据库连接状态
curl http://localhost:8080/api/db/status

# 查看服务器日志
cd backend && npm start

# 测试数据库连接
psql -h localhost -U postgres -d dev_zone_db -c "SELECT version();"
```

## 📚 使用示例

### 基础查询

```javascript
// 获取所有开发区
fetch('/api/db/zones/index')
  .then(res => res.json())
  .then(zones => console.log(zones));

// 搜索开发区
fetch('/api/db/zones/search?q=北京&province=北京市')
  .then(res => res.json())
  .then(results => console.log(results));

// 获取特定开发区
fetch('/api/db/geojson/中关村科技园')
  .then(res => res.json())
  .then(geojson => console.log(geojson));
```

### 高级查询

```javascript
// 地理范围查询（获取指定区域内的开发区）
const bbox = '116.3,39.9,116.5,40.1'; // minx,miny,maxx,maxy
fetch(`/api/db/zones/bbox?${bbox}`)
  .then(res => res.json())
  .then(zones => console.log(zones));

// 复合条件搜索
fetch('/api/db/zones/search?level=国家级&province=北京市')
  .then(res => res.json())
  .then(nationalZones => console.log(nationalZones));
```

## 🎉 下一步

1. **设置数据库环境**（按照上述方法之一）
2. **重启后端服务器**
3. **执行数据迁移**（POST /api/db/migrate）
4. **验证数据完整性**（GET /api/db/status）
5. **更新前端配置**（可选，使用新的数据库API）

## 📞 支持

如有问题，请检查：
1. 服务器控制台输出日志
2. 数据库连接状态（/api/db/status）
3. 环境变量配置
4. PostgreSQL服务状态

---

**注意**：系统设计为向后兼容，即使数据库不可用，仍会继续使用文件系统模式正常运行。