<template>
  <div class="property-panel" v-if="visible">
    <div class="panel-header">
      <h3>{{ title }}</h3>
      <button class="close-btn" @click="$emit('close')">×</button>
    </div>
    <div class="panel-content">
      <div v-if="properties && Object.keys(properties).length > 0">
        <div class="property-item" v-for="(value, key) in properties" :key="key">
          <span class="property-label">{{ formatKey(key) }}:</span>
          <span class="property-value">{{ formatValue(key, value) }}</span>
        </div>
      </div>
      <div v-else class="no-properties">
        无可用属性
      </div>

      <!-- 添加分析按钮区域 -->
      <div class="analysis-actions" v-if="title && title !== '未命名开发区'">
        <div class="action-header">
          <h4>数据分析</h4>
        </div>
        <div class="action-buttons">
          <button class="action-btn indicator-btn" @click="$emit('showIndicators', title)">
            <span class="btn-icon">📊</span>
            评价指标
          </button>
          <button class="action-btn potential-btn" @click="$emit('showPotentials', title)">
            <span class="btn-icon">🎯</span>
            潜力分析
          </button>
          <button class="action-btn edit-btn" @click="$emit('showEditor', title)">
            <span class="btn-icon">✏️</span>
            编辑数据
          </button>
          <button class="action-btn table-btn" @click="$emit('showDataTable', title, properties)">
            <span class="btn-icon">📋</span>
            详细数据
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { defineProps, defineEmits } from 'vue'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    default: '开发区属性'
  },
  properties: {
    type: Object,
    default: () => ({})
  }
})

defineEmits(['close', 'showIndicators', 'showPotentials', 'showEditor', 'showDataTable'])

// 格式化属性键名
const formatKey = (key) => {
  // 去掉属性名前面的下划线
  const cleanKey = key.startsWith('_') ? key.substring(1) : key

  // 固定字段映射为中文
  const fieldMapping = {
    'KFQMC': '开发区名称',
    'KFQDM': '开发区代码',
    'KFQJB': '开发区级别',
    'SZQXMC': '所在区县名称',
    'SZQXDM': '所在区县代码',
    'SZSMC': '所在省份名称',
    'province': '所在省份',
    'Class': '土地利用类型'
  }

  
  // 返回映射后的字段名或原始字段名
  return fieldMapping[cleanKey] || cleanKey
}

// 格式化属性值
const formatValue = (key, value) => {
  // 对于Class字段，需要进一步映射类型值
  if (key === 'Class') {
    const classMapping = {
      'A1': '水田',
      'A2': '水浇地',
      'A3': '旱地',
      'K': '果园',
      'L': '茶园',
      'M': '其他园地',
      'N21': '有林地',
      'N22': '灌木林地',
      'N23': '其他林地',
      'N31': '天然牧草地',
      'N32': '人工牧草地',
      'N33': '其他草地',
      'H1': '商业服务业设施用地',
      'H2': '工业用地',
      'H3': '物流仓储用地',
      'H4': '城镇住宅用地',
      'H5': '公共管理与公共服务用地',
      'H6': '公用设施用地',
      'H7': '公园绿地',
      'H8': '广场用地',
      'H9': '交通运输用地',
      'HA': '空留地',
      'HB': '特殊用地',
      'HC': '空闲地',
      'HD': '其他建设用地',
      'E1': '河流水面',
      'E2': '湖泊水面',
      'E3': '水库水面',
      'E4': '坑塘水面',
      'E5': '沿海滩涂',
      'E6': '内陆滩涂',
      'E7': '沟渠',
      'E8': '沼泽地',
      'E9': '冰川与永久积雪',
      'EA': '盐田',
      'EB': '沙地',
      'EC': '裸土地',
      'ED': '裸岩石砾地'
    }
    return classMapping[value] || value
  }

  // 对于其他字段，直接返回值
  return value || '无'
}
</script>

<style scoped>
.property-panel {
  position: fixed;
  top: 70px;
  right: 20px;
  width: 300px;
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  max-height: 80vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 15px;
  border-bottom: 1px solid #eee;
  background-color: #f8f8f8;
  border-radius: 8px 8px 0 0;
}

.panel-header h3 {
  margin: 0;
  font-size: 16px;
  color: #333;
}

.close-btn {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: #666;
}

.close-btn:hover {
  color: #333;
}

.panel-content {
  padding: 15px;
  overflow-y: auto;
}

.property-item {
  margin-bottom: 10px;
  display: flex;
  flex-wrap: wrap;
}

.property-label {
  font-weight: bold;
  margin-right: 8px;
  color: #555;
  min-width: 80px;
}

.property-value {
  color: #333;
  flex: 1;
}

.no-properties {
  color: #999;
  text-align: center;
  padding: 20px 0;
}

.analysis-actions {
  margin-top: 20px;
  padding-top: 15px;
  border-top: 1px solid #eee;
}

.action-header {
  margin-bottom: 12px;
}

.action-header h4 {
  margin: 0;
  font-size: 14px;
  color: #333;
  font-weight: 500;
}

.action-buttons {
  display: flex;
  gap: 10px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: white;
  color: #333;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  flex: 1;
  justify-content: center;
}

.action-btn:hover {
  background-color: #f5f5f5;
  border-color: #999;
}

.indicator-btn:hover {
  background-color: #e3f2fd;
  border-color: #2196f3;
  color: #1976d2;
}

.potential-btn:hover {
  background-color: #e8f5e8;
  border-color: #4caf50;
  color: #388e3c;
}

.edit-btn {
  background-color: #fff3e0;
  border-color: #ff9800;
  color: #f57c00;
}

.edit-btn:hover {
  background-color: #ffe0b2;
  border-color: #f57c00;
  color: #e65100;
}

.table-btn {
  background-color: #e8eaf6;
  border-color: #3f51b5;
  color: #303f9f;
}

.table-btn:hover {
  background-color: #c5cae9;
  border-color: #303f9f;
  color: #1a237e;
}

.btn-icon {
  font-size: 14px;
}
</style>