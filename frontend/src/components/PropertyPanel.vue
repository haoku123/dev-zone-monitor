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
          <span class="property-value">{{ value }}</span>
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

defineEmits(['close', 'showIndicators', 'showPotentials', 'showEditor'])

// 格式化属性键名
const formatKey = (key) => {
  // 去掉属性名前面的下划线
  const cleanKey = key.startsWith('_') ? key.substring(1) : key
  
  // 直接返回清理后的键名，不进行中文映射
  return cleanKey
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

.btn-icon {
  font-size: 14px;
}
</style>