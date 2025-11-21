<template>
  <div v-if="visible" class="zone-editor">
    <div class="editor-backdrop" @click="closeEditor"></div>
    <div class="editor-content">
      <div class="editor-header">
        <h3>{{ zoneData?.areaName || '开发区' }} - 数据编辑</h3>
        <div class="header-actions">
          <button class="save-btn" @click="saveData" :disabled="saving || !hasChanges">
            {{ saving ? '保存中...' : '保存更改' }}
          </button>
          <button class="close-btn" @click="closeEditor">×</button>
        </div>
      </div>

      <div class="editor-body">
        <div v-if="loading" class="loading">
          <div class="loading-spinner"></div>
          <p>正在加载数据...</p>
        </div>

        <div v-else-if="error" class="error-message">
          <p>❌ {{ error }}</p>
          <button class="retry-btn" @click="loadData">重试</button>
        </div>

        <div v-else-if="zoneData" class="editor-form">
          <div class="form-tabs">
            <button
              class="tab-btn"
              :class="{ active: activeTab === 'basic' }"
              @click="activeTab = 'basic'"
            >
              基本信息
            </button>
            <button
              class="tab-btn"
              :class="{ active: activeTab === 'land' }"
              @click="activeTab = 'land'"
            >
              土地数据
            </button>
            <button
              class="tab-btn"
              :class="{ active: activeTab === 'population' }"
              @click="activeTab = 'population'"
            >
              人口数据
            </button>
            <button
              class="tab-btn"
              :class="{ active: activeTab === 'economic' }"
              @click="activeTab = 'economic'"
            >
              经济数据
            </button>
            <button
              class="tab-btn"
              :class="{ active: activeTab === 'building' }"
              @click="activeTab = 'building'"
            >
              建筑数据
            </button>
            <button
              class="tab-btn"
              :class="{ active: activeTab === 'base' }"
              @click="activeTab = 'base'"
            >
              基底数据
            </button>
          </div>

          <div class="tab-content">
            <!-- 基本信息 -->
            <div v-if="activeTab === 'basic'" class="form-section">
              <div class="form-row">
                <div class="form-group">
                  <label>开发区代码</label>
                  <input v-model="editData.zoneCode" type="text" class="form-input" />
                </div>
                <div class="form-group">
                  <label>开发区名称</label>
                  <input v-model="editData.areaName" type="text" class="form-input" />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>高新企业数量</label>
                  <input v-model.number="editData.highTechEnterprises" type="number" class="form-input" />
                </div>
                <div class="form-group"></div>
              </div>
            </div>

            <!-- 土地数据 -->
            <div v-if="activeTab === 'land'" class="form-section">
              <h4>土地面积数据 (公顷)</h4>
              <div class="form-row">
                <div class="form-group">
                  <label>土地总面积</label>
                  <input v-model.number="editData.landData.totalLandArea" type="number" step="0.01" class="form-input" />
                </div>
                <div class="form-group">
                  <label>规划建设用地面积</label>
                  <input v-model.number="editData.landData.planningConstructionLand" type="number" step="0.01" class="form-input" />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>已批准征收土地面积</label>
                  <input v-model.number="editData.landData.approvedExpropriatedLand" type="number" step="0.01" class="form-input" />
                </div>
                <div class="form-group">
                  <label>已批准转用土地面积</label>
                  <input v-model.number="editData.landData.approvedTransferLand" type="number" step="0.01" class="form-input" />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>到达供地条件面积</label>
                  <input v-model.number="editData.landData.landReadyForSupply" type="number" step="0.01" class="form-input" />
                </div>
                <div class="form-group">
                  <label>已供应国有建设用地</label>
                  <input v-model.number="editData.landData.suppliedStateConstructionLand" type="number" step="0.01" class="form-input" />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>已建成城镇建设用地</label>
                  <input v-model.number="editData.landData.builtUrbanConstructionLand" type="number" step="0.01" class="form-input" />
                </div>
                <div class="form-group">
                  <label>工矿仓储用地面积</label>
                  <input v-model.number="editData.landData.industrialStorageLand" type="number" step="0.01" class="form-input" />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>住宅用地面积</label>
                  <input v-model.number="editData.landData.residentialLand" type="number" step="0.01" class="form-input" />
                </div>
                <div class="form-group">
                  <label>不可建设面积</label>
                  <input v-model.number="editData.landData.nonConstructionArea" type="number" step="0.01" class="form-input" />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>批而未供面积</label>
                  <input v-model.number="editData.landData.approvedUnsuppliedLand" type="number" step="0.01" class="form-input" />
                </div>
                <div class="form-group">
                  <label>闲置土地面积</label>
                  <input v-model.number="editData.landData.idleLand" type="number" step="0.01" class="form-input" />
                </div>
              </div>
            </div>

            <!-- 经济数据 -->
            <div v-if="activeTab === 'economic'" class="form-section">
              <h4>经济指标数据 (万元)</h4>
              <div class="form-row">
                <div class="form-group">
                  <label>固定资产投资</label>
                  <input v-model.number="editData.economicData.fixedAssetInvestment" type="number" step="0.01" class="form-input" />
                </div>
                <div class="form-group">
                  <label>工业总产值</label>
                  <input v-model.number="editData.economicData.industrialOutput" type="number" step="0.01" class="form-input" />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>税收总额</label>
                  <input v-model.number="editData.economicData.totalTax" type="number" step="0.01" class="form-input" />
                </div>
                <div class="form-group">
                  <label>投资强度 (万元/公顷)</label>
                  <input v-model.number="editData.benefitData.investmentIntensity" type="number" step="0.01" class="form-input" />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>产出强度 (万元/公顷)</label>
                  <input v-model.number="editData.benefitData.outputIntensity" type="number" step="0.01" class="form-input" />
                </div>
                <div class="form-group">
                  <label>税收强度 (万元/公顷)</label>
                  <input v-model.number="editData.benefitData.taxIntensity" type="number" step="0.01" class="form-input" />
                </div>
              </div>
            </div>

            <!-- 建筑数据 -->
            <div v-if="activeTab === 'building'" class="form-section">
              <h4>建筑面积数据 (万平方米)</h4>
              <div class="form-row">
                <div class="form-group">
                  <label>总建筑面积</label>
                  <input v-model.number="editData.buildingData.totalBuildingArea" type="number" step="0.01" class="form-input" />
                </div>
                <div class="form-group">
                  <label>工业建筑面积</label>
                  <input v-model.number="editData.buildingData.industrialBuildingArea" type="number" step="0.01" class="form-input" />
                </div>
              </div>
            </div>

            <!-- 企业数据 -->
            <div v-if="activeTab === 'enterprise'" class="form-section">
              <h4>企业统计数据</h4>
              <div class="form-row">
                <div class="form-group">
                  <label>企业总数</label>
                  <input v-model.number="editData.enterpriseData.totalEnterprises" type="number" class="form-input" />
                </div>
                <div class="form-group">
                  <label>高新技术企业数</label>
                  <input v-model.number="editData.enterpriseData.highTechEnterprises" type="number" class="form-input" />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>工业企业数</label>
                  <input v-model.number="editData.enterpriseData.industrialEnterprises" type="number" class="form-input" />
                </div>
                <div class="form-group">
                  <label>规模以上工业企业数</label>
                  <input v-model.number="editData.enterpriseData.aboveDesignatedEnterprises" type="number" class="form-input" />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>批发零售企业数</label>
                  <input v-model.number="editData.enterpriseData.wholesaleEnterprises" type="number" class="form-input" />
                </div>
                <div class="form-group">
                  <label>服务企业数</label>
                  <input v-model.number="editData.enterpriseData.serviceEnterprises" type="number" class="form-input" />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>物流企业数</label>
                  <input v-model.number="editData.enterpriseData.logisticsEnterprises" type="number" class="form-input" />
                </div>
                <div class="form-group"></div>
              </div>
            </div>

            <!-- 效益数据 -->
            <div v-if="activeTab === 'benefit'" class="form-section">
              <h4>效益指标数据</h4>
              <div class="form-row">
                <div class="form-group">
                  <label>投资强度 (万元/公顷)</label>
                  <input v-model.number="editData.benefitData.investmentIntensity" type="number" step="0.01" class="form-input" />
                </div>
                <div class="form-group">
                  <label>产出强度 (万元/公顷)</label>
                  <input v-model.number="editData.benefitData.outputIntensity" type="number" step="0.01" class="form-input" />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>税收强度 (万元/公顷)</label>
                  <input v-model.number="editData.benefitData.taxIntensity" type="number" step="0.01" class="form-input" />
                </div>
                <div class="form-group">
                  <label>就业密度</label>
                  <input v-model.number="editData.benefitData.employmentRate" type="number" step="0.01" class="form-input" />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>经济密度</label>
                  <input v-model.number="editData.benefitData.economicDensity" type="number" step="0.01" class="form-input" />
                </div>
                <div class="form-group">
                  <label>容积率</label>
                  <input v-model.number="editData.benefitData.plotRatio" type="number" step="0.01" class="form-input" />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>建筑密度</label>
                  <input v-model.number="editData.benefitData.buildingDensity" type="number" step="0.01" class="form-input" />
                </div>
                <div class="form-group">
                  <label>绿化覆盖率</label>
                  <input v-model.number="editData.benefitData.greenCoverageRate" type="number" step="0.01" class="form-input" />
                </div>
              </div>
            </div>

            <!-- 基础设施数据 -->
            <div v-if="activeTab === 'infrastructure'" class="form-section">
              <h4>基础设施能力数据</h4>
              <div class="form-row">
                <div class="form-group">
                  <label>供电能力</label>
                  <input v-model.number="editData.infrastructureData.electricitySupply" type="number" step="0.01" class="form-input" />
                </div>
                <div class="form-group">
                  <label>供水能力</label>
                  <input v-model.number="editData.infrastructureData.waterSupply" type="number" step="0.01" class="form-input" />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>供气能力</label>
                  <input v-model.number="editData.infrastructureData.gasSupply" type="number" step="0.01" class="form-input" />
                </div>
                <div class="form-group">
                  <label>供热能力</label>
                  <input v-model.number="editData.infrastructureData.heatingSupply" type="number" step="0.01" class="form-input" />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>污水处理能力</label>
                  <input v-model.number="editData.infrastructureData.sewageCapacity" type="number" step="0.01" class="form-input" />
                </div>
                <div class="form-group">
                  <label>通信能力</label>
                  <input v-model.number="editData.infrastructureData.telecommunicationCapacity" type="number" step="0.01" class="form-input" />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>道路面积 (公顷)</label>
                  <input v-model.number="editData.infrastructureData.roadArea" type="number" step="0.01" class="form-input" />
                </div>
                <div class="form-group"></div>
              </div>
            </div>

            <!-- 环保数据 -->
            <div v-if="activeTab === 'environment'" class="form-section">
              <h4>环保数据</h4>
              <div class="form-row">
                <div class="form-group">
                  <label>污染等级</label>
                  <select v-model="editData.environmentalData.pollutionLevel" class="form-input">
                    <option value="">请选择</option>
                    <option value="无">无</option>
                    <option value="轻度">轻度</option>
                    <option value="中度">中度</option>
                    <option value="重度">重度</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>环境评价</label>
                  <select v-model="editData.environmentalData.environmentalAssessment" class="form-input">
                    <option value="">请选择</option>
                    <option value="优秀">优秀</option>
                    <option value="良好">良好</option>
                    <option value="一般">一般</option>
                    <option value="较差">较差</option>
                  </select>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>绿化面积 (公顷)</label>
                  <input v-model.number="editData.environmentalData.greenArea" type="number" step="0.01" class="form-input" />
                </div>
                <div class="form-group">
                  <label>工业废水处理率 (%)</label>
                  <input v-model.number="editData.environmentalData.industrialWasteTreatment" type="number" step="0.01" class="form-input" />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>固废处理率 (%)</label>
                  <input v-model.number="editData.environmentalData.solidWasteTreatment" type="number" step="0.01" class="form-input" />
                </div>
                <div class="form-group"></div>
              </div>
            </div>

            <!-- 管理数据 -->
            <div v-if="activeTab === 'management'" class="form-section">
              <h4>管理数据</h4>
              <div class="form-row">
                <div class="form-group">
                  <label>管理人员数</label>
                  <input v-model.number="editData.managementData.administrativeStaff" type="number" class="form-input" />
                </div>
                <div class="form-group">
                  <label>保安人员数</label>
                  <input v-model.number="editData.managementData.securityStaff" type="number" class="form-input" />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>维护人员数</label>
                  <input v-model.number="editData.managementData.maintenanceStaff" type="number" class="form-input" />
                </div>
                <div class="form-group">
                  <label>服务人员数</label>
                  <input v-model.number="editData.managementData.serviceStaff" type="number" class="form-input" />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>利用率</label>
                  <input v-model.number="editData.managementData.utilizationRate" type="number" step="0.01" class="form-input" />
                </div>
                <div class="form-group">
                  <label>闲置率</label>
                  <input v-model.number="editData.managementData.idleRate" type="number" step="0.01" class="form-input" />
                </div>
              </div>
            </div>

            <!-- 交通数据 -->
            <div v-if="activeTab === 'transportation'" class="form-section">
              <h4>交通便利性数据 (公里)</h4>
              <div class="form-row">
                <div class="form-group">
                  <label>高速公路距离</label>
                  <input v-model.number="editData.transportationData.highwayDistance" type="number" step="0.01" class="form-input" />
                </div>
                <div class="form-group">
                  <label>铁路距离</label>
                  <input v-model.number="editData.transportationData.railwayDistance" type="number" step="0.01" class="form-input" />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>机场距离</label>
                  <input v-model.number="editData.transportationData.airportDistance" type="number" step="0.01" class="form-input" />
                </div>
                <div class="form-group">
                  <label>港口距离</label>
                  <input v-model.number="editData.transportationData.portDistance" type="number" step="0.01" class="form-input" />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>公共交通线路数</label>
                  <input v-model.number="editData.transportationData.publicTransportLines" type="number" class="form-input" />
                </div>
                <div class="form-group"></div>
              </div>
            </div>

            <!-- 人才数据 -->
            <div v-if="activeTab === 'talent'" class="form-section">
              <h4>人才与就业数据</h4>
              <div class="form-row">
                <div class="form-group">
                  <label>从业人员总数</label>
                  <input v-model.number="editData.talentData.totalEmployees" type="number" class="form-input" />
                </div>
                <div class="form-group">
                  <label>技术人员数</label>
                  <input v-model.number="editData.talentData.technicalPersonnel" type="number" class="form-input" />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>研发人员数</label>
                  <input v-model.number="editData.talentData.researchers" type="number" class="form-input" />
                </div>
                <div class="form-group">
                  <label>博士人数</label>
                  <input v-model.number="editData.talentData.doctorates" type="number" class="form-input" />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>硕士人数</label>
                  <input v-model.number="editData.talentData.masters" type="number" class="form-input" />
                </div>
                <div class="form-group">
                  <label>本科人数</label>
                  <input v-model.number="editData.talentData.bachelors" type="number" class="form-input" />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>平均教育水平</label>
                  <input v-model.number="editData.talentData.averageEducationLevel" type="number" step="0.01" class="form-input" />
                </div>
                <div class="form-group"></div>
              </div>
            </div>

            <!-- 创新数据 -->
            <div v-if="activeTab === 'innovation'" class="form-section">
              <h4>创新数据</h4>
              <div class="form-row">
                <div class="form-group">
                  <label>研发投入 (万元)</label>
                  <input v-model.number="editData.innovationData.rdExpenditure" type="number" step="0.01" class="form-input" />
                </div>
                <div class="form-group">
                  <label>专利数量</label>
                  <input v-model.number="editData.innovationData.patentCount" type="number" class="form-input" />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>创新平台数</label>
                  <input v-model.number="editData.innovationData.innovationPlatforms" type="number" class="form-input" />
                </div>
                <div class="form-group">
                  <label>技术转移项目数</label>
                  <input v-model.number="editData.innovationData.technologyTransferProjects" type="number" class="form-input" />
                </div>
              </div>
            </div>

            <!-- 财务数据 -->
            <div v-if="activeTab === 'financial'" class="form-section">
              <h4>财务数据 (万元)</h4>
              <div class="form-row">
                <div class="form-group">
                  <label>总资产</label>
                  <input v-model.number="editData.financialData.totalAssets" type="number" step="0.01" class="form-input" />
                </div>
                <div class="form-group">
                  <label>净资产</label>
                  <input v-model.number="editData.financialData.netAssets" type="number" step="0.01" class="form-input" />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>年收入</label>
                  <input v-model.number="editData.financialData.annualRevenue" type="number" step="0.01" class="form-input" />
                </div>
                <div class="form-group">
                  <label>年支出</label>
                  <input v-model.number="editData.financialData.annualExpenditure" type="number" step="0.01" class="form-input" />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>资产负债率</label>
                  <input v-model.number="editData.financialData.debtToAssetRatio" type="number" step="0.01" class="form-input" />
                </div>
                <div class="form-group"></div>
              </div>
            </div>
          </div>

          <!-- 数据验证提示 -->
          <div v-if="validationErrors.length > 0" class="validation-errors">
            <h5>⚠️ 数据验证错误:</h5>
            <ul>
              <li v-for="error in validationErrors" :key="error">{{ error }}</li>
            </ul>
          </div>

          <!-- 修改摘要 -->
          <div v-if="hasChanges" class="changes-summary">
            <h5>📝 修改摘要:</h5>
            <ul>
              <li v-for="change in changesList" :key="change.field">
                {{ change.field }}: {{ change.old }} → {{ change.new }}
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { getZoneData, updateZoneData } from '../api/api.js'

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

const emit = defineEmits(['close', 'saved'])

const loading = ref(false)
const saving = ref(false)
const error = ref(null)
const zoneData = ref(null)
const editData = ref(null)
const activeTab = ref('basic')

// 计算是否有更改
const hasChanges = computed(() => {
  if (!zoneData.value || !editData.value) return false
  return JSON.stringify(zoneData.value) !== JSON.stringify(editData.value)
})

// 计算更改列表
const changesList = computed(() => {
  const changes = []
  if (!zoneData.value || !editData.value) return changes

  const compareFields = (obj1, obj2, prefix = '') => {
    for (const key in obj2) {
      const fullPath = prefix ? `${prefix}.${key}` : key
      if (typeof obj2[key] === 'object' && obj2[key] !== null) {
        compareFields(obj1[key], obj2[key], fullPath)
      } else if (obj1[key] !== obj2[key]) {
        changes.push({
          field: getFieldDisplayName(fullPath),
          old: formatValue(obj1[key]),
          new: formatValue(obj2[key])
        })
      }
    }
  }

  compareFields(zoneData.value, editData.value)
  return changes
})

// 数据验证
const validationErrors = computed(() => {
  const errors = []
  if (!editData.value) return errors

  // 基本验证
  if (!editData.value.areaName?.trim()) {
    errors.push('开发区名称不能为空')
  }

  // 土地数据验证
  const landData = editData.value.landData
  if (landData) {
    if (landData.approvedArea < 0) errors.push('批准面积不能为负数')
    if (landData.developmentArea < 0) errors.push('开发面积不能为负数')
    if (landData.builtArea < 0) errors.push('建成面积不能为负数')
    if (landData.industrialArea < 0) errors.push('工业用地面积不能为负数')
    if (landData.approvedArea > 0 && landData.developmentArea > landData.approvedArea) {
      errors.push('开发面积不能超过批准面积')
    }
    if (landData.developmentArea > 0 && landData.builtArea > landData.developmentArea) {
      errors.push('建成面积不能超过开发面积')
    }
  }

  // 经济数据验证
  const economicData = editData.value.economicData
  if (economicData) {
    if (economicData.fixedAssetInvestment < 0) errors.push('固定资产投资不能为负数')
    if (economicData.industrialOutput < 0) errors.push('工业总产值不能为负数')
    if (economicData.totalTax < 0) errors.push('税收总额不能为负数')
  }

  // 建筑数据验证
  const buildingData = editData.value.buildingData
  if (buildingData) {
    if (buildingData.totalBuildingArea < 0) errors.push('总建筑面积不能为负数')
    if (buildingData.industrialBuildingArea < 0) errors.push('工业建筑面积不能为负数')
    if (buildingData.totalBuildingArea > 0 && buildingData.industrialBuildingArea > buildingData.totalBuildingArea) {
      errors.push('工业建筑面积不能超过总建筑面积')
    }
  }

  // 企业数据验证
  const enterpriseData = editData.value.enterpriseData
  if (enterpriseData) {
    if (enterpriseData.totalEnterprises < 0) errors.push('企业总数不能为负数')
    if (enterpriseData.highTechEnterprises < 0) errors.push('高新技术企业数不能为负数')
    if (enterpriseData.totalEnterprises > 0 && enterpriseData.highTechEnterprises > enterpriseData.totalEnterprises) {
      errors.push('高新技术企业数不能超过企业总数')
    }
  }

  return errors
})

// 字段显示名称映射
const getFieldDisplayName = (field) => {
  const nameMap = {
    'areaName': '开发区名称',
    'province': '所属省份',
    'city': '所属城市',
    'landData.approvedArea': '批准面积',
    'landData.developmentArea': '开发面积',
    'landData.builtArea': '建成面积',
    'landData.industrialArea': '工业用地面积',
    'economicData.fixedAssetInvestment': '固定资产投资',
    'economicData.industrialOutput': '工业总产值',
    'economicData.totalTax': '税收总额',
    'benefitData.investmentIntensity': '投资强度',
    'benefitData.outputIntensity': '产出强度',
    'benefitData.taxIntensity': '税收强度',
    'buildingData.totalBuildingArea': '总建筑面积',
    'buildingData.industrialBuildingArea': '工业建筑面积',
    'enterpriseData.totalEnterprises': '企业总数',
    'enterpriseData.highTechEnterprises': '高新技术企业数'
  }
  return nameMap[field] || field
}

// 格式化值显示
const formatValue = (value) => {
  if (value === null || value === undefined) return 'N/A'
  if (typeof value === 'number') {
    return value.toLocaleString('zh-CN')
  }
  return value.toString()
}

const loadData = async () => {
  if (!props.areaName) return

  loading.value = true
  error.value = null

  try {
    const data = await getZoneData(props.areaName)
    zoneData.value = JSON.parse(JSON.stringify(data)) // 深拷贝
    editData.value = JSON.parse(JSON.stringify(data)) // 深拷贝用于编辑
  } catch (err) {
    console.error('获取开发区数据失败:', err)
    error.value = '获取数据失败: ' + err.message
  } finally {
    loading.value = false
  }
}

const saveData = async () => {
  if (!props.areaName || !editData.value || validationErrors.value.length > 0) return

  saving.value = true

  try {
    await updateZoneData(props.areaName, editData.value)

    // 更新原始数据
    zoneData.value = JSON.parse(JSON.stringify(editData.value))

    emit('saved', {
      areaName: props.areaName,
      data: editData.value
    })

    closeEditor()
  } catch (err) {
    console.error('保存数据失败:', err)
    error.value = '保存失败: ' + err.message
  } finally {
    saving.value = false
  }
}

const closeEditor = () => {
  if (hasChanges.value) {
    if (!confirm('有未保存的更改，确定要关闭吗？')) {
      return
    }
  }
  emit('close')
}

// 监听areaName变化，重新加载数据
watch(() => props.areaName, (newName) => {
  if (newName && props.visible) {
    loadData()
  }
})

// 监听visible变化，显示时加载数据
watch(() => props.visible, (visible) => {
  if (visible && props.areaName) {
    loadData()
    activeTab.value = 'basic'
  }
})
</script>

<style scoped>
.zone-editor {
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

.editor-backdrop {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
}

.editor-content {
  position: relative;
  background: white;
  border-radius: 8px;
  width: 95%;
  max-width: 1000px;
  max-height: 90vh;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #e5e7eb;
  background-color: #f8fafc;
  border-radius: 8px 8px 0 0;
}

.editor-header h3 {
  margin: 0;
  color: #1f2937;
  font-size: 18px;
}

.header-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.save-btn {
  background-color: #10b981;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  transition: background-color 0.2s;
}

.save-btn:hover:not(:disabled) {
  background-color: #059669;
}

.save-btn:disabled {
  background-color: #9ca3af;
  cursor: not-allowed;
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

.editor-body {
  flex: 1;
  overflow-y: auto;
  padding: 0;
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

.retry-btn {
  background-color: #3b82f6;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  margin-top: 16px;
}

.editor-form {
  padding: 24px;
}

.form-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 24px;
  border-bottom: 1px solid #e5e7eb;
}

.tab-btn {
  background: none;
  border: none;
  padding: 12px 20px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  color: #6b7280;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
}

.tab-btn.active {
  color: #3b82f6;
  border-bottom-color: #3b82f6;
}

.tab-btn:hover {
  color: #1f2937;
}

.tab-content {
  min-height: 400px;
}

.form-section {
  space-y: 20px;
}

.form-section h4 {
  margin: 0 0 20px 0;
  color: #374151;
  font-size: 16px;
  border-bottom: 2px solid #e5e7eb;
  padding-bottom: 8px;
}

.form-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
  margin-bottom: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
}

.form-group label {
  font-weight: 500;
  color: #374151;
  margin-bottom: 6px;
  font-size: 14px;
}

.form-input {
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  transition: border-color 0.2s;
}

.form-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.validation-errors {
  margin-top: 24px;
  padding: 16px;
  background-color: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 6px;
  color: #991b1b;
}

.validation-errors h5 {
  margin: 0 0 12px 0;
  font-size: 14px;
}

.validation-errors ul {
  margin: 0;
  padding-left: 20px;
}

.validation-errors li {
  margin: 4px 0;
  font-size: 14px;
}

.changes-summary {
  margin-top: 24px;
  padding: 16px;
  background-color: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 6px;
  color: #1e40af;
}

.changes-summary h5 {
  margin: 0 0 12px 0;
  font-size: 14px;
}

.changes-summary ul {
  margin: 0;
  padding-left: 20px;
}

.changes-summary li {
  margin: 4px 0;
  font-size: 14px;
}
</style>