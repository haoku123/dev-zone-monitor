<template>
  <div class="main">
    <Header
      @showChart="chartVisible = !chartVisible"
      @showExcelImport="showExcelImport"
      @showZoneManagement="showZoneManagement"
    />

    <div class="container">
      <Sidebar
        ref="menuRef"
        :area-list="areaList"
        :area-meta="areaMeta"
        @upload="handleFileUpload"
        @flyTo="flyToArea"
        @deleteGeojson="handleDeleteGeojson"
      />
      <div id="cesiumContainer" class="map"></div>

      <ChartPanel
        :visible="chartVisible"
        :data="landPotentialData"
        @close="chartVisible = false"
      />
      
      <PropertyPanel
        :visible="propertyVisible"
        :title="selectedAreaName"
        :properties="selectedProperties"
        @close="propertyVisible = false"
        @showIndicators="showIndicatorPanel"
        @showPotentials="showPotentialPanel"
        @showEditor="showEditorPanel"
      />

      <!-- Excel导入模态框 -->
      <ExcelImportModal
        :visible="excelImportVisible"
        @close="excelImportVisible = false"
        @import-success="handleImportSuccess"
      />

      <!-- 评价指标面板 -->
      <IndicatorPanel
        :visible="indicatorVisible"
        :area-name="selectedAreaName"
        @close="indicatorVisible = false"
      />

      <!-- 潜力分析面板 -->
      <PotentialPanel
        :visible="potentialVisible"
        :area-name="selectedAreaName"
        @close="potentialVisible = false"
      />

      <!-- 数据编辑面板 -->
      <ZoneDataEditor
        :visible="editorVisible"
        :area-name="selectedAreaName"
        @close="editorVisible = false"
        @saved="handleDataSaved"
      />
      
      <!-- 添加图例说明 -->
      <div class="legend" v-if="showLegend">
        <h3>土地利用类型图例</h3>
        <div class="legend-item" v-for="(color, classValue) in classColors" :key="classValue">
          <div class="color-box" :style="{backgroundColor: colorToHex(color)}"></div>
          <span>{{classNames[classValue] || `类型${classValue}`}}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import * as Cesium from 'cesium'
import * as GeoTIFF from 'geotiff'
import Header from '../components/Header.vue'
import Sidebar from '../components/Sidebar.vue'
import ChartPanel from '../components/ChartPanel.vue'
import PropertyPanel from '../components/PropertyPanel.vue'
import ExcelImportModal from '../components/ExcelImportModal.vue'
import IndicatorPanel from '../components/IndicatorPanel.vue'
import PotentialPanel from '../components/PotentialPanel.vue'
import ZoneDataEditor from '../components/ZoneDataEditor.vue'
import {
  fetchGeojsonIndex,
  fetchGeojson,
  uploadGeojson,
  deleteGeojson,
  fetchDeletedList,
  getAllZones,
  importExcel
} from '../api/api.js'

Cesium.Ion.defaultAccessToken =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJjOTdjYzE2Zi0yNWMxLTQ4ZjctODE3My03ODA4YWQwZTRiNDciLCJpZCI6MzM0ODMyLCJpYXQiOjE3NTYwMjg4NDh9.xdLdlLv6DDW-od6b9q_p7CfLQ5sOxehIb_3rvrO6j4U'

// 标签功能已移除

// 状态
const areaList = ref([])                 // 开发区名称列表
const entityMap = ref({})                // 名称 => Entity
const areaMeta = ref({})                 // 名称 => { province }
const viewerRef = ref(null)
const chartVisible = ref(false)
const propertyVisible = ref(false)       // 属性面板是否可见
const selectedAreaName = ref('')         // 选中的开发区名称
const selectedProperties = ref({})       // 选中的开发区属性
const showLegend = ref(true)             // 是否显示图例

// 新增状态
const excelImportVisible = ref(false)    // Excel导入模态框可见性
const indicatorVisible = ref(false)      // 评价指标面板可见性
const potentialVisible = ref(false)      // 潜力分析面板可见性
const editorVisible = ref(false)         // 数据编辑面板可见性
const zoneList = ref([])                 // Excel导入的开发区列表

// 土地利用类型颜色映射
const classColors = {
  0: Cesium.Color.PINK.withAlpha(0.7),        // 居住用地
  1: Cesium.Color.DARKBLUE.withAlpha(0.7),    // 商务办公用地
  2: Cesium.Color.ORANGE.withAlpha(0.7),      // 商业服务用地
  3: Cesium.Color.RED.withAlpha(0.7),         // 工业用地
  4: Cesium.Color.GRAY.withAlpha(0.7),        // 交通枢纽用地
  5: Cesium.Color.LIGHTGRAY.withAlpha(0.7),   // 机场设施用地
  6: Cesium.Color.PURPLE.withAlpha(0.7),      // 行政办公用地
  7: Cesium.Color.YELLOW.withAlpha(0.7),      // 教育用地
  8: Cesium.Color.CYAN.withAlpha(0.7),        // 医疗卫生用地
  9: Cesium.Color.BROWN.withAlpha(0.7),       // 体育与文化用地
  10: Cesium.Color.GREEN.withAlpha(0.7)       // 公园与绿地用地
}

// 土地利用类型名称映射
const classNames = {
  0: "居住用地",
  1: "商务办公用地",
  2: "商业服务用地",
  3: "工业用地",
  4: "交通枢纽用地",
  5: "机场设施用地",
  6: "行政办公用地",
  7: "教育用地",
  8: "医疗卫生用地",
  9: "体育与文化用地",
  10: "公园与绿地用地"
}

// 将Cesium颜色转换为十六进制颜色
const colorToHex = (cesiumColor) => {
  const r = Math.round(cesiumColor.red * 255);
  const g = Math.round(cesiumColor.green * 255);
  const b = Math.round(cesiumColor.blue * 255);
  return `rgba(${r}, ${g}, ${b}, ${cesiumColor.alpha})`;
}

// 根据Class属性值获取颜色
const getColorByClass = (classValue) => {
  return classColors[classValue] || Cesium.Color.YELLOW.withAlpha(0.5); // 默认黄色
}

// 用地潜力（示例数据）
const landPotentialData = ref([
  { name: '安徽绩溪经济开发区', level: 4.2 },
  { name: '郴州高新技术产业开发区', level: 3.8 },
  { name: '福建屏南工业园区', level: 3.5 },
  { name: '抚州高新技术产业开发区', level: 2.9 },
  { name: '广西梧州长洲工业园区', level: 2.1 }
])

// 默认静态 GeoJSON
const defaultGeojsonList = [
  // 已移除默认展示的开发区
]

// 初始化 + 加载数据
onMounted(async () => {
  viewerRef.value = new Cesium.Viewer('cesiumContainer', {
    animation: false,
    baseLayerPicker: false,
    fullscreenButton: false,
    geocoder: false,
    homeButton: false,
    infoBox: false,
    sceneModePicker: false,
    selectionIndicator: false,
    timeline: false,
    navigationHelpButton: false,
    navigationInstructionsInitiallyVisible: false
  })
  viewerRef.value.cesiumWidget.creditContainer.style.display = 'none'
  
  // 添加点击事件处理
  const handler = new Cesium.ScreenSpaceEventHandler(viewerRef.value.scene.canvas)
  
  // 监听点击事件
  handler.setInputAction((click) => {
    const pickedFeature = viewerRef.value.scene.pick(click.position)
    if (Cesium.defined(pickedFeature) && pickedFeature.id && pickedFeature.id.properties) {
      const properties = pickedFeature.id.properties
      const displayProps = {}
      
      // 提取属性
      for (const property in properties) {
        if (properties.hasOwnProperty(property) && typeof properties[property].getValue === 'function') {
          // 如果是SZSMC属性，跳过不显示
          if (property === 'SZSMC' || property === '_SZSMC') {
            continue;
          }
          displayProps[property] = properties[property].getValue()
        }
      }
      
      // 打印属性以便调试
      console.log('点击实体属性:', displayProps)
      
      // 设置选中的开发区名称和属性
      if (displayProps._KFQMC) {
        selectedAreaName.value = displayProps._KFQMC
      } else if (displayProps.KFQMC) {
        selectedAreaName.value = displayProps.KFQMC
      } else {
        // 尝试从实体名称或其他属性获取名称
        selectedAreaName.value = pickedFeature.id.name || pickedFeature.id.id || '未命名开发区'
        console.log('未找到_KFQMC或KFQMC属性，使用备选名称:', selectedAreaName.value)
      }
      selectedProperties.value = displayProps
      propertyVisible.value = true

      // 如果是Excel导入的开发区，可以在这里添加指标和潜力分析按钮
      // 这里先在控制台输出，后续可以在PropertyPanel中添加按钮
      console.log('点击的开发区:', selectedAreaName.value)
    } else {
      // 点击空白处关闭属性面板
      propertyVisible.value = false
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

  const seenNames = new Set()

  // 0) 已删除名单（可选）
  let deletedList = []
  try {
    deletedList = await fetchDeletedList()
  } catch (e) {
    console.warn('获取已删除列表失败，继续执行:', e.message)
    // 后端未��现可忽略
  }

  // 1) 加载后端已保存数据
  try {
    // 先获取索引文件
    const indexList = await fetchGeojsonIndex()

    // 验证返回的数据是否为数组
    if (!Array.isArray(indexList)) {
      console.warn('⚠️ 后端返回的索引数据不是数组格式:', indexList)
      console.log('跳过后端数据加载')
    } else {
      // 根据索引逐个加载开发区数据
      for (const item of indexList) {
        try {
          const areaData = await fetchGeojson(item.name)
        
        if (!areaData || !areaData.geojson) continue
        
        const dataSource = await Cesium.GeoJsonDataSource.load(areaData.geojson, { clampToGround: false })
        viewerRef.value.dataSources.add(dataSource)

        // 记录该开发区是否已添加到列表中
        let areaAdded = false;

        for (const entity of dataSource.entities.values) {
          const props = entity.properties
          const name = props?.KFQMC?.getValue?.() || areaData.name
          const province = props?.province?.getValue?.() || ''
          
          // 尝试多种可能的属性名获取Class值
          let classValue = undefined
          if (props?.Class && typeof props.Class.getValue === 'function') {
            classValue = props.Class.getValue()
          } else if (props?.class && typeof props.class.getValue === 'function') {
            classValue = props.class.getValue()
          } else if (props?.CLASS && typeof props.CLASS.getValue === 'function') {
            classValue = props.CLASS.getValue()
          }
          
          // 确保classValue是数字
          if (classValue !== undefined) {
            classValue = Number(classValue)
          }
          
          console.log(`实体 ${name} 的Class值:`, classValue)

          if (name && entity.polygon && !deletedList.includes(name)) {
            // 只有第一次遇到该名称时才添加到列表中
            if (!seenNames.has(name)) {
              areaList.value.push(name)
              entityMap.value[name] = entity
              areaMeta.value[name] = { province }
              seenNames.add(name)
              areaAdded = true;
            }
            
            // 无论是否已添加到列表，都设置颜色
            // 根据Class属性设置颜色
            if (classValue !== undefined && !isNaN(classValue)) {
              console.log(`为实体 ${name} 设置颜色:`, classValue)
              const color = getColorByClass(classValue)
              console.log(`选择的颜色:`, color)
              entity.polygon.material = new Cesium.ColorMaterialProperty(color)
            } else {
              entity.polygon.material = new Cesium.ColorMaterialProperty(Cesium.Color.YELLOW.withAlpha(0.5))
            }
            
            entity.polygon.outline = false
          }
        }
      } catch (err) {
        console.error(`❌ 加载开发区 ${item.name} 失败:`, err)
      }
    }
    } // 结束else块
  } catch (err) {
    console.error('❌ 获取后端数据失败:', err)
  }

  // 2) 加载默认静态数据（跳过已删除）
  for (const { url } of defaultGeojsonList) {
    try {
      const dataSource = await Cesium.GeoJsonDataSource.load(url, { clampToGround: false })
      viewerRef.value.dataSources.add(dataSource)

      for (const entity of dataSource.entities.values) {
        const props = entity.properties
        const name = props?.KFQMC?.getValue?.()
        const province = props?.province?.getValue?.() || ''

        if (name && entity.polygon && !seen.has(name)) {
          seen.add(name)
          
          // 检查是否已存在
          if (existingNames.has(name)) {
            duplicateCount++
            console.log(`跳过重复的开发区: ${name}`)
            continue
          }
          
          // 尝试多种可能的属性名获取Class值
          let classValue = undefined
          if (props?.Class && typeof props.Class.getValue === 'function') {
            classValue = props.Class.getValue()
          } else if (props?.class && typeof props.class.getValue === 'function') {
            classValue = props.class.getValue()
          } else if (props?.CLASS && typeof props.CLASS.getValue === 'function') {
            classValue = props.CLASS.getValue()
          }
          
          // 确保classValue是数字
          if (classValue !== undefined) {
            classValue = Number(classValue)
          }
          
          console.log(`导入的实体 ${name} 的Class值:`, classValue)
          
          // 根据Class属性设置颜色
          if (classValue !== undefined && !isNaN(classValue)) {
            console.log(`为导入的实体 ${name} 设置颜色:`, classValue)
            const color = getColorByClass(classValue)
            console.log(`选择的颜色:`, color)
            entity.polygon.material = new Cesium.ColorMaterialProperty(color)
          } else {
            entity.polygon.material = new Cesium.ColorMaterialProperty(Cesium.Color.YELLOW.withAlpha(0.5))
          }
          
          entity.polygon.outline = false

          areaList.value.push(name)
          entityMap.value[name] = entity
          areaMeta.value[name] = { province }
          newAreasCount++
          
          // 保存后端
          await uploadGeojsonHandler(name, geojson)
        }
      }

      // 只有在有新增开发区时才添加数据源和飞行
      if (newAreasCount > 0) {
        viewerRef.value.dataSources.add(dataSource)
        viewerRef.value.flyTo(dataSource)
        console.log(`✅ 成功导入 ${newAreasCount} 个新开发区`)
      }
      
      if (duplicateCount > 0) {
        console.log(`⚠️ 跳过 ${duplicateCount} 个重复的开发区`)
      }
      
    } catch (err) {
      console.error(`❌ 加载 ${url} 失败:`, err)
    }
  }
})

// 处理Excel导入成功
const handleImportSuccess = async (result) => {
  console.log('Excel导入成功:', result)

  // 重新加载开发区列表
  try {
    const zones = await getAllZones()
    zoneList.value = zones
    console.log('已加载开发区列表:', zones)
  } catch (error) {
    console.error('加载开发区列表失败:', error)
  }

  // 可以在这里添加其他处理逻辑，比如刷新地图显示等
}

// 显示Excel导入模态框
const showExcelImport = () => {
  excelImportVisible.value = true
}

// 显示评价指标面板
const showIndicatorPanel = (areaName) => {
  selectedAreaName.value = areaName
  indicatorVisible.value = true
}

// 显示潜力分析面板
const showPotentialPanel = (areaName) => {
  selectedAreaName.value = areaName
  potentialVisible.value = true
}

// 显示数据编辑面板
const showEditorPanel = (areaName) => {
  selectedAreaName.value = areaName
  editorVisible.value = true
}

// 处理数据保存
const handleDataSaved = (result) => {
  console.log('数据已保存:', result)
  // 可以在这里添加通知提示或其他后续处理
  // 例如：重新加载指标数据、更新地图显示等
}

// 显示开发区数据管理界面
const showZoneManagement = () => {
  // 这里可以显示一个列表，让用户选择要编辑的开发区
  // 现在先显示第一个开发区作为示例
  if (zoneList.value.length > 0) {
    selectedAreaName.value = zoneList.value[0].areaName
    editorVisible.value = true
  } else {
    alert('请先导入Excel数据以进行开发区数据管理')
  }
}

// 文件上传处理（导入 + 保存后端）
const uploadGeojsonHandler = async (name, geojson) => {
  try {
    return await uploadGeojson(name, geojson);
  } catch (error) {
    console.warn('⚠️ 后端保存失败，但将继续在前端显示:', error.message);
    // 即使后端保存失败，也不影响前端显示
    return null;
  }
}

const handleFileUpload = async (fileData) => {
  if (fileData.type === 'geojson') {
    // 处理多文件上传
    if (fileData.files && Array.isArray(fileData.files)) {
      // 显示上传进度信息
      console.log(`开始批量导入 ${fileData.files.length} 个GeoJSON文件...`);
      
      // 批量处理所有文件
      for (const file of fileData.files) {
        await handleGeoJsonUpload(file);
      }
      
      console.log('批量导入完成');
    }
  } else if (fileData.type === 'geotiff') {
    handleGeoTiffUpload(fileData.file);
  }
}

// 处理大型GeoJSON文件的函数
const handleLargeGeoJsonFile = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        console.log('开始处理大型GeoJSON文件...');
        // 使用更高效的方式处理大文件
        let jsonText = e.target.result;
        
        // 移除BOM和无效字符
        if (jsonText.charCodeAt(0) === 0xFEFF) {
          jsonText = jsonText.substring(1);
        }
        jsonText = jsonText.replace(/[\x00-\x1F\x7F-\x9F\u2028\u2029]/g, '');
        
        // 使用更高效的JSON解析
        const geojson = JSON.parse(jsonText);
        
        // 分批处理features以减少内存压力
        if (geojson.type === 'FeatureCollection' && Array.isArray(geojson.features)) {
          const batchSize = 100; // 每批处理的feature数量
          const totalFeatures = geojson.features.length;
          console.log(`总共 ${totalFeatures} 个features，分批处理中...`);
          
          // 创建一个数据源
          const dataSource = new Cesium.GeoJsonDataSource();
          
          // 分批处理
          for (let i = 0; i < totalFeatures; i += batchSize) {
            const batchEnd = Math.min(i + batchSize, totalFeatures);
            console.log(`处理批次 ${i+1}-${batchEnd} / ${totalFeatures}`);
            
            // 创建当前批次的GeoJSON
            const batchGeoJson = {
              type: 'FeatureCollection',
              features: geojson.features.slice(i, batchEnd)
            };
            
            // 加载当前批次
            const batchDataSource = await Cesium.GeoJsonDataSource.load(batchGeoJson, { clampToGround: false });
            
            // 合并实体到主数据源
            for (const entity of batchDataSource.entities.values) {
              dataSource.entities.add(entity);
            }
          }
          
          // 处理实体
          const seen = new Set();
          const existingNames = new Set(areaList.value);
          let newAreasCount = 0;
          let duplicateCount = 0;
          
          for (const entity of dataSource.entities.values) {
            const props = entity.properties;
            const name = props?.KFQMC?.getValue?.();
            const province = props?.province?.getValue?.() || '';
            
            if (name && entity.polygon && !seen.has(name)) {
              seen.add(name);
              
              if (existingNames.has(name)) {
                duplicateCount++;
                continue;
              }
              
              // 检查是否已存在
              if (existingNames.has(name)) {
                duplicateCount++
                console.log(`跳过重复的开发区: ${name}`)
                continue
              }
              
              // 尝试多种可能的属性名获取Class值
              let classValue = undefined
              if (props?.Class && typeof props.Class.getValue === 'function') {
                classValue = props.Class.getValue()
              } else if (props?.class && typeof props.class.getValue === 'function') {
                classValue = props.class.getValue()
              } else if (props?.CLASS && typeof props.CLASS.getValue === 'function') {
                classValue = props.CLASS.getValue()
              }
              
              // 确保classValue是数字
              if (classValue !== undefined) {
                classValue = Number(classValue)
              }
              
              console.log(`实体 ${name} 的Class值:`, classValue)
              
              // 根据Class属性设置颜色
              if (classValue !== undefined && !isNaN(classValue)) {
                console.log(`为实体 ${name} 设置颜色:`, classValue)
                const color = getColorByClass(classValue)
                console.log(`选择的颜色:`, color)
                entity.polygon.material = new Cesium.ColorMaterialProperty(color)
              } else {
                entity.polygon.material = new Cesium.ColorMaterialProperty(Cesium.Color.YELLOW.withAlpha(0.5))
              }
              
              entity.polygon.outline = false
              
              areaList.value.push(name)
              entityMap.value[name] = entity
              areaMeta.value[name] = { province }
              newAreasCount++
              
              // 标签功能已移除
              // addEntityLabel(entity, name)
              
              // 保存后端时保留完整的GeoJSON数据，包括Class属性
              await uploadGeojsonHandler(name, geojson)
            }
          }
          
          if (newAreasCount > 0) {
            viewerRef.value.dataSources.add(dataSource);
            viewerRef.value.flyTo(dataSource);
            console.log(`✅ 成功导入 ${newAreasCount} 个新开发区`);
          }
          
          if (duplicateCount > 0) {
            console.log(`⚠️ 跳过 ${duplicateCount} 个重复的开发区`);
          }
          
          resolve();
        } else {
          // 如果不是FeatureCollection，使用标准处理方式
          const dataSource = await Cesium.GeoJsonDataSource.load(geojson, { clampToGround: false });
          viewerRef.value.dataSources.add(dataSource);
          viewerRef.value.flyTo(dataSource);
          resolve();
        }
      } catch (err) {
        console.error('❌ 大型GeoJSON处理失败:', err);
        reject(err);
      }
    };
    reader.onerror = (e) => reject(e);
    reader.readAsText(file);
  });
}

const handleGeoJsonUpload = async (file) => {
  // 检查文件大小，如果超过10MB，提示用户
  if (file.size > 10 * 1024 * 1024) {
    console.warn(`⚠️ 文件 ${file.name} 大小为 ${(file.size / 1024 / 1024).toFixed(2)}MB，可能会导致解析问题`);
  }
  
  // 对于大文件，使用分块处理方式
  if (file.size > 5 * 1024 * 1024) {
    console.log(`处理大文件: ${file.name}, 大小: ${(file.size / 1024 / 1024).toFixed(2)}MB`);
    return handleLargeGeoJsonFile(file);
  }
  
  const reader = new FileReader()
  reader.onload = async (e) => {
    try {
      // 添加JSON验证和清理步骤
      let jsonText = e.target.result;
      
      // 尝试解析JSON
      let geojson;
      try {
        // 移除BOM标记（如果存在）
        if (jsonText.charCodeAt(0) === 0xFEFF) {
          jsonText = jsonText.substring(1);
        }
        
        // 移除可能导致解析错误的字符
        jsonText = jsonText.replace(/[\x00-\x1F\x7F-\x9F\u2028\u2029]/g, '');
        
        // 检查并修复JSON末尾可能的格式问题
        if (jsonText.endsWith(',]')) {
          jsonText = jsonText.replace(/,\s*\]$/g, ']');
        }
        if (jsonText.endsWith(',}')) {
          jsonText = jsonText.replace(/,\s*\}$/g, '}');
        }
        
        geojson = JSON.parse(jsonText);
      } catch (jsonError) {
        console.error('JSON解析错误:', jsonError);
        
        // 尝试修复常见的JSON问题
        console.log('尝试修复JSON格式...');
        
        // 更强力的清理
        jsonText = jsonText.replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029\uFEFF]/g, '');
        jsonText = jsonText.replace(/,\s*[\]\}]/g, match => match.substring(1));
        
        // 再次尝试解析
        try {
          geojson = JSON.parse(jsonText);
          console.log('JSON修复成功');
        } catch (retryError) {
          // 尝试使用更保守的方式处理大文件
          try {
            // 尝试提取有效的GeoJSON部分
            if (jsonText.includes('"type":"FeatureCollection"') && 
                jsonText.includes('"features":[') && 
                jsonText.includes('"geometry":')) {
              
              // 提取features数组
              const featuresStart = jsonText.indexOf('"features":[') + 11;
              const featuresEnd = jsonText.lastIndexOf(']');
              
              if (featuresStart > 0 && featuresEnd > featuresStart) {
                const featuresText = jsonText.substring(featuresStart, featuresEnd);
                
                // 构建一个最小化的GeoJSON
                const minimalGeoJson = {
                  type: "FeatureCollection",
                  features: JSON.parse('[' + featuresText + ']')
                };
                
                geojson = minimalGeoJson;
                console.log('通过提取features成功修复GeoJSON');
              } else {
                throw new Error('无法提取有效的features数组');
              }
            } else {
              // 最后尝试：如果是数组格式问题，尝试修复
              if (jsonText.includes('[') && jsonText.includes(']')) {
                try {
                  // 尝试提取有效的JSON部分
                  const validPart = jsonText.substring(
                    jsonText.indexOf('['), 
                    jsonText.lastIndexOf(']') + 1
                  );
                  geojson = JSON.parse(validPart);
                  console.log('通过提取有效部分修复JSON成功');
                } catch (finalError) {
                  throw new Error(`无法修复JSON格式: ${retryError.message}`);
                }
              } else {
                throw new Error(`无法修复JSON格式: ${retryError.message}`);
              }
            }
          } catch (finalError) {
            throw new Error(`无法修复JSON格式: ${retryError.message}`);
          }
        }
      }
      
      const dataSource = await Cesium.GeoJsonDataSource.load(geojson, { clampToGround: false })
      
      // 检查是否有新的开发区需要添加
      const seen = new Set()
      const existingNames = new Set(areaList.value) // 已存在的开发区名称集合
      let newAreasCount = 0
      let duplicateCount = 0
      
      // 先遍历所有实体，设置颜色
      for (const entity of dataSource.entities.values) {
        if (entity.polygon) {
          const props = entity.properties
          const name = props?.KFQMC?.getValue?.()
          
          // 尝试多种可能的属性名获取Class值
          let classValue = undefined
          if (props?.Class && typeof props.Class.getValue === 'function') {
            classValue = props.Class.getValue()
          } else if (props?.class && typeof props.class.getValue === 'function') {
            classValue = props.class.getValue()
          } else if (props?.CLASS && typeof props.CLASS.getValue === 'function') {
            classValue = props.CLASS.getValue()
          }
          
          // 确保classValue是数字
          if (classValue !== undefined) {
            classValue = Number(classValue)
          }
          
          console.log(`导入的实体 ${name || '未命名'} 的Class值:`, classValue)
          
          // 根据Class属性设置颜色
          if (classValue !== undefined && !isNaN(classValue)) {
            console.log(`为导入的实体 ${name || '未命名'} 设置颜色:`, classValue)
            const color = getColorByClass(classValue)
            console.log(`选择的颜色:`, color)
            entity.polygon.material = new Cesium.ColorMaterialProperty(color)
          } else {
            entity.polygon.material = new Cesium.ColorMaterialProperty(Cesium.Color.YELLOW.withAlpha(0.5))
          }
          
          entity.polygon.outline = false
        }
      }
      
      // 先添加数据源，确保颜色立即显示
      viewerRef.value.dataSources.add(dataSource)
      
      // 然后处理实体添加到列表
      for (const entity of dataSource.entities.values) {
        const props = entity.properties
        const name = props?.KFQMC?.getValue?.()
        const province = props?.province?.getValue?.() || ''

        if (name && entity.polygon && !seen.has(name)) {
          seen.add(name)
          
          // 检查是否已存在
          if (existingNames.has(name)) {
            duplicateCount++
            console.log(`跳过重复的开发区: ${name}`)
            continue
          }

          areaList.value.push(name)
          entityMap.value[name] = entity
          areaMeta.value[name] = { province }
          newAreasCount++
          
          // 保存后端
          await uploadGeojsonHandler(name, geojson)
        }
      }

      // 只有在有新增开发区时才飞行
      if (newAreasCount > 0) {
        viewerRef.value.flyTo(dataSource)
        console.log(`✅ 成功导入 ${newAreasCount} 个新开发区`)
      }
      
      if (duplicateCount > 0) {
        console.log(`⚠️ 跳过 ${duplicateCount} 个重复的开发区`)
      }
      
    } catch (err) {
      console.error('❌ GeoJSON 读取失败:', err)
    }
  }
  reader.readAsText(file)
}

const handleGeoTiffUpload = async (file) => {
  try {
    // 创建唯一名称
    const name = file.name.replace(/\.[^/.]+$/, "");
    
    // 创建一个HTML5 Canvas元素
    const canvas = document.createElement('canvas');
    canvas.width = 1024;  // 设置合适的尺寸
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    
    // 绘制一个占位符图像
    ctx.fillStyle = '#3498db';  // 蓝色背景
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('GeoTIFF', canvas.width/2, canvas.height/2 - 24);
    ctx.fillText(name, canvas.width/2, canvas.height/2 + 24);
    
    // 将Canvas转换为图像URL
    const imageUrl = canvas.toDataURL();
    
    // 创建一个实体，使用Canvas生成的图像作为材质
    const entity = viewerRef.value.entities.add({
      name: name,
      position: Cesium.Cartesian3.fromDegrees(0, 0), // 默认位置
      billboard: {
        image: imageUrl,
        width: 500,
        height: 500,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    });
    
    // 添加到列表
    areaList.value.push(name);
    areaMeta.value[name] = { 
      province: '未知', 
      type: 'geotiff',
      entity: entity
    };
    
    // 飞到实体位置
    viewerRef.value.flyTo(entity);
    
    console.log(`✅ GeoTIFF "${name}" 加载成功 (占位图像)`);
  } catch (err) {
    console.error('❌ GeoTIFF 读取失败:', err);
  }
}

// 列表点击定位
const flyToArea = (name) => {
  const entity = entityMap.value[name]
  const metadata = areaMeta.value[name]
  
  // 处理GeoTIFF类型
  if (metadata && metadata.type === 'geotiff') {
    // 如果是GeoTIFF图层，直接飞到图层位置
    const layer = metadata.layer
    if (layer) {
      const rectangle = layer.imageryProvider.rectangle
      viewerRef.value.camera.flyTo({
        destination: rectangle
      })
    }
    return
  }
  
  // 处理GeoJSON类型
  const hierarchy = entity?.polygon?.hierarchy?.getValue(Cesium.JulianDate.now())
  if (!hierarchy?.positions?.length) return
  const bs = Cesium.BoundingSphere.fromPoints(hierarchy.positions)
  viewerRef.value.camera.flyToBoundingSphere(bs, {
    offset: new Cesium.HeadingPitchRange(0, -0.8, 10000)
  })
}

// 删除（从后端和场景中移除）
const handleDeleteGeojson = async (name) => {
  try {
    await deleteGeojson(name)

    // 前端移除
    const idx = areaList.value.indexOf(name)
    if (idx > -1) areaList.value.splice(idx, 1)
    delete entityMap.value[name]
    delete areaMeta.value[name]

    // 从 viewer 中删数据源（找到包含该实体的数据源）
    const dataSources = viewerRef.value.dataSources._dataSources
    for (let i = dataSources.length - 1; i >= 0; i--) {
      const ds = dataSources[i]
      for (const entity of ds.entities.values) {
        const entityName = entity.properties?.KFQMC?.getValue?.()
        if (entityName === name) {
          viewerRef.value.dataSources.remove(ds)
          break
        }
      }
    }
    
    // 处理GeoTIFF类型
    const metadata = areaMeta.value[name]
    if (metadata && metadata.type === 'geotiff' && metadata.entity) {
      viewerRef.value.entities.remove(metadata.entity)
    }
    
    console.log(`✅ 成功删除开发区: ${name}`)
  } catch (err) {
    console.error('❌ 删除失败:', err)
    alert('删除失败，请检查后端服务')
  }
}
</script>

<style scoped>
.main {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}
.container {
  display: flex;
  flex: 1;
  overflow: hidden;
}
.map {
  flex-grow: 1;
  position: relative;
}
#cesiumContainer {
  position: absolute;
  inset: 0;
}
</style>

<!-- 可选：修正 InfoBox 被标题遮挡 -->
<style>
.cesium-infoBox { top: 70px !important; }

/* 图例样式 */
.legend {
  position: absolute;
  bottom: 20px;
  left: 20px;
  background-color: rgba(255, 255, 255, 0.8);
  padding: 10px;
  border-radius: 5px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  max-width: 250px;
  z-index: 1000;
}

.legend h3 {
  margin-top: 0;
  margin-bottom: 10px;
  font-size: 16px;
  text-align: center;
}

.legend-item {
  display: flex;
  align-items: center;
  margin-bottom: 5px;
}

.color-box {
  width: 20px;
  height: 20px;
  margin-right: 10px;
  border: 1px solid #ccc;
}
</style>
