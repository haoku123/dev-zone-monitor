<template>
  <div v-if="visible" class="potential-panel">
    <div class="panel-backdrop" @click="closePanel"></div>
    <div class="panel-content">
      <div class="panel-header">
        <h3>{{ areaName }} - 潜力分析</h3>
        <button class="close-btn" @click="closePanel">×</button>
      </div>

      <div class="panel-body">
        <div v-if="loading" class="loading">
          <div class="loading-spinner"></div>
          <p>正在分析发展潜力...</p>
        </div>

        <div v-else-if="error" class="error-message">
          <p>❌ {{ error }}</p>
        </div>

        <div v-else-if="potentials" class="potentials-content">
          <!-- 扩展潜力 -->
          <div class="potential-section">
            <h4>
              <span class="section-icon">📈</span>
              扩展潜力
            </h4>
            <div class="potential-card expansion">
              <div class="potential-header">
                <span class="potential-title">可扩展空间</span>
                <span class="potential-value">{{ formatNumber(potentials.expansionPotential?.value) }} {{ potentials.expansionPotential?.unit }}</span>
              </div>
              <div class="potential-formula">
                公式: {{ potentials.expansionPotential?.formula }}
              </div>
              <div class="potential-description">
                {{ potentials.expansionPotential?.description }}
              </div>
              <div class="potential-progress">
                <div class="progress-bar">
                  <div
                    class="progress-fill"
                    :style="{ width: getExpansionPercentage() + '%' }">
                  </div>
                </div>
                <span class="progress-label">剩余空间: {{ getExpansionPercentage() }}%</span>
              </div>
            </div>
          </div>

          <!-- 结构潜力 -->
          <div class="potential-section">
            <h4>
              <span class="section-icon">🏗️</span>
              结构潜力
            </h4>
            <div class="potential-cards-grid">
              <div class="potential-card">
                <div class="potential-header">
                  <span class="potential-title">工业用地比例</span>
                  <span class="potential-value">{{ formatPercent(potentials.structurePotential?.currentStructure?.industrialRatio?.value) }}</span>
                </div>
                <div class="potential-status" :class="getIndustrialStatus(potentials.structurePotential?.currentStructure?.industrialRatio?.value)">
                  {{ getIndustrialStatusText(potentials.structurePotential?.currentStructure?.industrialRatio?.value) }}
                </div>
              </div>
            </div>
          </div>

          <!-- 强度潜力 -->
          <div class="potential-section">
            <h4>
              <span class="section-icon">⚡</span>
              强度潜力
            </h4>
            <div class="potential-cards-grid">
              <div class="potential-card">
                <div class="potential-header">
                  <span class="potential-title">当前开发强度(容积率)</span>
                  <span class="potential-value">{{ formatNumber(potentials.intensityPotential?.currentIntensity?.plotRatio?.value) }}</span>
                </div>
                <div class="potential-status" :class="getIntensityStatus(potentials.intensityPotential?.currentIntensity?.plotRatio?.value)">
                  {{ getIntensityStatusText(potentials.intensityPotential?.currentIntensity?.plotRatio?.value) }}
                </div>
                <div class="potential-suggestion">
                  {{ getIntensitySuggestion(potentials.intensityPotential?.currentIntensity?.plotRatio?.value) }}
                </div>
              </div>
            </div>
          </div>

          <!-- 经济潜力 -->
          <div class="potential-section">
            <h4>
              <span class="section-icon">💼</span>
              经济潜力
            </h4>
            <div class="potential-cards-grid">
              <div class="potential-card">
                <div class="potential-header">
                  <span class="potential-title">企业密度</span>
                  <span class="potential-value">{{ formatNumber(potentials.economicPotential?.enterpriseDensity?.value) }} {{ potentials.economicPotential?.enterpriseDensity?.unit }}</span>
                </div>
                <div class="potential-status" :class="getEnterpriseStatus(potentials.economicPotential?.enterpriseDensity?.value)">
                  {{ getEnterpriseStatusText(potentials.economicPotential?.enterpriseDensity?.value) }}
                </div>
                <div class="potential-suggestion">
                  {{ getEnterpriseSuggestion(potentials.economicPotential?.enterpriseDensity?.value) }}
                </div>
              </div>
            </div>
          </div>

          <!-- 总体评价 -->
          <div class="overall-assessment">
            <h4>
              <span class="section-icon">🎯</span>
              潜力评价
            </h4>
            <div class="assessment-card">
              <div class="assessment-header">
                <span class="assessment-title">综合潜力等级</span>
                <span class="assessment-level" :class="getPotentialLevel().class">
                  {{ getPotentialLevel().text }}
                </span>
              </div>
              <div class="assessment-description">
                <p>{{ getPotentialLevel().description }}</p>
              </div>
              <div class="assessment-recommendations">
                <h5>发展建议:</h5>
                <ul>
                  <li v-for="recommendation in getRecommendations()" :key="recommendation">
                    {{ recommendation }}
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <!-- 更新时间 -->
          <div class="update-time">
            <p>分析时间: {{ formatTime(potentials.lastUpdated) }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { getZonePotentials, getZoneData } from '../api/api.js'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  areaName: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['close'])

const loading = ref(false)
const error = ref(null)
const potentials = ref(null)
const zoneData = ref(null)

const formatNumber = (value, decimals = 2) => {
  if (value === null || value === undefined) return 'N/A'
  return value.toFixed(decimals)
}

const formatPercent = (value) => {
  if (value === null || value === undefined) return 'N/A'
  return `${(value * 100).toFixed(1)}%`
}

const formatTime = (timeString) => {
  if (!timeString) return 'N/A'
  return new Date(timeString).toLocaleString('zh-CN')
}

const getExpansionPercentage = () => {
  if (!potentials.value || !zoneData.value) return 0

  const expansion = potentials.value.expansionPotential?.value || 0
  const approved = zoneData.value.landData?.approvedArea || 1

  return Math.round((expansion / approved) * 100)
}

const getIndustrialStatus = (ratio) => {
  if (!ratio) return 'unknown'
  if (ratio < 0.3) return 'low'
  if (ratio < 0.5) return 'medium'
  return 'high'
}

const getIndustrialStatusText = (ratio) => {
  const status = getIndustrialStatus(ratio)
  switch (status) {
    case 'low': return '比例偏低'
    case 'medium': return '比例适中'
    case 'high': return '比例较高'
    default: return '未知'
  }
}

const getIntensityStatus = (plotRatio) => {
  if (!plotRatio) return 'unknown'
  if (plotRatio < 0.8) return 'low'
  if (plotRatio < 1.5) return 'medium'
  return 'high'
}

const getIntensityStatusText = (plotRatio) => {
  const status = getIntensityStatus(plotRatio)
  switch (status) {
    case 'low': return '开发强度较低'
    case 'medium': return '开发强度适中'
    case 'high': return '开发强度较高'
    default: return '未知'
  }
}

const getIntensitySuggestion = (plotRatio) => {
  if (!plotRatio) return ''
  if (plotRatio < 0.8) return '建议提高土地利用效率，适当增加开发强度'
  if (plotRatio > 1.5) return '开发强度较高，应注重空间品质提升'
  return '开发强度适中，保持现有发展模式'
}

const getEnterpriseStatus = (density) => {
  if (!density) return 'unknown'
  if (density < 5) return 'low'
  if (density < 15) return 'medium'
  return 'high'
}

const getEnterpriseStatusText = (density) => {
  const status = getEnterpriseStatus(density)
  switch (status) {
    case 'low': return '企业密度偏低'
    case 'medium': return '企业密度适中'
    case 'high': return '企业密度较高'
    default: return '未知'
  }
}

const getEnterpriseSuggestion = (density) => {
  if (!density) return ''
  if (density < 5) return '建议加大招商引资力度，吸引更多企业入驻'
  if (density > 15) return '企业密度较高，可考虑优化产业结构'
  return '企业密度适中，保持现有发展态势'
}

const getPotentialLevel = () => {
  if (!potentials.value) return { text: 'N/A', class: 'unknown', description: '无法评估' }

  const expansion = potentials.value.expansionPotential?.value || 0
  const intensity = potentials.value.intensityPotential?.currentIntensity?.plotRatio?.value || 0
  const enterprise = potentials.value.economicPotential?.enterpriseDensity?.value || 0

  let score = 0
  if (expansion > 100) score += 30
  else if (expansion > 50) score += 20
  else if (expansion > 0) score += 10

  if (intensity < 1.0) score += 25
  else if (intensity < 1.5) score += 15

  if (enterprise > 10) score += 25
  else if (enterprise > 5) score += 15

  if (score >= 70) return { text: 'A级', class: 'level-a', description: '发展潜力巨大，具备快速发展的基础条件' }
  if (score >= 50) return { text: 'B级', class: 'level-b', description: '发展潜力良好，通过优化可进一步提升' }
  if (score >= 30) return { text: 'C级', class: 'level-c', description: '发展潜力一般，需要重点关注瓶颈制约' }
  return { text: 'D级', class: 'level-d', description: '发展潜力有限，需要从根本上改善发展环境' }
}

const getRecommendations = () => {
  const recommendations = []

  if (!potentials.value || !zoneData.value) return ['数据不足，无法提供具体建议']

  const expansion = potentials.value.expansionPotential?.value || 0
  const intensity = potentials.value.intensityPotential?.currentIntensity?.plotRatio?.value || 0
  const enterprise = potentials.value.economicPotential?.enterpriseDensity?.value || 0

  if (expansion > 50) {
    recommendations.push('充分利用土地资源，加快基础设施配套建设')
  }

  if (intensity < 0.8) {
    recommendations.push('提高土地利用效率，优化空间布局')
  } else if (intensity > 1.5) {
    recommendations.push('注重空间品质提升，完善公共服务配套')
  }

  if (enterprise < 5) {
    recommendations.push('加大招商引资力度，完善产业政策体系')
  }

  if (recommendations.length === 0) {
    recommendations.push('保持现有发展态势，持续优化产业结构')
  }

  return recommendations
}

const loadPotentials = async () => {
  if (!props.areaName) return

  loading.value = true
  error.value = null
  potentials.value = null

  try {
    const [potentialResult, dataResult] = await Promise.all([
      getZonePotentials(props.areaName),
      getZoneData(props.areaName)
    ])

    potentials.value = potentialResult
    zoneData.value = dataResult
  } catch (err) {
    console.error('获取潜力分析失败:', err)
    error.value = '获取潜力分析失败: ' + err.message
  } finally {
    loading.value = false
  }
}

const closePanel = () => {
  emit('close')
}

// 监听areaName变化，重新加载数据
watch(() => props.areaName, (newName) => {
  if (newName && props.visible) {
    loadPotentials()
  }
})

// 监听visible变化，显示时加载数据
watch(() => props.visible, (visible) => {
  if (visible && props.areaName) {
    loadPotentials()
  }
})
</script>

<style scoped>
.potential-panel {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.panel-backdrop {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
}

.panel-content {
  position: relative;
  background: white;
  border-radius: 8px;
  width: 90%;
  max-width: 900px;
  max-height: 85vh;
  overflow-y: auto;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #e5e7eb;
  background-color: #f0fdf4;
  border-radius: 8px 8px 0 0;
}

.panel-header h3 {
  margin: 0;
  color: #1f2937;
  font-size: 18px;
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #6b7280;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}

.close-btn:hover {
  background-color: #f3f4f6;
  color: #1f2937;
}

.panel-body {
  padding: 24px;
}

.loading {
  text-align: center;
  padding: 40px;
  color: #6b7280;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f4f6;
  border-top: 4px solid #10b981;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 16px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.error-message {
  text-align: center;
  padding: 40px;
  color: #ef4444;
}

.potential-content {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.potential-section h4 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: #374151;
  font-size: 16px;
  border-bottom: 2px solid #e5e7eb;
  padding-bottom: 8px;
}

.section-icon {
  font-size: 20px;
}

.potential-card {
  background: #f9fafb;
  border-radius: 8px;
  padding: 20px;
  border: 1px solid #e5e7eb;
  border-left: 4px solid #10b981;
}

.potential-card.expansion {
  border-left-color: #3b82f6;
}

.potential-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.potential-title {
  font-weight: 500;
  color: #374151;
}

.potential-value {
  font-size: 18px;
  font-weight: bold;
  color: #1f2937;
}

.potential-formula {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 8px;
  font-style: italic;
}

.potential-description {
  color: #4b5563;
  font-size: 14px;
  margin-bottom: 16px;
}

.potential-progress {
  margin-top: 16px;
}

.progress-bar {
  width: 100%;
  height: 8px;
  background-color: #e5e7eb;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 8px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #10b981, #059669);
  transition: width 0.3s ease;
}

.progress-label {
  font-size: 12px;
  color: #6b7280;
}

.potential-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
}

.potential-status {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  margin-top: 8px;
}

.potential-status.low {
  background-color: #fef2f2;
  color: #991b1b;
}

.potential-status.medium {
  background-color: #fef3c7;
  color: #92400e;
}

.potential-status.high {
  background-color: #ecfdf5;
  color: #065f46;
}

.potential-suggestion {
  font-size: 12px;
  color: #6b7280;
  margin-top: 8px;
  font-style: italic;
}

.overall-assessment {
  background: linear-gradient(135deg, #f0fdf4, #ecfdf5);
  border-radius: 8px;
  padding: 20px;
  border: 1px solid #a7f3d0;
}

.assessment-card {
  background: white;
  border-radius: 6px;
  padding: 16px;
}

.assessment-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.assessment-title {
  font-weight: 500;
  color: #374151;
}

.assessment-level {
  font-size: 20px;
  font-weight: bold;
  padding: 4px 12px;
  border-radius: 4px;
}

.assessment-level.level-a {
  background-color: #10b981;
  color: white;
}

.assessment-level.level-b {
  background-color: #3b82f6;
  color: white;
}

.assessment-level.level-c {
  background-color: #f59e0b;
  color: white;
}

.assessment-level.level-d {
  background-color: #ef4444;
  color: white;
}

.assessment-description {
  color: #4b5563;
  margin-bottom: 16px;
}

.assessment-recommendations h5 {
  margin: 0 0 8px 0;
  color: #374151;
  font-size: 14px;
}

.assessment-recommendations ul {
  margin: 0;
  padding-left: 20px;
}

.assessment-recommendations li {
  margin: 4px 0;
  color: #4b5563;
  font-size: 14px;
}

.update-time {
  text-align: center;
  padding-top: 16px;
  border-top: 1px solid #e5e7eb;
}

.update-time p {
  margin: 0;
  font-size: 12px;
  color: #6b7280;
}
</style>