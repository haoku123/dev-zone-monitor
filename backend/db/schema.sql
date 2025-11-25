-- 开发区监控系统数据库表结构
-- 适用于 PostgreSQL + PostGIS

-- 启用必要的扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- 开发区基本信息表
CREATE TABLE IF NOT EXISTS development_zones (
    id SERIAL PRIMARY KEY,
    zone_code VARCHAR(50) UNIQUE,                           -- 开发区代码
    zone_name VARCHAR(200) NOT NULL,                         -- 开发区名称
    province VARCHAR(100),                                   -- 省份
    city VARCHAR(100),                                       -- 城市
    district VARCHAR(100),                                   -- 区县
    level VARCHAR(50),                                       -- 级别（国家级、省级等）
    zone_type VARCHAR(50),                                   -- 开发区类型（经济开发区、高新技术产业开发区、综合保税区、其他开发区）
    high_tech_enterprises INTEGER DEFAULT 0,                -- 高新企业数量
    status VARCHAR(20) DEFAULT 'active',                     -- 状态（active/inactive/deleted）
    source VARCHAR(50) DEFAULT 'manual',                     -- 数据来源
    upload_time TIMESTAMP,                                   -- 上传时间
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建开发区基本信息表索引
CREATE INDEX IF NOT EXISTS idx_development_zones_name ON development_zones (zone_name);
CREATE INDEX IF NOT EXISTS idx_development_zones_province ON development_zones (province);
CREATE INDEX IF NOT EXISTS idx_development_zones_status ON development_zones (status);
CREATE INDEX IF NOT EXISTS idx_development_zones_code ON development_zones (zone_code);

-- 地理数据表（使用PostGIS）
CREATE TABLE IF NOT EXISTS geo_data (
    id SERIAL PRIMARY KEY,
    zone_id INTEGER REFERENCES development_zones(id) ON DELETE CASCADE,
    geometry GEOMETRY(MULTIPOLYGON, 4326),                   -- 地理几何数据
    properties JSONB,                                       -- 属性数据
    class_type INTEGER,                                     -- 土地利用类型分类
    feature_name VARCHAR(200),                              -- 要素名称
    area_acres DECIMAL(10,2),                               -- 面积（亩）
    area_hectares DECIMAL(10,2),                            -- 面积（公顷）
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建地理数据表空间索引（关键性能优化）
CREATE INDEX IF NOT EXISTS idx_geo_data_geometry ON geo_data USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_geo_data_zone_id ON geo_data (zone_id);
CREATE INDEX IF NOT EXISTS idx_geo_data_class_type ON geo_data (class_type);

-- 土地数据表
CREATE TABLE IF NOT EXISTS land_data (
    id SERIAL PRIMARY KEY,
    zone_id INTEGER REFERENCES development_zones(id) ON DELETE CASCADE,
    total_land_area DECIMAL(10,2),                          -- 总面积(公顷)
    planning_construction_land DECIMAL(10,2),               -- 规划建设用地
    built_urban_construction_land DECIMAL(10,2),            -- 已建城镇建设用地
    industrial_storage_land DECIMAL(10,2),                 -- 工矿仓储用地
    idle_land_area DECIMAL(10,2),                           -- 闲置土地
    green_land_area DECIMAL(10,2),                          -- 绿化用地
    road_land_area DECIMAL(10,2),                           -- 道路用地
    data_year INTEGER,                                       -- 数据年份
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 经济数据表
CREATE TABLE IF NOT EXISTS economic_data (
    id SERIAL PRIMARY KEY,
    zone_id INTEGER REFERENCES development_zones(id) ON DELETE CASCADE,
    total_fixed_assets DECIMAL(15,2),                       -- 固定资产总计(万元)
    total_tax DECIMAL(15,2),                                -- 税收总计(万元)
    total_enterprise_revenue DECIMAL(15,2),                 -- 企业总收入(万元)
    industrial_output_value DECIMAL(15,2),                  -- 工业总产值(万元)
    gdp DECIMAL(15,2),                                      -- GDP(万元)
    investment_amount DECIMAL(15,2),                        -- 投资额(万元)
    export_value DECIMAL(15,2),                             -- 出口额(万元)
    data_year INTEGER,                                       -- 数据年份
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 人口数据表
CREATE TABLE IF NOT EXISTS population_data (
    id SERIAL PRIMARY KEY,
    zone_id INTEGER REFERENCES development_zones(id) ON DELETE CASCADE,
    resident_population INTEGER DEFAULT 0,                  -- 常住人口
    employed_population INTEGER DEFAULT 0,                  -- 就业人口
    registered_population INTEGER DEFAULT 0,                -- 户籍人口
    floating_population INTEGER DEFAULT 0,                  -- 流动人口
    data_year INTEGER,                                       -- 数据年份
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 建筑数据表
CREATE TABLE IF NOT EXISTS building_data (
    id SERIAL PRIMARY KEY,
    zone_id INTEGER REFERENCES development_zones(id) ON DELETE CASCADE,
    total_building_area DECIMAL(10,2),                      -- 总建筑面积(万㎡)
    industrial_storage_building_area DECIMAL(10,2),         -- 工矿仓储建筑面积
    residential_building_area DECIMAL(10,2),                -- 住宅建筑面积
    commercial_building_area DECIMAL(10,2),                 -- 商业建筑面积
    office_building_area DECIMAL(10,2),                     -- 办公建筑面积
    building_coverage_rate DECIMAL(5,2),                    -- 建筑覆盖率(%)
    floor_area_ratio DECIMAL(5,2),                          -- 容积率
    data_year INTEGER,                                       -- 数据年份
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_land_data_zone_id ON land_data (zone_id);
CREATE INDEX IF NOT EXISTS idx_economic_data_zone_id ON economic_data (zone_id);
CREATE INDEX IF NOT EXISTS idx_population_data_zone_id ON population_data (zone_id);
CREATE INDEX IF NOT EXISTS idx_building_data_zone_id ON building_data (zone_id);
CREATE INDEX IF NOT EXISTS idx_economic_data_year ON economic_data (data_year);
CREATE INDEX IF NOT EXISTS idx_population_data_year ON population_data (data_year);
CREATE INDEX IF NOT EXISTS idx_building_data_year ON building_data (data_year);

-- 添加更新时间戳触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为需要的表添加更新时间戳触发器
CREATE TRIGGER update_development_zones_updated_at BEFORE UPDATE ON development_zones FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_land_data_updated_at BEFORE UPDATE ON land_data FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_economic_data_updated_at BEFORE UPDATE ON economic_data FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_population_data_updated_at BEFORE UPDATE ON population_data FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_building_data_updated_at BEFORE UPDATE ON building_data FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 插入一些示例数据（可选）
-- INSERT INTO development_zones (zone_name, province, city, zone_code, level)
-- VALUES
--   ('示例开发区', '北京市', '北京市', 'BJ001', '国家级'),
--   ('测试开发区', '上海市', '上海市', 'SH001', '省级')
-- ON CONFLICT (zone_code) DO NOTHING;