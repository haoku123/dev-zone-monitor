<template>
  <div v-if="visible" class="indicator-panel">
    <div class="panel-backdrop" @click="closePanel"></div>
    <div class="panel-content">
      <div class="panel-header">
        <h3>{{ areaName }} - 评价指标 ({{ getZoneTypeName() }})</h3>
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
                <div class="zone-type-badge">{{ getZoneTypeName() }}</div>
              </div>
            </div>
          </div>

          <!-- 详细指标 - 按照国家标准指标体系 -->
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
                <div class="indicator-item">
                  <span class="indicator-name">土地供应率</span>
                  <span class="indicator-value">{{ formatPercent(indicators.landUtilizationStatus?.landDevelopmentLevel?.landSupplyRate?.value) }}</span>
                  <span class="indicator-formula">{{ indicators.landUtilizationStatus?.landDevelopmentLevel?.landSupplyRate?.formula }}</span>
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
                <div class="indicator-item">
                  <span class="indicator-name">建筑密度</span>
                  <span class="indicator-value">{{ formatPercent(indicators.landUtilizationStatus?.landStructureStatus?.buildingDensity?.value) }}</span>
                  <span class="indicator-formula">{{ indicators.landUtilizationStatus?.landStructureStatus?.buildingDensity?.formula }}</span>
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
                  <span class="indicator-value">{{ formatNumber(indicators.landUtilizationStatus?.landUseIntensity?.perCapitaConstructionLand?.value, 1) }}</span>
                  <span class="indicator-formula">{{ indicators.landUtilizationStatus?.landUseIntensity?.perCapitaConstructionLand?.formula }}</span>
                  <span class="indicator-unit">m²/人</span>
                </div>
              </div>
            </div>

            <!-- 用地效益 (权重: 20%) -->
            <div class="indicator-section">
              <h4>用地效益 (权重: 20%)</h4>
              <div class="indicator-group">
                <div class="indicator-item">
                  <span class="indicator-name">固定资产投资强度</span>
                  <span class="indicator-value">{{ formatNumber(indicators.economicBenefit?.outputBenefit?.fixedAssetInvestmentIntensity?.value) }}</span>
                  <span class="indicator-formula">{{ indicators.economicBenefit?.outputBenefit?.fixedAssetInvestmentIntensity?.formula }}</span>
                  <span class="indicator-unit">万元/公顷</span>
                </div>
                <div class="indicator-item">
                  <span class="indicator-name">工商企业密度</span>
                  <span class="indicator-value">{{ formatNumber(indicators.economicBenefit?.outputBenefit?.commercialEnterpriseDensity?.value, 1) }}</span>
                  <span class="indicator-formula">{{ indicators.economicBenefit?.outputBenefit?.commercialEnterpriseDensity?.formula }}</span>
                  <span class="indicator-unit">家/公顷</span>
                </div>
              </div>

              <!-- 特色指标 - 根据开发区类型显示 -->
              <h5 class="sub-section-title">特色指标</h5>
              <div class="indicator-group special-indicators">
                <div class="indicator-item" v-if="getZoneType() === 'economic'">
                  <span class="indicator-name">地均GDP</span>
                  <span class="indicator-value">{{ formatNumber(indicators.specialIndicators?.gdpPerLand?.value) }}</span>
                  <span class="indicator-formula">{{ indicators.specialIndicators?.gdpPerLand?.formula }}</span>
                  <span class="indicator-unit">万元/公顷</span>
                </div>
                <div class="indicator-item" v-if="getZoneType() === 'highTech'">
                  <span class="indicator-name">高新技术企业收入产出强度</span>
                  <span class="indicator-value">{{ formatNumber(indicators.specialIndicators?.highTechRevenueIntensity?.value) }}</span>
                  <span class="indicator-formula">{{ indicators.specialIndicators?.highTechRevenueIntensity?.formula }}</span>
                  <span class="indicator-unit">万元/公顷</span>
                </div>
                <div class="indicator-item" v-if="getZoneType() === 'bonded'">
                  <span class="indicator-name">单位面积贸易额</span>
                  <span class="indicator-value">{{ formatNumber(indicators.specialIndicators?.tradeValuePerLand?.value) }}</span>
                  <span class="indicator-formula">{{ indicators.specialIndicators?.tradeValuePerLand?.formula }}</span>
                  <span class="indicator-unit">万元/公顷</span>
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
                <div class="indicator-item">
                  <span class="indicator-name">闲置土地面积</span>
                  <span class="indicator-value">{{ formatNumber(indicators.managementPerformance?.landUseSupervisionPerformance?.idleLandArea?.value, 2) }}</span>
                  <span class="indicator-formula">{{ indicators.managementPerformance?.landUseSupervisionPerformance?.idleLandArea?.formula }}</span>
                  <span class="indicator-unit">公顷</span>
                </div>
              </div>
            </div>

            <!-- 社会效益 (权重: 15%) -->
            <div class="indicator-section">
              <h4>社会效益 (权重: 15%)</h4>
              <div class="indicator-group">
                <div class="indicator-item">
                  <span class="indicator-name">地均税收</span>
                  <span class="indicator-value">{{ formatNumber(indicators.socialBenefit?.socialBenefitIndicators?.taxPerLand?.value, 1) }}</span>
                  <span class="indicator-formula">{{ indicators.socialBenefit?.socialBenefitIndicators?.taxPerLand?.formula }}</span>
                  <span class="indicator-unit">万元/公顷</span>
                </div>
                <div class="indicator-item" v-if="getZoneType() === 'highTech'">
                  <span class="indicator-name">亩均地税收</span>
                  <span class="indicator-value">{{ formatNumber(indicators.specialIndicators?.taxPerLand?.value, 1) }}</span>
                  <span class="indicator-formula">{{ indicators.specialIndicators?.taxPerLand?.formula }}</span>
                  <span class="indicator-unit">万元/亩</span>
                </div>
                <div class="indicator-item" v-if="getZoneType() === 'bonded'">
                  <span class="indicator-name">地均工业税收</span>
                  <span class="indicator-value">{{ formatNumber(indicators.specialIndicators?.industrialTaxPerLand?.value, 1) }}</span>
                  <span class="indicator-formula">{{ indicators.specialIndicators?.industrialTaxPerLand?.formula }}</span>
                  <span class="indicator-unit">万元/公顷</span>
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

// 确定开发区类型
const getZoneType = () => {
  if (!props.areaName) return 'other'
  const nameStr = props.areaName.toLowerCase()

  if (nameStr.includes('高新')) return 'highTech'
  else if (nameStr.includes('保税')) return 'bonded'
  else if (nameStr.includes('经济') || nameStr.includes('经开')) return 'economic'
  else return 'other'
}

// 获取开发区类型名称
const getZoneTypeName = () => {
  const typeMap = {
    highTech: '高新区',
    bonded: '综合保税区',
    economic: '经开区',
    other: '其他开发区'
  }
  return typeMap[getZoneType()] || '其他开发区'
}

// 计算综合得分
const overallScore = computed(() => {
  if (!indicators.value) return 0

  // 标准指标体系权重分配
  const weights = {
    landUtilizationStatus: 0.50,    // 土地利用状况
    economicBenefit: 0.20,          // 用地效益
    managementPerformance: 0.15,   // 管理绩效
    socialBenefit: 0.15            // 社会效益
  }

  // 按照国家标准指标体系计算各维度得分
  const calculateLandUtilizationScore = () => {
    if (!indicators.value.landUtilizationStatus) return 0

    const data = indicators.value.landUtilizationStatus
    let totalScore = 0

    // 1.1 土地开发程度 (权重: 0.2)
    const landDevelopmentRate = data.landDevelopmentLevel?.landDevelopmentRate?.value || 0
    const landDevelopmentScore = Math.min(landDevelopmentRate * 100, 100) // 理想值: 100%

    // 1.2 用地结构状况 (权重: 0.25)
    const industrialLandRate = data.landStructureStatus?.industrialLandRate?.value || 0
    // 工业用地率理想值60%，按照偏离理想值的程度计算分数
    const industrialLandScore = Math.max(0, 100 - Math.abs((industrialLandRate * 100) - 60) * 2)

    // 1.3 土地利用强度 (权重: 0.55)
    const comprehensivePlotRatio = data.landUseIntensity?.comprehensivePlotRatio?.value || 0
    const industrialPlotRatio = data.landUseIntensity?.industrialPlotRatio?.value || 0
    const perCapitaConstructionLand = data.landUseIntensity?.perCapitaConstructionLand?.value || 0

    // 根据不同开发区类型使用不同的理想值
    const zoneType = getZoneType()
    let idealComprehensivePlotRatio = 1.0 // 默认值
    let idealIndustrialPlotRatio = 0.8
    let idealPerCapitaLand = 0.01 // 公顷/人

    if (zoneType === 'economic') {
      idealComprehensivePlotRatio = 1.5
      idealIndustrialPlotRatio = 1.2
    } else if (zoneType === 'highTech') {
      idealComprehensivePlotRatio = 1.5
      idealIndustrialPlotRatio = 1.2
    } else if (zoneType === 'bonded') {
      idealComprehensivePlotRatio = 1.0
      idealIndustrialPlotRatio = 0.8
    }

    // 容积率评分：实际值/理想值 * 100，最高不超过100
    const comprehensivePlotRatioScore = Math.min((comprehensivePlotRatio / idealComprehensivePlotRatio) * 100, 100)
    const industrialPlotRatioScore = Math.min((industrialPlotRatio / idealIndustrialPlotRatio) * 100, 100)

    // 人均建设用地是负向指标（越低越好），单位转换为公顷
    const perCapitaLandHectares = perCapitaConstructionLand / 10000
    const perCapitaLandScore = perCapitaLandHectares > 0 ?
      Math.max(0, 100 - (perCapitaLandHectares / idealPerCapitaLand - 1) * 100) : 0

    // 土地利用强度加权平均
    const landUseIntensityScore = (comprehensivePlotRatioScore * 0.45 +
                                 industrialPlotRatioScore * 0.45 +
                                 perCapitaLandScore * 0.15)

    // 土地利用状况总分
    totalScore = (landDevelopmentScore * 0.2 +
                  industrialLandScore * 0.25 +
                  landUseIntensityScore * 0.55)

    return totalScore
  }

  const calculateEconomicBenefitScore = () => {
    if (!indicators.value.economicBenefit?.outputBenefit) return 0

    const outputData = indicators.value.economicBenefit.outputBenefit
    const zoneType = getZoneType()

    const fixedAssetInvestmentIntensity = outputData.fixedAssetInvestmentIntensity?.value || 0
    const enterpriseRevenuePerLand = outputData.commercialEnterpriseDensity?.value || 0 // 这里用地均企业收入

    // 根据开发区类型使用不同的理想值
    let idealFixedAssetIntensity = 12000 // 万元/公顷
    let idealEnterpriseRevenue = 20000

    if (zoneType === 'economic') {
      idealFixedAssetIntensity = 15000
    } else if (zoneType === 'highTech') {
      idealFixedAssetIntensity = 15000
    } else if (zoneType === 'bonded') {
      idealFixedAssetIntensity = 12000
    }

    // 固定资产投资强度评分
    const fixedAssetScore = Math.min((fixedAssetInvestmentIntensity / idealFixedAssetIntensity) * 100, 100)

    // 根据开发区类型计算效益评分
    let economicBenefitScore = 0
    if (zoneType === 'economic') {
      // 经开区：固定资产投资强度 + 地均企业收入
      const enterpriseRevenueScore = Math.min((enterpriseRevenuePerLand / idealEnterpriseRevenue) * 100, 100)
      economicBenefitScore = (fixedAssetScore * 0.7 + enterpriseRevenueScore * 0.3)
    } else if (zoneType === 'highTech') {
      // 高新区：固定资产投资强度 + 工商企业密度
      const commercialDensity = outputData.commercialEnterpriseDensity?.value || 0
      const commercialDensityScore = Math.min((commercialDensity / 50) * 100, 100) // 理想值50家/公顷
      economicBenefitScore = (fixedAssetScore * 0.5 + commercialDensityScore * 0.5)
    } else {
      // 其他开发区：只用固定资产投资强度
      economicBenefitScore = fixedAssetScore
    }

    return economicBenefitScore
  }

  const calculateManagementScore = () => {
    if (!indicators.value.managementPerformance?.landUseSupervisionPerformance) return 0

    const landIdleRate = indicators.value.managementPerformance.landUseSupervisionPerformance.landIdleRate?.value || 0
    // 土地闲置率是负向指标，理想值为0
    return Math.max(0, 100 - landIdleRate * 100 * 10) // landIdleRate是比率，乘以100转换为百分比
  }

  const calculateSocialBenefitScore = () => {
    if (!indicators.value.socialBenefit?.socialBenefitIndicators) return 0

    const taxPerLand = indicators.value.socialBenefit.socialBenefitIndicators.taxPerLand?.value || 0
    const zoneType = getZoneType()
    let idealTaxPerLand = 1200 // 万元/公顷

    if (zoneType === 'economic' || zoneType === 'highTech') {
      idealTaxPerLand = 2000
    } else if (zoneType === 'bonded') {
      idealTaxPerLand = 1200
    }

    return Math.min((taxPerLand / idealTaxPerLand) * 100, 100)
  }

  // 计算各维度得分
  const scores = {
    landUtilizationStatus: calculateLandUtilizationScore(),
    economicBenefit: calculateEconomicBenefitScore(),
    managementPerformance: calculateManagementScore(),
    socialBenefit: calculateSocialBenefitScore()
  }

  // 计算加权总分
  const weightedScore =
    scores.landUtilizationStatus * weights.landUtilizationStatus +
    scores.economicBenefit * weights.economicBenefit +
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

.score-description {
  flex: 1;
}

.score-description p {
  margin: 0 0 12px 0;
  color: #1e40af;
  font-size: 14px;
}

.zone-type-badge {
  display: inline-block;
  padding: 4px 12px;
  background-color: #dbeafe;
  color: #1e40af;
  border-radius: 16px;
  font-size: 12px;
  font-weight: 500;
}

.detailed-indicators {
  space-y: 24px;
}

.indicator-section {
  margin-bottom: 32px;
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

.indicator-group.special-indicators .indicator-item {
  border-left: 4px solid #10b981;
  background-color: #ecfdf5;
}

.indicator-item {
  display: grid;
  grid-template-columns: 240px 120px 1fr;
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