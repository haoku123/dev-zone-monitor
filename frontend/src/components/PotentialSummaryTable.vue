<template>
  <div class="potential-summary-overlay" v-if="visible" @click.self="closeTable">
    <div class="potential-summary-container">
      <div class="table-header">
        <div class="header-content">
          <h3>开发区用地潜力汇总表</h3>
          <button class="close-btn" @click="closeTable">×</button>
        </div>

        <!-- 操作栏 -->
        <div class="table-controls">
          <div class="control-left">
            <input
              v-model="searchQuery"
              placeholder="搜索开发区名称..."
              class="search-input"
            />
            <select v-model="rowsPerPage" class="per-page-select">
              <option :value="10">10条/页</option>
              <option :value="25">25条/页</option>
              <option :value="50">50条/页</option>
              <option :value="100">100条/页</option>
            </select>
            <button
              @click="exportData"
              :disabled="!filteredData.length"
              class="export-btn"
            >
              导出Excel
            </button>
          </div>
          <div class="control-right">
            <span class="record-count">显示 {{ filteredData.length }} / {{ totalItems }} 条开发区</span>
          </div>
        </div>
      </div>

      <!-- 表格内容 -->
      <div class="table-content">
        <div v-if="loading" class="loading-state">
          <div class="loading-spinner">⏳</div>
          <div>正在加载潜力数据...</div>
        </div>

        <div v-else-if="error" class="error-state">
          <div class="error-icon">⚠️</div>
          <div>{{ error }}</div>
          <button @click="loadPotentialData" class="retry-btn">重试</button>
        </div>

        <div v-else-if="filteredData.length === 0" class="empty-state">
          <div class="empty-icon">📊</div>
          <div>{{ searchQuery ? '未找到匹配的开发区' : '暂无潜力数据' }}</div>
        </div>

        <div v-else class="table-wrapper">
          <table class="potential-table">
            <thead>
              <tr>
                <th
                  v-for="column in columns"
                  :key="column.key"
                  @click="sortBy(column.key)"
                  :class="{ sortable: column.sortable }"
                >
                  {{ column.title }}
                  <span v-if="sortField === column.key" class="sort-arrow">
                    {{ sortDirection === 'asc' ? '↑' : '↓' }}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in paginatedData" :key="item.开发区名称">
                <td
                  v-for="column in columns"
                  :key="column.key"
                  :class="getColumnClass(column.key, item[column.key])"
                >
                  {{ formatPotentialValue(item[column.key], column.key) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 统计汇总信息 -->
      <div v-if="filteredData.length > 0" class="summary-section">
        <div class="summary-cards">
          <div class="summary-card">
            <div class="card-title">开发区总数</div>
            <div class="card-value">{{ totalZones }}</div>
          </div>
          <div class="summary-card">
            <div class="card-title">高潜力开发区</div>
            <div class="card-value">{{ highPotentialCount }}</div>
          </div>
          <div class="summary-card">
            <div class="card-title">中潜力开发区</div>
            <div class="card-value">{{ mediumPotentialCount }}</div>
          </div>
          <div class="summary-card">
            <div class="card-title">平均潜力指数</div>
            <div class="card-value">{{ averagePotential.toFixed(1) }}</div>
          </div>
        </div>
      </div>

      <!-- 分页控制 -->
      <div v-if="totalPages > 1" class="pagination">
        <div class="pagination-info">
          显示第 {{ startIndex + 1 }}-{{ endIndex }} 条，共 {{ totalItems }} 条记录
        </div>
        <div class="pagination-controls">
          <button
            @click="currentPage--"
            :disabled="currentPage === 1"
            class="pagination-btn"
          >
            上一页
          </button>
          <span class="page-info">{{ currentPage }} / {{ totalPages }}</span>
          <button
            @click="currentPage++"
            :disabled="currentPage === totalPages"
            class="pagination-btn"
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close'])

// 响应式数据
const loading = ref(false)
const error = ref('')
const searchQuery = ref('')
const sortField = ref('开发区名称')
const sortDirection = ref('asc')
const currentPage = ref(1)
const rowsPerPage = ref(25)
const potentialData = ref([])

// 表格列定义
const columns = ref([
  { key: '开发区名称', title: '开发区名称', sortable: true },
  { key: '扩展潜力', title: '扩展潜力', sortable: true },
  { key: '结构潜力', title: '结构潜力', sortable: true },
  { key: '强度潜力', title: '强度潜力', sortable: true },
  { key: '管理潜力', title: '管理潜力', sortable: true },
  { key: '综合潜力', title: '综合潜力', sortable: true },
  { key: '潜力等级', title: '潜力等级', sortable: true }
])

// 计算属性
const filteredData = computed(() => {
  let data = potentialData.value

  // 搜索过滤
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    data = data.filter(item =>
      String(item.开发区名称).toLowerCase().includes(query)
    )
  }

  // 排序
  if (sortField.value) {
    data.sort((a, b) => {
      let aVal = a[sortField.value]
      let bVal = b[sortField.value]

      // 数值字段排序
      if (sortField.value !== '开发区名称' && sortField.value !== '潜力等级') {
        const aNum = parseFloat(aVal) || 0
        const bNum = parseFloat(bVal) || 0
        aVal = aNum
        bVal = bNum
      }

      if (aVal < bVal) return sortDirection.value === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection.value === 'asc' ? 1 : -1
      return 0
    })
  }

  return data
})

const totalItems = computed(() => filteredData.value.length)
const totalPages = computed(() => Math.ceil(totalItems.value / rowsPerPage.value))
const startIndex = computed(() => (currentPage.value - 1) * rowsPerPage.value)
const endIndex = computed(() => Math.min(startIndex.value + rowsPerPage.value, totalItems.value))

const paginatedData = computed(() => {
  return filteredData.value.slice(startIndex.value, endIndex.value)
})

// 统计计算
const totalZones = computed(() => potentialData.value.length)
const averagePotential = computed(() => {
  const potentials = potentialData.value.map(item => parseFloat(item.综合潜力) || 0)
  return potentials.length > 0 ? potentials.reduce((a, b) => a + b, 0) / potentials.length : 0
})
const highPotentialCount = computed(() => {
  return potentialData.value.filter(item => item.潜力等级 === '高').length
})
const mediumPotentialCount = computed(() => {
  return potentialData.value.filter(item => item.潜力等级 === '中').length
})

// 方法
const loadPotentialData = async () => {
  loading.value = true
  error.value = ''

  try {
    const response = await fetch('http://localhost:8080/api/zones/potential-summary')

    if (!response.ok) {
      throw new Error(`获取数据失败 (${response.status})`)
    }

    const result = await response.json()

    if (!result.success) {
      throw new Error(result.error || '获取潜力数据失败')
    }

    potentialData.value = result.data || []
    console.log('加载潜力数据成功:', potentialData.value.length, '条记录')

  } catch (err) {
    console.error('加载潜力数据失败:', err)
    error.value = err.message || '网络错误，请稍后重试'
  } finally {
    loading.value = false
  }
}

const formatPotentialValue = (value, key) => {
  if (value === null || value === undefined || value === '') return '-'

  if (key === '开发区名称' || key === '潜力等级') {
    return value
  }

  const numValue = parseFloat(value)
  if (isNaN(numValue)) return value

  // 潜力指标统一显示2位小数
  return numValue.toFixed(2)
}

const getColumnClass = (key, value) => {
  if (key === '开发区名称') return 'name-column'
  if (key === '潜力等级') {
    if (value === '高') return 'potential-high'
    if (value === '中') return 'potential-medium'
    if (value === '低') return 'potential-low'
    return 'potential-column'
  }
  if (key.includes('潜力') && parseFloat(value) >= 80) return 'potential-high'
  if (key.includes('潜力') && parseFloat(value) >= 60) return 'potential-medium'
  if (key.includes('潜��') && parseFloat(value) > 0) return 'potential-low'
  return 'numeric-column'
}

const sortBy = (field) => {
  if (sortField.value === field) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortField.value = field
    sortDirection.value = 'asc'
  }
}

const exportData = () => {
  if (filteredData.value.length === 0) return

  // 创建CSV内容
  const headers = columns.value.map(col => col.title)
  const rows = filteredData.value.map(item =>
    columns.value.map(col => formatPotentialValue(item[col.key], col.key))
  )

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
  link.download = `开发区潜力汇总表_${new Date().toISOString().split('T')[0]}.csv`
  link.click()
  URL.revokeObjectURL(link.href)
}

const closeTable = () => {
  emit('close')
}

// 监听器
watch(() => props.visible, (newVal) => {
  if (newVal) {
    loadPotentialData()
    currentPage.value = 1
    searchQuery.value = ''
  }
})

watch(() => rowsPerPage.value, () => {
  currentPage.value = 1
})

watch(() => totalItems.value, () => {
  if (currentPage.value > totalPages.value && totalPages.value > 0) {
    currentPage.value = totalPages.value
  }
})
</script>

<style scoped>
.potential-summary-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.potential-summary-container {
  background: white;
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
  width: 95vw;
  max-width: 1600px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.table-header {
  border-bottom: 2px solid #e0e0e0;
  background: linear-gradient(135deg, #f0f8ff 0%, #e6f3ff 100%);
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
}

.header-content h3 {
  margin: 0;
  color: #1e40af;
  font-size: 20px;
  font-weight: 700;
}

.close-btn {
  background: none;
  border: none;
  font-size: 28px;
  cursor: pointer;
  color: #666;
  padding: 0;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s;
}

.close-btn:hover {
  background: rgba(255, 0, 0, 0.1);
  color: #e74c3c;
  transform: rotate(90deg);
}

.table-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: white;
  border-bottom: 1px solid #f0f0f0;
}

.control-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.search-input {
  padding: 10px 14px;
  border: 2px solid #d9d9d9;
  border-radius: 8px;
  width: 280px;
  font-size: 14px;
  transition: border-color 0.3s;
}

.search-input:focus {
  border-color: #1e40af;
  outline: none;
  box-shadow: 0 0 0 3px rgba(30, 64, 175, 0.1);
}

.per-page-select {
  padding: 8px 12px;
  border: 2px solid #d9d9d9;
  border-radius: 8px;
  font-size: 14px;
  background: white;
  cursor: pointer;
}

.export-btn {
  padding: 10px 18px;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.3s;
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
}

.export-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
}

.export-btn:disabled {
  background: #d9d9d9;
  cursor: not-allowed;
  box-shadow: none;
}

.record-count {
  color: #666;
  font-size: 14px;
  font-weight: 500;
}

.table-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.loading-state,
.error-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  color: #666;
}

.loading-spinner,
.error-icon,
.empty-icon {
  font-size: 56px;
  margin-bottom: 20px;
}

.retry-btn {
  margin-top: 20px;
  padding: 12px 24px;
  background: #1e40af;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: background 0.3s;
}

.retry-btn:hover {
  background: #3b82f6;
}

.table-wrapper {
  flex: 1;
  overflow: auto;
  margin: 0 24px;
}

.potential-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
  min-width: 1400px;
}

.potential-table th {
  background: linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%);
  padding: 16px 12px;
  text-align: center;
  font-weight: 600;
  color: #0c4a6e;
  border-bottom: 3px solid #0284c7;
  position: sticky;
  top: 0;
  z-index: 10;
  white-space: nowrap;
}

.potential-table th.sortable {
  cursor: pointer;
  user-select: none;
  transition: background 0.2s;
}

.potential-table th.sortable:hover {
  background: linear-gradient(135deg, #bae6fd 0%, #7dd3fc 100%);
}

.sort-arrow {
  margin-left: 8px;
  font-size: 12px;
  color: #1e40af;
  font-weight: bold;
}

.potential-table td {
  padding: 12px;
  border-bottom: 1px solid #f0f0f0;
  text-align: center;
  white-space: nowrap;
}

.potential-table tr:hover {
  background: #f8fafc;
}

.name-column {
  font-weight: 600;
  color: #1e293b;
  text-align: left !important;
  min-width: 180px;
}

.potential-high {
  color: #059669;
  font-weight: 600;
  background-color: #ecfdf5;
  border-radius: 4px;
  padding: 4px 8px;
}

.potential-medium {
  color: #d97706;
  font-weight: 500;
  background-color: #fffbeb;
  border-radius: 4px;
  padding: 4px 8px;
}

.potential-low {
  color: #dc2626;
  font-weight: 500;
  background-color: #fef2f2;
  border-radius: 4px;
  padding: 4px 8px;
}

.potential-column {
  font-weight: 600;
  text-transform: uppercase;
  font-size: 12px;
}

.numeric-column {
  color: #374151;
  font-family: 'Courier New', monospace;
}

.summary-section {
  padding: 20px 24px;
  background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
  border-top: 2px solid #0284c7;
}

.summary-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
}

.summary-card {
  background: white;
  padding: 20px;
  border-radius: 10px;
  text-align: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transition: transform 0.2s, box-shadow 0.2s;
  border: 1px solid #e2e8f0;
}

.summary-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
}

.card-title {
  font-size: 13px;
  color: #64748b;
  margin-bottom: 8px;
  font-weight: 500;
}

.card-value {
  font-size: 24px;
  font-weight: 700;
  color: #0c4a6e;
}

.pagination {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: white;
  border-top: 1px solid #e0e0e0;
}

.pagination-info {
  color: #666;
  font-size: 14px;
}

.pagination-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.pagination-btn {
  padding: 8px 16px;
  border: 1px solid #d9d9d9;
  background: white;
  color: #333;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.pagination-btn:hover:not(:disabled) {
  border-color: #1e40af;
  color: #1e40af;
}

.pagination-btn:disabled {
  color: #bfbfbf;
  cursor: not-allowed;
}

.page-info {
  color: #333;
  font-weight: 500;
  min-width: 60px;
  text-align: center;
}
</style>