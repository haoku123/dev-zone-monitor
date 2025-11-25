<template>
  <div class="ranking-panel" v-if="visible" ref="rankingPanel" @mousedown="startDrag">
    <div class="ranking-header">
      <span class="ranking-title">🏆 开发区用地潜力排名</span>
      <button class="close-btn" @click="$emit('close')" @mousedown.stop>×</button>
    </div>

    <div class="ranking-content">
      <!-- 筛选控件 -->
      <div class="filter-section">
        <div class="filter-group">
          <label>级别筛选：</label>
          <select v-model="selectedLevel" @change="updateRanking" class="filter-select">
            <option value="">全部级别</option>
            <option value="国家级">国家级</option>
            <option value="省级">省级</option>
            <option value="市级">市级</option>
            <option value="县级">县级</option>
          </select>
        </div>

        <div class="filter-group">
          <label>类型筛选：</label>
          <select v-model="selectedType" @change="updateRanking" class="filter-select">
            <option value="">全部类型</option>
            <option value="经济开发区">经济开发区</option>
            <option value="高新技术产业开发区">高新技术产业开发区</option>
            <option value="综合保税区">综合保税区</option>
            <option value="其他开发区">其他开发区</option>
          </select>
        </div>

        <div class="filter-group">
          <label>显示数量：</label>
          <select v-model="limit" @change="updateRanking" class="filter-select">
            <option value="5">前5名</option>
            <option value="10">前10名</option>
            <option value="15">前15名</option>
            <option value="20">前20名</option>
          </select>
        </div>
      </div>

      <!-- 加载状态 -->
      <div v-if="loading" class="loading-section">
        <div class="loading-spinner"></div>
        <span>正在加载排名数据...</span>
      </div>

      <!-- 错误状态 -->
      <div v-else-if="error" class="error-section">
        <div class="error-icon">⚠️</div>
        <span>{{ error }}</span>
        <button @click="updateRanking" class="retry-btn">重试</button>
      </div>

      <!-- 图表区域 -->
      <div v-else-if="chartData.length > 0" class="chart-section">
        <canvas id="rankingChart"></canvas>

        <!-- 统计信息 -->
        <div class="stats-section">
          <div class="stat-item">
            <span class="stat-label">总数：</span>
            <span class="stat-value">{{ totalZones }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">平均分：</span>
            <span class="stat-value">{{ averageScore.toFixed(1) }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">最高分：</span>
            <span class="stat-value">{{ highestScore }}</span>
          </div>
        </div>
      </div>

      <!-- 空数据状态 -->
      <div v-else class="empty-section">
        <div class="empty-icon">📊</div>
        <span>暂无符合条件的开发区数据</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import Chart from 'chart.js/auto'

const props = defineProps({
  visible: Boolean
})

const emit = defineEmits(['close'])

const rankingPanel = ref(null)
const loading = ref(false)
const error = ref('')
const chartData = ref([])
const totalZones = ref(0)
const averageScore = ref(0)
const highestScore = ref(0)

// 筛选参数
const selectedLevel = ref('')
const selectedType = ref('')
const limit = ref(10)

let chartInstance = null

// 拖动相关变量
let isDragging = false
let offsetX = 0
let offsetY = 0

// 获取排名数据
const fetchRankingData = async () => {
  loading.value = true
  error.value = ''

  try {
    const params = new URLSearchParams()
    if (selectedLevel.value) params.append('level', selectedLevel.value)
    if (selectedType.value) params.append('zone_type', selectedType.value)
    params.append('limit', limit.value)

    const response = await fetch(`http://localhost:8080/api/zones/rankings?${params}`)
    const result = await response.json()

    console.log('API响应:', result) // 调试信息

    if (!result.success) {
      throw new Error(result.error || '获取数据失败')
    }

    chartData.value = result.data || []
    totalZones.value = result.total || 0

    console.log('处理后的数据:', chartData.value) // 调试信息

    // 计算统计信息
    if (chartData.value.length > 0) {
      const scores = chartData.value.map(item => item.score)
      averageScore.value = scores.reduce((a, b) => a + b, 0) / scores.length
      highestScore.value = Math.max(...scores)
    } else {
      averageScore.value = 0
      highestScore.value = 0
    }

    // 渲染图表
    await nextTick()
    setTimeout(() => {
      renderChart()
    }, 100) // 延迟100ms确保DOM完全准备好

  } catch (err) {
    console.error('获取排名数据失败:', err)
    error.value = err.message || '网络错误，请稍后重试'
    chartData.value = []
  } finally {
    loading.value = false
  }
}

// 渲染图表
const renderChart = () => {
  const ctx = document.getElementById('rankingChart')
  if (!ctx) {
    console.error('找不到chart canvas元素')
    return
  }

  if (chartData.value.length === 0) {
    console.warn('没有数据可渲染')
    return
  }

  if (chartInstance) {
    chartInstance.destroy()
  }

  console.log('开始渲染图表，数据数量:', chartData.value.length) // 调试信息

  const labels = chartData.value.map(item => {
    // 截取过长的名称
    let name = item.name
    if (name.length > 15) {
      name = name.substring(0, 12) + '...'
    }
    return name
  })

  const values = chartData.value.map(item => item.score)

  console.log('标签:', labels, '数值:', values) // 调试信息
  const colors = chartData.value.map((item, index) => {
    // 根据排名设置不同的颜色
    if (index === 0) return 'rgba(255, 215, 0, 0.8)' // 金色 - 第1名
    if (index === 1) return 'rgba(192, 192, 192, 0.8)' // 银色 - 第2名
    if (index === 2) return 'rgba(205, 127, 50, 0.8)' // 铜色 - 第3名
    return 'rgba(54, 162, 235, 0.8)' // 蓝色 - 其他
  })

  console.log('创建Chart实例...') // 调试信息

  try {
    chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: '综合得分',
          data: values,
          backgroundColor: colors,
          borderColor: colors.map(color => color.replace('0.8', '1')),
          borderWidth: 2,
          borderRadius: 8,
          borderSkipped: false
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          title: {
            display: false
          },
          tooltip: {
            callbacks: {
              title: function(context) {
                const index = context[0].dataIndex
                return chartData.value[index].name
              },
              afterLabel: function(context) {
                const index = context.dataIndex
                const item = chartData.value[index]
                return [
                  `得分: ${item.score}`,
                  `级别: ${item.zoneLevel}`,
                  `类型: ${item.zoneType}`,
                  `排名: ${index + 1}`
                ]
              }
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            suggestedMax: 100,
            grid: {
              color: 'rgba(0, 0, 0, 0.1)',
              drawBorder: false
            },
            ticks: {
              color: '#666',
              font: {
                size: 11
              }
            }
          },
          y: {
            grid: {
              display: false
            },
            ticks: {
              color: '#333',
              font: {
                size: 11,
                weight: '500'
              },
              padding: 8
            }
          }
        },
        animation: {
          duration: 800,
          easing: 'easeInOutQuart'
        }
      }
    })
    console.log('Chart实例创建成功!') // 调试信息
  } catch (error) {
    console.error('Chart创建失败:', error) // 调试信息
  }
}

// 更新排名
const updateRanking = () => {
  fetchRankingData()
}

// 拖动功能
const startDrag = (e) => {
  if (!e.target.closest('.ranking-header')) return
  isDragging = true
  const panel = rankingPanel.value
  const rect = panel.getBoundingClientRect()
  offsetX = e.clientX - rect.left
  offsetY = e.clientY - rect.top

  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
}

const onDrag = (e) => {
  if (!isDragging) return
  const panel = rankingPanel.value
  panel.style.left = `${e.clientX - offsetX}px`
  panel.style.top = `${e.clientY - offsetY}px`
  panel.style.right = 'auto'
  panel.style.bottom = 'auto'
}

const stopDrag = () => {
  isDragging = false
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
}

// 监听显示状态
watch(() => props.visible, (newVal) => {
  if (newVal) {
    setTimeout(() => {
      fetchRankingData()
    }, 100)
  }
})

onBeforeUnmount(() => {
  if (chartInstance) chartInstance.destroy()
})
</script>

<style scoped>
.ranking-panel {
  position: absolute;
  top: 80px;
  right: 20px;
  background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
  border: none;
  border-radius: 16px;
  padding: 0;
  width: 600px;
  max-height: 85vh;
  box-shadow: 0 15px 35px rgba(0, 0, 0, 0.1);
  z-index: 1000;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.ranking-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 16px 20px;
  cursor: move;
  display: flex;
  justify-content: space-between;
  align-items: center;
  user-select: none;
}

.ranking-title {
  font-size: 18px;
  font-weight: bold;
  letter-spacing: 0.5px;
}

.close-btn {
  background: none;
  border: none;
  color: white;
  font-size: 22px;
  cursor: pointer;
  padding: 0;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: scale(1.1);
}

.ranking-content {
  padding: 20px;
  flex: 1;
  overflow-y: auto;
  max-height: calc(85vh - 70px);
}

.filter-section {
  display: flex;
  gap: 15px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-group label {
  font-size: 13px;
  color: #555;
  font-weight: 500;
  white-space: nowrap;
}

.filter-select {
  padding: 6px 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 13px;
  background: white;
  cursor: pointer;
  transition: all 0.2s ease;
}

.filter-select:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.1);
}

.loading-section, .error-section, .empty-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
  color: #666;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #f3f3f3;
  border-top: 3px solid #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 15px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.error-icon, .empty-icon {
  font-size: 48px;
  margin-bottom: 15px;
}

.retry-btn {
  margin-top: 15px;
  padding: 8px 20px;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s ease;
}

.retry-btn:hover {
  background: #5a6fd8;
  transform: translateY(-1px);
}

.chart-section {
  margin-bottom: 20px;
}

#rankingChart {
  width: 100% !important;
  height: 400px !important;
}

.stats-section {
  display: flex;
  justify-content: space-around;
  padding: 15px;
  background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
  border-radius: 8px;
  margin-top: 15px;
}

.stat-item {
  text-align: center;
}

.stat-label {
  display: block;
  font-size: 12px;
  color: #666;
  margin-bottom: 4px;
}

.stat-value {
  display: block;
  font-size: 18px;
  font-weight: bold;
  color: #333;
}
</style>