<template>
  <div v-if="visible" class="data-table-overlay" @click.self="closeTable">
    <div class="data-table-container">
      <div class="table-header">
        <div class="header-content">
          <h3>{{ selectedAreaName ? `${selectedAreaName} - 属性数据` : '属性数据表' }}</h3>
          <button class="close-btn" @click="closeTable">×</button>
        </div>

        <!-- 操作栏 -->
        <div class="table-controls">
          <div class="control-left">
            <input
              v-model="searchQuery"
              placeholder="搜索属性字段..."
              class="search-input"
            />
            <button
              @click="exportData"
              :disabled="!filteredData.length"
              class="export-btn"
            >
              导出CSV
            </button>
          </div>
          <div class="control-right">
            <span class="record-count">{{ filteredData.length }} 条记录</span>
          </div>
        </div>
      </div>

      <!-- 表格内容 -->
      <div class="table-content">
        <div v-if="loading" class="loading-state">
          <div class="loading-spinner">⏳</div>
          <div>正在加载数据...</div>
        </div>

        <div v-else-if="error" class="error-state">
          <div class="error-icon">⚠️</div>
          <div>{{ error }}</div>
          <button @click="loadData" class="retry-btn">重试</button>
        </div>

        <div v-else-if="filteredData.length === 0" class="empty-state">
          <div class="empty-icon">📋</div>
          <div>{{ searchQuery ? '未找到匹配的属性' : '暂无属性数据' }}</div>
        </div>

        <div v-else class="table-wrapper">
          <table class="attribute-table">
            <thead>
              <tr>
                <th @click="sortBy('name')" class="sortable">
                  属性名称
                  <span class="sort-icon">{{ getSortIcon('name') }}</span>
                </th>
                <th @click="sortBy('value')" class="sortable">
                  属性值
                  <span class="sort-icon">{{ getSortIcon('value') }}</span>
                </th>
                <th @click="sortBy('type')" class="sortable">
                  数据类型
                  <span class="sort-icon">{{ getSortIcon('type') }}</span>
                </th>
                <th class="unit-column">单位</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in filteredData" :key="item.name || index">
                <td class="property-name">{{ item.name || 'N/A' }}</td>
                <td class="property-value">
                  <span :class="getValueClass(item.type, item.value)">
                    {{ formatValue(item.value, item.type) }}
                  </span>
                </td>
                <td class="property-type">
                  <span class="type-badge" :class="item.type">
                    {{ getTypeLabel(item.type) }}
                  </span>
                </td>
                <td class="property-unit">{{ item.unit || '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 统计信息 -->
      <div v-if="filteredData.length > 0" class="table-footer">
        <div class="statistics">
          <div class="stat-item">
            <span class="stat-label">数值字段:</span>
            <span class="stat-value">{{ numericFieldCount }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">文本字段:</span>
            <span class="stat-value">{{ textFieldCount }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">总字段数:</span>
            <span class="stat-value">{{ filteredData.length }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  selectedAreaName: {
    type: String,
    default: ''
  },
  geojsonData: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close'])

// 响应式数据
const loading = ref(false)
const error = ref('')
const searchQuery = ref('')
const sortField = ref('name')
const sortDirection = ref('asc')
const tableData = ref([])

// 计算属性
const filteredData = computed(() => {
  let data = tableData.value

  // 搜索过滤
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    data = data.filter(item =>
      String(item.name).toLowerCase().includes(query) ||
      String(item.value).toLowerCase().includes(query)
    )
  }

  // 排序
  if (sortField.value) {
    data.sort((a, b) => {
      let aVal = a[sortField.value]
      let bVal = b[sortField.value]

      // 处理不同类型的排序
      if (sortField.value === 'value') {
        // 尝试数值排序
        const aNum = parseFloat(aVal)
        const bNum = parseFloat(bVal)
        if (!isNaN(aNum) && !isNaN(bNum)) {
          aVal = aNum
          bVal = bNum
        }
      }

      if (aVal < bVal) return sortDirection.value === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection.value === 'asc' ? 1 : -1
      return 0
    })
  }

  return data
})

const numericFieldCount = computed(() => {
  return tableData.value.filter(item => item.type === 'number').length
})

const textFieldCount = computed(() => {
  return tableData.value.filter(item => item.type === 'string').length
})

// 方法
const loadData = async () => {
  if (!props.selectedAreaName) {
    error.value = '未选择开发区'
    return
  }

  loading.value = true
  error.value = ''

  try {
    // 获取geojson数据
    const response = await fetch(`http://localhost:8080/api/geojson/${encodeURIComponent(props.selectedAreaName)}`)

    if (!response.ok) {
      throw new Error(`获取数据失败 (${response.status})`)
    }

    const data = await response.json()

    // 检查返回的数据结构
    let geojson
    if (data.geojson) {
      // 数据格式: { name: "...", geojson: {...} }
      geojson = data.geojson
    } else if (data.type === 'FeatureCollection') {
      // 直接的GeoJSON格式
      geojson = data
    } else {
      throw new Error('无法识别的数据格式')
    }

    if (!geojson || !geojson.features || geojson.features.length === 0) {
      throw new Error('无地理要素数据')
    }

    // 提取属性数据 - 使用第一个feature
    const properties = geojson.features[0].properties || {}

    // 转换为表格数据
    const tableRows = Object.entries(properties).map(([key, value]) => {
      const type = getValueType(value)
      const unit = getUnitForField(key)

      return {
        name: key,
        value: value,
        type: type,
        unit: unit
      }
    })

    tableData.value = tableRows

  } catch (err) {
    console.error('加载属性数据失败:', err)
    error.value = err.message || '加载失败'
  } finally {
    loading.value = false
  }
}

const getValueType = (value) => {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'string') {
    // 尝试检测日期
    const dateRegex = /^\d{4}-\d{2}-\d{2}/
    if (dateRegex.test(value)) return 'date'
    return 'string'
  }
  return 'object'
}

const getUnitForField = (fieldName) => {
  const fieldLower = fieldName.toLowerCase()

  // 面积相关
  if (fieldLower.includes('area') || fieldLower.includes('面积')) {
    return '公顷'
  }
  if (fieldLower.includes('length') || fieldLower.includes('周长')) {
    return '米'
  }

  // 比例相关
  if (fieldLower.includes('ratio') || fieldLower.includes('rate') || fieldLower.includes('比例')) {
    return '%'
  }

  // 人口相关
  if (fieldLower.includes('population') || fieldLower.includes('人口')) {
    return '人'
  }

  // 经济相关
  if (fieldLower.includes('value') || fieldLower.includes('amount') || fieldLower.includes('额')) {
    return '万元'
  }

  return null
}

const getTypeLabel = (type) => {
  const labels = {
    'string': '文本',
    'number': '数值',
    'boolean': '布尔值',
    'date': '日期',
    'object': '对象',
    'null': '空值'
  }
  return labels[type] || type
}

const formatValue = (value, type) => {
  if (value === null || value === undefined) return 'N/A'

  switch (type) {
    case 'number':
      return Number.isInteger(value) ? value : value.toFixed(2)
    case 'boolean':
      return value ? '是' : '否'
    case 'date':
      return new Date(value).toLocaleDateString('zh-CN')
    case 'object':
      return JSON.stringify(value)
    default:
      return String(value)
  }
}

const getValueClass = (type, value) => {
  if (type === 'number' && !isNaN(value)) {
    if (value > 0) return 'value-positive'
    if (value < 0) return 'value-negative'
  }
  if (type === 'boolean') {
    return value ? 'value-true' : 'value-false'
  }
  return ''
}

const sortBy = (field) => {
  if (sortField.value === field) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortField.value = field
    sortDirection.value = 'asc'
  }
}

const getSortIcon = (field) => {
  if (sortField.value !== field) return '↕️'
  return sortDirection.value === 'asc' ? '↑' : '↓'
}

const exportData = () => {
  if (filteredData.value.length === 0) return

  // 创建CSV内容
  const headers = ['属性名称', '属性值', '数据类型', '单位']
  const rows = filteredData.value.map(item => [
    item.name || '',
    formatValue(item.value, item.type),
    getTypeLabel(item.type),
    item.unit || ''
  ])

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n')

  // 添加BOM以支持中文
  const BOM = '\uFEFF'
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8' })

  // 下载文件
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  const fileName = props.selectedAreaName
    ? `${props.selectedAreaName}_属性数据_${new Date().toISOString().split('T')[0]}.csv`
    : `属性数据_${new Date().toISOString().split('T')[0]}.csv`
  link.download = fileName
  link.click()
  URL.revokeObjectURL(link.href)
}

const closeTable = () => {
  emit('close')
}

// 监听器
watch(() => props.visible, (newVal) => {
  if (newVal && props.selectedAreaName) {
    loadData()
  }
})

watch(() => props.selectedAreaName, (newName) => {
  if (newName && props.visible) {
    loadData()
  }
})
</script>

<style scoped>
.data-table-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.data-table-container {
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  width: 90vw;
  max-width: 1200px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.table-header {
  border-bottom: 1px solid #e0e0e0;
  background: #f8f9fa;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
}

.header-content h3 {
  margin: 0;
  color: #333;
  font-size: 18px;
  font-weight: 600;
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #666;
  padding: 0;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.close-btn:hover {
  background: rgba(0, 0, 0, 0.1);
  color: #333;
}

.table-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  background: white;
  border-bottom: 1px solid #f0f0f0;
}

.control-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.search-input {
  padding: 8px 12px;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  width: 250px;
  font-size: 14px;
}

.search-input:focus {
  border-color: #1890ff;
  outline: none;
  box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2);
}

.export-btn {
  padding: 8px 16px;
  background: #52c41a;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
}

.export-btn:hover:not(:disabled) {
  background: #389e0d;
}

.export-btn:disabled {
  background: #d9d9d9;
  cursor: not-allowed;
}

.record-count {
  color: #666;
  font-size: 14px;
}

.table-content {
  flex: 1;
  overflow: auto;
  padding: 0;
}

.loading-state,
.error-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: #666;
}

.loading-spinner,
.error-icon,
.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.retry-btn {
  margin-top: 16px;
  padding: 8px 16px;
  background: #1890ff;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.table-wrapper {
  overflow-x: auto;
}

.attribute-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.attribute-table th {
  background: #f5f5f5;
  padding: 12px 16px;
  text-align: left;
  font-weight: 600;
  color: #333;
  border-bottom: 2px solid #e0e0e0;
}

.attribute-table th.sortable {
  cursor: pointer;
  user-select: none;
  position: relative;
}

.attribute-table th.sortable:hover {
  background: #e8e8e8;
}

.sort-icon {
  margin-left: 8px;
  font-size: 12px;
}

.attribute-table td {
  padding: 12px 16px;
  border-bottom: 1px solid #f0f0f0;
}

.property-name {
  font-weight: 500;
  color: #333;
  max-width: 200px;
}

.property-value {
  max-width: 300px;
  word-break: break-all;
}

.value-positive {
  color: #52c41a;
  font-weight: 500;
}

.value-negative {
  color: #ff4d4f;
  font-weight: 500;
}

.value-true {
  color: #52c41a;
  font-weight: 500;
}

.value-false {
  color: #999;
}

.type-badge {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
}

.type-badge.string {
  background: #e6f7ff;
  color: #1890ff;
}

.type-badge.number {
  background: #f6ffed;
  color: #52c41a;
}

.type-badge.boolean {
  background: #fff2e8;
  color: #fa8c16;
}

.type-badge.date {
  background: #f9f0ff;
  color: #722ed1;
}

.unit-column {
  color: #666;
  font-size: 13px;
}

.table-footer {
  border-top: 1px solid #e0e0e0;
  background: #f8f9fa;
  padding: 12px 20px;
}

.statistics {
  display: flex;
  gap: 24px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stat-label {
  color: #666;
  font-size: 14px;
}

.stat-value {
  font-weight: 600;
  color: #333;
  font-size: 14px;
}
</style>