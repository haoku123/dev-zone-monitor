const fs = require('fs');
const path = require('path');

function findZoneDataFile(areaName) {
  const safeFileName = areaName.replace(/[^\w\u4e00-\u9fa5]/g, '_');
  const zoneDataDir = path.join(__dirname, 'backend', 'uploads', 'zone-data');

  console.log(`查找文件: ${areaName}`);
  console.log(`安全文件名: ${safeFileName}`);
  console.log(`目录: ${zoneDataDir}`);

  // 1. 首先尝试精确匹配
  let filePath = path.join(zoneDataDir, `${safeFileName}.json`);
  console.log(`尝试精确匹配: ${filePath}`);
  console.log(`文件存在: ${fs.existsSync(filePath)}`);

  if (fs.existsSync(filePath)) {
    return filePath;
  }

  // 2. 尝试查找带时间戳的文件
  try {
    const files = fs.readdirSync(zoneDataDir);
    console.log(`目录中的文件数量: ${files.length}`);

    const matchingFiles = files.filter(file => {
      const baseName = file.replace(/\.json$/, '');
      const startsWith = baseName.startsWith(safeFileName + '_');
      const timestampCheck = /^\d+$/.test(baseName.substring(safeFileName.length + 1));

      if (startsWith) {
        console.log(`匹配文件: ${file}, startsWith: ${startsWith}, timestampCheck: ${timestampCheck}`);
      }

      return startsWith && timestampCheck;
    });

    console.log(`匹配的文��数量: ${matchingFiles.length}`);
    console.log(`匹配的文件: ${matchingFiles.join(', ')}`);

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

// 测试几个不同的开发区名称
const testAreas = [
  '安徽安庆迎江经济开发区',
  '安徽绩溪经济开发区',
  '北京经济技术开发区'
];

testAreas.forEach(area => {
  console.log('\n' + '='.repeat(50));
  const result = findZoneDataFile(area);
  console.log(`最终结果: ${result || '未找到'}`);
});