<template>
  <div v-if="visible" class="indicator-panel">
    <div class="panel-backdrop" @click="closePanel"></div>
    <div class="panel-content">
      <div class="panel-header">
        <h3>{{ areaName }} - 评价指标</h3>
        <button class="close-btn" @click="closePanel">×</button>
      </div>

      <div class="panel-body">
        <div v-if="loading" class="loading">
          <div class="loading-spinner"></div>
          <p>正在计算评价指标...</p>
        </div>

        <div v-else-if="error" class="error-message">
          <p>❌ {{ error }}</p>
        </div>

        <div v-else-if="indicators" class="indicators-content">
          <!-- 综合得分 -->
          <div class="overall-score">
            <h4>综合评价</h4>
            <div class="score-display">
              <div class="score-circle">
                <div class="score-value">{{ overallScore }}</div>
                <div class="score-label">综合得分</div>
              </div>
              <div class="score-description">
                <p>{{ getScoreDescription(overallScore) }}</p>
              </div>
            </div>
          </div>

          <!-- 详细指标 - 按照标准指标体系 -->
          <div class="detailed-indicators">
            <!-- 土地利用状况 (权重: 50%) -->
            <div class="indicator-section">
              <h4>土地利用状况 (权重: 50%)</h4>

              <!-- 土地开发程度 (权重: 20%) -->
              <h5 class="sub-section-title">土地开发程度 (权重: 20%)</h5>
              <div class="indicator-group">
                <div class="indicator-item">
                  <span class="indicator-name">土地开发率</span>
                  <span class="indicator-value">{{ formatPercent(indicators.landUtilizationStatus?.landDevelopmentLevel?.landDevelopmentRate?.value) }}</span>
                  <span class="indicator-formula">{{ indicators.landUtilizationStatus?.landDevelopmentLevel?.landDevelopmentRate?.formula }}</span>
                </div>
              </div>

              <!-- 用地结构状况 (权重: 25%) -->
              <h5 class="sub-section-title">用地结构状况 (权重: 25%)</h5>
              <div class="indicator-group">
                <div class="indicator-item">
                  <span class="indicator-name">工业用地率</span>
                  <span class="indicator-value">{{ formatPercent(indicators.landUtilizationStatus?.landStructureStatus?.industrialLandRate?.value) }}</span>
                  <span class="indicator-formula">{{ indicators.landUtilizationStatus?.landStructureStatus?.industrialLandRate?.formula }}</span>
                </div>
              </div>

              <!-- 土地利用强度 (权重: 55%) -->
              <h5 class="sub-section-title">土地利用强度 (权重: 55%)</h5>
              <div class="indicator-group">
                <div class="indicator-item">
                  <span class="indicator-name">综合容积率</span>
                  <span class="indicator-value">{{ formatNumber(indicators.landUtilizationStatus?.landUseIntensity?.comprehensivePlotRatio?.value) }}</span>
                  <span class="indicator-formula">{{ indicators.landUtilizationStatus?.landUseIntensity?.comprehensivePlotRatio?.formula }}</span>
                </div>
                <div class="indicator-item">
                  <span class="indicator-name">工业用地综合容积率</span>
                  <span class="indicator-value">{{ formatNumber(indicators.landUtilizationStatus?.landUseIntensity?.industrialPlotRatio?.value) }}</span>
                  <span class="indicator-formula">{{ indicators.landUtilizationStatus?.landUseIntensity?.industrialPlotRatio?.formula }}</span>
                </div>
                <div class="indicator-item">
                  <span class="indicator-name">人均建设用地</span>
                  <span class="indicator-value">{{ formatNumber(indicators.landUtilizationStatus?.landUseIntensity?.perCapitaConstructionLand?.value, 4) }}</span>
                  <span class="indicator-formula">{{ indicators.landUtilizationStatus?.landUseIntensity?.perCapitaConstructionLand?.formula }}</span>
                  <span class="indicator-unit">公顷/人</span>
                </div>
              </div>
            </div>

            <!-- 用地效益 (权重: 20%) -->
            <div class="indicator-section">
              <h4>用地效益 (权重: 20%)</h4>
              <div class="indicator-group">
                <div class="indicator-item">
                  <span class="indicator-name">固定资产投资强度</span>
                  <span class="indicator-value">{{ formatNumber(indicators.landUseBenefit?.outputBenefit?.fixedAssetInvestmentIntensity?.value) }}</span>
                  <span class="indicator-formula">{{ indicators.landUseBenefit?.outputBenefit?.fixedAssetInvestmentIntensity?.formula }}</span>
                  <span class="indicator-unit">亿元/公顷</span>
                </div>
                <div class="indicator-item">
                  <span class="indicator-name">工商企业密度</span>
                  <span class="indicator-value">{{ formatNumber(indicators.landUseBenefit?.outputBenefit?.commercialEnterpriseDensity?.value) }}</span>
                  <span class="indicator-formula">{{ indicators.landUseBenefit?.outputBenefit?.commercialEnterpriseDensity?.formula }}</span>
                  <span class="indicator-unit">个/公顷</span>
                </div>
              </div>
            </div>

            <!-- 管理绩效 (权重: 15%) -->
            <div class="indicator-section">
              <h4>管理绩效 (权重: 15%)</h4>
              <div class="indicator-group">
                <div class="indicator-item">
                  <span class="indicator-name">土地闲置率</span>
                  <span class="indicator-value">{{ formatPercent(indicators.managementPerformance?.landUseSupervisionPerformance?.landIdleRate?.value) }}</span>
                  <span class="indicator-formula">{{ indicators.managementPerformance?.landUseSupervisionPerformance?.landIdleRate?.formula }}</span>
                </div>
              </div>
            </div>

            <!-- 社会效益 (权重: 15%) -->
            <div class="indicator-section">
              <h4>社会效益 (权重: 15%)</h4>
              <div class="indicator-group">
                <div class="indicator-item">
                  <span class="indicator-name">地均税收</span>
                  <span class="indicator-value">{{ formatNumber(indicators.socialBenefit?.socialBenefitIndicators?.taxPerLand?.value) }}</span>
                  <span class="indicator-formula">{{ indicators.socialBenefit?.socialBenefitIndicators?.taxPerLand?.formula }}</span>
                  <span class="indicator-unit">亿元/公顷</span>
                </div>
                <div class="indicator-item">
                  <span class="indicator-name">地均工业税收</span>
                  <span class="indicator-value">{{ formatNumber(indicators.socialBenefit?.socialBenefitIndicators?.industrialTaxPerLand?.value) }}</span>
                  <span class="indicator-formula">{{ indicators.socialBenefit?.socialBenefitIndicators?.industrialTaxPerLand?.formula }}</span>
                  <span class="indicator-unit">亿元/公顷</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 更新时间 -->
          <div class="update-time">
            <p>数据更新时间: {{ formatTime(indicators.lastUpdated) }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { getZoneIndicators } from '../api/api.js'

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
const indicators = ref(null)

// 计算综合得分
const overallScore = computed(() => {
  if (!indicators.value) return 0

  // 标准指标体系权重分配
  const weights = {
    landUtilizationStatus: 0.50,    // 土地利用状况
    landUseBenefit: 0.20,          // 用地效益
    managementPerformance: 0.15,   // 管理绩效
    socialBenefit: 0.15            // 社会效益
  }

  // 计算各维度得分（简化计算，实际应该有更复杂的评分标准）
  const calculateDimensionScore = (dimension) => {
    if (!indicators.value[dimension]) return 0

    const data = indicators.value[dimension]
    let score = 0
    let count = 0

    // 遍历该维度的所有指标
    const traverseIndicators = (obj) => {
      for (const key in obj) {
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          if (obj[key].value !== undefined) {
            // 将比率转换为百分制得分
            let value = obj[key].value
            if (typeof value === 'number' && value <= 1) {
              value = value * 100
            }
            score += Math.min(value, 100)
            count++
          } else {
            traverseIndicators(obj[key])
          }
        }
      }
    }

    traverseIndicators(data)
    return count > 0 ? score / count : 0
  }

  // 计算各维度得分
  const scores = {
    landUtilizationStatus: calculateDimensionScore('landUtilizationStatus'),
    landUseBenefit: calculateDimensionScore('landUseBenefit'),
    managementPerformance: calculateDimensionScore('managementPerformance'),
    socialBenefit: calculateDimensionScore('socialBenefit')
  }

  // 计算加权总分
  const weightedScore =
    scores.landUtilizationStatus * weights.landUtilizationStatus +
    scores.landUseBenefit * weights.landUseBenefit +
    scores.managementPerformance * weights.managementPerformance +
    scores.socialBenefit * weights.socialBenefit

  return Math.min(100, Math.round(weightedScore))
})

const formatPercent = (value) => {
  if (value === null || value === undefined) return 'N/A'
  return `${(value * 100).toFixed(1)}%`
}

const formatNumber = (value, decimals = 2) => {
  if (value === null || value === undefined) return 'N/A'
  return value.toFixed(decimals)
}

const formatTime = (timeString) => {
  if (!timeString) return 'N/A'
  return new Date(timeString).toLocaleString('zh-CN')
}

const getScoreDescription = (score) => {
  if (score >= 90) return '优秀 - 开发区整体运营水平很高'
  if (score >= 80) return '良好 - 开发区运营水平较高'
  if (score >= 70) return '中等 - 开发区运营水平一般'
  if (score >= 60) return '及格 - 开发区运营水平较低'
  return '较差 - 开发区运营水平很低'
}

const loadIndicators = async () => {
  if (!props.areaName) return

  loading.value = true
  error.value = null
  indicators.value = null

  try {
    const result = await getZoneIndicators(props.areaName)
    indicators.value = result
  } catch (err) {
    console.error('获取评价指标失败:', err)
    error.value = '获取评价指标失败: ' + err.message
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
    loadIndicators()
  }
})

// 监听visible变化，显示时加载数据
watch(() => props.visible, (visible) => {
  if (visible && props.areaName) {
    loadIndicators()
  }
})
</script>

<style scoped>
.indicator-panel {
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
  max-width: 800px;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #e5e7eb;
  background-color: #f9fafb;
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
  border-top: 4px solid #3b82f6;
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

.overall-score {
  margin-bottom: 32px;
  padding: 24px;
  background-color: #f0f9ff;
  border-radius: 8px;
  border: 1px solid #bae6fd;
}

.overall-score h4 {
  margin: 0 0 20px 0;
  color: #1e40af;
  font-size: 16px;
}

.score-display {
  display: flex;
  align-items: center;
  gap: 24px;
}

.score-circle {
  width: 100px;
  height: 100px;
  border-radius: 50%;
  background: linear-gradient(135deg, #3b82f6, #1d4ed8);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: white;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
}

.score-value {
  font-size: 28px;
  font-weight: bold;
  line-height: 1;
}

.score-label {
  font-size: 12px;
  margin-top: 4px;
  opacity: 0.9;
}

.score-description p {
  margin: 0;
  color: #1e40af;
  font-size: 14px;
}

.detailed-indicators {
  space-y: 24px;
}

.indicator-section {
  margin-bottom: 24px;
}

.indicator-section h4 {
  margin: 0 0 16px 0;
  color: #374151;
  font-size: 16px;
  border-bottom: 2px solid #e5e7eb;
  padding-bottom: 8px;
}

.sub-section-title {
  margin: 16px 0 12px 0;
  color: #4b5563;
  font-size: 14px;
  font-weight: 600;
  border-bottom: 1px solid #e5e7eb;
  padding-bottom: 6px;
}

.indicator-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.indicator-item {
  display: grid;
  grid-template-columns: 200px 120px 1fr;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  background-color: #f9fafb;
  border-radius: 6px;
  border-left: 4px solid #3b82f6;
}

.indicator-name {
  font-weight: 500;
  color: #374151;
}

.indicator-value {
  font-weight: bold;
  color: #1f2937;
  text-align: center;
}

.indicator-formula,
.indicator-unit {
  font-size: 12px;
  color: #6b7280;
  font-style: italic;
}

.update-time {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid #e5e7eb;
  text-align: center;
}

.update-time p {
  margin: 0;
  font-size: 12px;
  color: #6b7280;
}
</style>