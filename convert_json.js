const fs = require('fs');
const path = require('path');

const zoneDataDir = 'd:\\桌面\\dev-zone-monitor\\backend\\uploads\\zone-data';

function generateZoneCode(fileName) {
    const nameWithoutExt = fileName.replace('.json', '');
    // 根据文件名生成zoneCode的逻辑
    if (nameWithoutExt.includes('北京')) return 'BJ_KFQ';
    if (nameWithoutExt.includes('中关村')) return 'ZGC_KJY';
    if (nameWithoutExt.includes('苏州')) return 'SUZ_GXQ';
    if (nameWithoutExt.includes('合肥')) {
        if (nameWithoutExt.includes('高新')) return 'HF_GXQ';
        return 'HF_KFQ';
    }
    if (nameWithoutExt.includes('南京')) return 'NJ_KFQ';
    if (nameWithoutExt.includes('哈尔滨')) {
        if (nameWithoutExt.includes('保税')) return 'HEB_ZSB';
        return 'HEB_LM';
    }
    if (nameWithoutExt.includes('安徽绩溪')) return 'AH_JX';
    if (nameWithoutExt.includes('广东普宁')) return 'GD_PN';
    if (nameWithoutExt.includes('广州番禺')) return 'GZ_PY';
    if (nameWithoutExt.includes('广西梧州')) return 'GX_WZ';
    if (nameWithoutExt.includes('成都')) return 'CD_RL';
    if (nameWithoutExt.includes('抚州')) return 'FZ_GX';
    if (nameWithoutExt.includes('昆山')) return 'KS_ZSB';
    if (nameWithoutExt.includes('汉川')) return 'HC_KFQ';
    if (nameWithoutExt.includes('海口')) return 'HK_GX';
    if (nameWithoutExt.includes('湖南邵阳')) return 'HN_SY';
    if (nameWithoutExt.includes('珲春')) return 'HC_BH';
    if (nameWithoutExt.includes('福建屏南')) return 'FJ_PN';
    if (nameWithoutExt.includes('郴州')) return 'CZ_GX';
    if (nameWithoutExt.includes('贵州遵义')) return 'GZ_ZY';

    // 默认情况下，使用首字母缩写
    const chars = nameWithoutExt.split('');
    let code = '';
    for (let char of chars) {
        if (char.match(/[\u4e00-\u9fa5]/)) {
            code += char;
            if (code.length >= 4) break;
        }
    }
    return code.toUpperCase();
}

function convertJsonFile(filePath) {
    try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const fileName = path.basename(filePath);

        // 提取高新企业数量
        const highTechEnterprises = data.enterpriseData?.highTechEnterprises || 0;

        // 保留原有数据
        const existingLandData = data.landData || {};
        const existingEconomicData = data.economicData || {};
        const existingBuildingData = data.buildingData || {};

        // 创建新的JSON结构
        const newStructure = {
            zoneCode: generateZoneCode(fileName),
            areaName: data.areaName || '',
            highTechEnterprises: highTechEnterprises,
            landData: {
                approvedArea: existingLandData.approvedArea || 0,
                developmentArea: existingLandData.developmentArea || 0,
                builtArea: existingLandData.builtArea || 0,
                industrialArea: existingLandData.industrialArea || 0,
                availableArea: 0,
                reservedArea: 0,
                transferArea: 0,
                leaseArea: 0,
                greenArea: 0,
                infrastructureArea: 0,
                publicFacilitiesArea: 0,
                otherArea: 0
            },
            populationData: {
                residentPopulation: 0
            },
            economicData: {
                fixedAssetInvestment: existingEconomicData.fixedAssetInvestment || 0,
                industrialOutput: existingEconomicData.industrialOutput || 0,
                totalTax: existingEconomicData.totalTax || 0,
                gdp: 0
            },
            buildingData: {
                totalBuildingArea: existingBuildingData.totalBuildingArea || 0,
                industrialBuildingArea: existingBuildingData.industrialBuildingArea || 0
            },
            buildingBaseData: {
                buildingBaseArea: 0,
                buildingCoverage: 0
            }
        };

        // 写入新结构
        fs.writeFileSync(filePath, JSON.stringify(newStructure, null, 2), 'utf8');
        console.log(`已更新: ${fileName} -> zoneCode: ${newStructure.zoneCode}`);

    } catch (error) {
        console.error(`处理文件 ${filePath} 时出错:`, error.message);
    }
}

// 读取目录下的所有JSON文件
fs.readdir(zoneDataDir, (err, files) => {
    if (err) {
        console.error('读取目录时出错:', err);
        return;
    }

    const jsonFiles = files.filter(file => file.endsWith('.json'));

    console.log(`找到 ${jsonFiles.length} 个JSON文件，开始转换...`);

    jsonFiles.forEach(file => {
        const filePath = path.join(zoneDataDir, file);
        convertJsonFile(filePath);
    });

    console.log('转换完成！');
});