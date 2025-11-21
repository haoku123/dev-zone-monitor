<template>
  <div class="chart-panel" v-if="visible" ref="chartPanel" @mousedown="startDrag">
    <div class="chart-header">
      <span class="chart-title">🏢 开发区用地潜力排名</span>
      <button class="close-btn" @click="$emit('close')" @mousedown.stop>×</button>
    </div>
    <canvas id="landPotentialChart"></canvas>
  </div>
</template>

<script setup>
import { watch, onMounted, onBeforeUnmount, ref } from 'vue'
import Chart from 'chart.js/auto'

const props = defineProps({
  visible: Boolean,
  data: Array // 格式：[{ name: '区域名称', level: 数值 }]
})

const emit = defineEmits(['close'])

const chartPanel = ref(null)
let chartInstance = null

// 拖动相关变量
let isDragging = false
let offsetX = 0
let offsetY = 0

const renderChart = () => {
  const ctx = document.getElementById('landPotentialChart')
  if (!ctx || !props.data?.length) return

  const labels = props.data.map(item => item.name)
  const values = props.data.map(item => item.level)

  if (chartInstance) {
    chartInstance.destroy()
  }

  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: '用地潜力等级',
        data: values,
        backgroundColor: [
          'rgba(255, 99, 132, 0.8)',
          'rgba(54, 162, 235, 0.8)', 
          'rgba(255, 205, 86, 0.8)',
          'rgba(75, 192, 192, 0.8)',
          'rgba(153, 102, 255, 0.8)',
          'rgba(255, 159, 64, 0.8)'
        ],
        borderColor: [
          'rgba(255, 99, 132, 1)',
          'rgba(54, 162, 235, 1)',
          'rgba(255, 205, 86, 1)', 
          'rgba(75, 192, 192, 1)',
          'rgba(153, 102, 255, 1)',
          'rgba(255, 159, 64, 1)'
        ],
        borderWidth: 2,
        borderRadius: 8,
        borderSkipped: false,
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
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          suggestedMax: 5,
          grid: {
            color: 'rgba(0, 0, 0, 0.1)',
            drawBorder: false
          },
          ticks: {
            color: '#666',
            font: {
              size: 12
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
            padding: 10
          }
        }
      },
      animation: {
        duration: 1000,
        easing: 'easeInOutQuart'
      },
      elements: {
        bar: {
          borderRadius: 6,
        }
      }
    }
  })
}

// 拖动功能
const startDrag = (e) => {
  if (!e.target.closest('.chart-header')) return
  isDragging = true
  const panel = chartPanel.value
  const rect = panel.getBoundingClientRect()
  offsetX = e.clientX - rect.left
  offsetY = e.clientY - rect.top

  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
}

const onDrag = (e) => {
  if (!isDragging) return
  const panel = chartPanel.value
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

watch(() => props.visible, (newVal) => {
  if (newVal) {
    setTimeout(() => renderChart(), 0)
  }
})

onMounted(() => {
  if (props.visible) renderChart()
})

onBeforeUnmount(() => {
  if (chartInstance) chartInstance.destroy()
})
</script>

<style scoped>
.chart-panel {
  position: absolute;
  bottom: 20px;
  right: 15%;
  background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
  border: none;
  border-radius: 16px;
  padding: 0;
  width: 450px;
  max-height: 400px;
  box-shadow: 
    0 10px 30px rgba(0, 0, 0, 0.1),
    0 4px 8px rgba(0, 0, 0, 0.05);
  z-index: 999;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  overflow: hidden;
}

.chart-header {
  background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 12px 20px;
  cursor: move;
  display: flex;
  justify-content: space-between;
  align-items: center;
  user-select: none;
}

.chart-title {
  font-size: 16px;
  font-weight: bold;
  letter-spacing: 0.5px;
}

.close-btn {
  background: none;
  border: none;
  color: white;
  font-size: 20px;
  cursor: pointer;
  padding: 0;
  width: 24px;
  height: 24px;
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

.chart-panel canvas {
  width: 100% !important;
  height: 280px !important;
  border-radius: 0 0 16px 16px;
  padding: 20px;
  box-sizing: border-box;
}
</style>
