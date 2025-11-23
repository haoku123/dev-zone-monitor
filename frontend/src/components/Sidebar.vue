<template>
  <div class="menu draggable" ref="menuRef" @mousedown="startDrag">
    <div class="drag-header">开发区列表</div>

    <!-- 省份筛选 -->
    <select v-model="selectedProvince" class="province-select">
      <option value="">全部省份</option>
      <option v-for="p in provinceOptions" :key="p" :value="p">
        {{ p }}
      </option>
    </select>

    <!-- 文件导�� -->
    <div class="upload-container">
      <div
        class="upload-zone"
        :class="{ 'dragover': isDragOver, 'uploading': isUploading }"
        @click="triggerFileSelect"
        @dragover.prevent="handleDragOver"
        @dragenter.prevent="handleDragEnter"
        @dragleave.prevent="handleDragLeave"
        @drop.prevent="handleDrop"
      >
        <input
          ref="fileInputRef"
          type="file"
          accept=".geojson,.shp,.shx,.dbf"
          @change="handleUpload"
          class="upload-input"
          multiple
        />

        <div class="upload-content">
          <div v-if="!isUploading" class="upload-icon">📁</div>
          <div v-else class="upload-spinner">⏳</div>

          <div class="upload-text">
            <div v-if="!isUploading">
              <div class="primary-text">点击或拖拽文件到此处</div>
              <div class="secondary-text">支持 GeoJSON (.geojson) 和 Shapefile (.shp, .shx, .dbf)</div>
            </div>
            <div v-else>
              <div class="primary-text">上传中...</div>
              <div class="secondary-text">{{ uploadStatus }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 上传进度 -->
      <div v-if="uploadProgress.show" class="upload-progress">
        <div class="progress-bar">
          <div
            class="progress-fill"
            :style="{ width: uploadProgress.percent + '%' }"
          ></div>
        </div>
        <div class="progress-text">{{ uploadProgress.message }}</div>
      </div>

      <!-- 最近上传的文件 -->
      <div v-if="recentUploads.length > 0" class="recent-uploads">
        <div class="recent-uploads-title">最近上传</div>
        <div
          v-for="upload in recentUploads.slice(0, 3)"
          :key="upload.id"
          class="recent-upload-item"
        >
          <span class="upload-name">{{ upload.name }}</span>
          <span class="upload-status" :class="upload.status">{{ getStatusText(upload.status) }}</span>
        </div>
      </div>
    </div>

    <!-- 关键字搜索 -->
    <input type="text" v-model="search" placeholder="搜索开发区名称..." class="search-input" />

    <!-- 列表 -->
    <div class="area-list-container">
      <ul>
        <li
          v-for="name in filteredList"
          :key="name"
          class="area-item"
        >
          <span @click="$emit('flyTo', name)">{{ name }}</span>
          <span 
            class="delete-icon" 
            @click.stop="confirmDelete(name)"
            title="删除开发区"
          >×</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  // 开发区名称数组（如 ['瑞丽边境经济合作区', ...]）
  areaList: {
    type: Array,
    default: () => []
  },
  // 名称→元数据 映射（至少包含 province）
  // 例如：{ '瑞丽边境经济合作区': { province: '云南省' }, ... }
  areaMeta: {
    type: Object,
    default: () => ({})
  }
})

const emit = defineEmits(['upload', 'flyTo', 'deleteGeojson'])

const menuRef = ref(null)
const fileInputRef = ref(null)
const search = ref('')
const selectedProvince = ref('')

const isDragging = ref(false)
let offsetX = 0
let offsetY = 0

// 拖拽上传相关状态
const isDragOver = ref(false)
const isUploading = ref(false)
const uploadStatus = ref('')
const uploadProgress = ref({
  show: false,
  percent: 0,
  message: ''
})

// 最近上传的文件
const recentUploads = ref([])

// 省份选项（从 areaMeta 动态收集）
const provinceOptions = computed(() => {
  const set = new Set()
  for (const name of props.areaList) {
    const prov = props.areaMeta?.[name]?.province
    if (prov) set.add(prov)
  }
  return Array.from(set).sort()
})

// 组合筛选：省份 + 关键字
const filteredList = computed(() => {
  const kw = search.value.trim().toLowerCase()
  const prov = selectedProvince.value
  return props.areaList.filter(name => {
    const passKw = !kw || name.toLowerCase().includes(kw)
    const passProv = !prov || props.areaMeta?.[name]?.province === prov
    return passKw && passProv
  })
})

// 文件格式验证
const validateFiles = (files) => {
  const fileArray = Array.from(files)
  const validExtensions = ['.geojson', '.shp', '.shx', '.dbf']

  const invalidFiles = fileArray.filter(file => {
    const ext = '.' + file.name.split('.').pop().toLowerCase()
    return !validExtensions.includes(ext)
  })

  if (invalidFiles.length > 0) {
    const invalidNames = invalidFiles.map(f => f.name).join(', ')
    throw new Error(`不支持的文件格式: ${invalidNames}\\n支持的格式: GeoJSON (.geojson), Shapefile (.shp, .shx, .dbf)`)
  }

  // 检查Shapefile完整性
  const shpFiles = fileArray.filter(f => f.name.toLowerCase().endsWith('.shp'))
  const shxFiles = fileArray.filter(f => f.name.toLowerCase().endsWith('.shx'))
  const dbfFiles = fileArray.filter(f => f.name.toLowerCase().endsWith('.dbf'))

  if (shpFiles.length > 0) {
    if (shxFiles.length === 0 || dbfFiles.length === 0) {
      throw new Error('上传Shapefile文件不完整，请确保同时包含 .shp、.shx 和 .dbf 文件')
    }

    // 检查Shapefile文件组是否完整（确保每个.shp文件都有对应的.shx和.dbf文件）
    const shpBaseNames = shpFiles.map(f => f.name.replace(/\.shp$/i, ''))

    for (const baseName of shpBaseNames) {
      const hasShx = shxFiles.some(f => f.name.replace(/\.shx$/i, '') === baseName)
      const hasDbf = dbfFiles.some(f => f.name.replace(/\.dbf$/i, '') === baseName)

      if (!hasShx || !hasDbf) {
        const missingFiles = []
        if (!hasShx) missingFiles.push(`${baseName}.shx`)
        if (!hasDbf) missingFiles.push(`${baseName}.dbf`)
        throw new Error(`Shapefile文件不完整\n文件 "${baseName}.shp" 缺少对应的文件: ${missingFiles.join(', ')}\n\n请确保每个.shp文件都有配套的.shx和.dbf文件`)
      }
    }
  }

  return fileArray
}

// 处理文件上传
const handleUpload = async (event) => {
  const files = event.target.files || event.dataTransfer.files

  if (files && files.length > 0) {
    try {
      const validatedFiles = validateFiles(files)
      await uploadFiles(validatedFiles)
    } catch (error) {
      alert(error.message)
    }
  }

  // 清空文件输入
  if (event.target.value !== undefined) {
    event.target.value = ''
  }
}

// 上传文件到后端
const uploadFiles = async (files) => {
  isUploading.value = true
  uploadStatus.value = '准备上传...'

  const uploadId = Date.now()
  const uploadRecord = {
    id: uploadId,
    name: getUploadDisplayName(files),
    status: 'uploading',
    timestamp: new Date()
  }

  try {
    showProgress(0, '正在上传文件...')

    const formData = new FormData()

    // 添加所有文件
    files.forEach((file) => {
      formData.append('files', file)
    })

    // 添加文件名（去除扩展名作为输出名）
    const outputName = generateOutputName(files)
    formData.append('name', outputName)

    showProgress(30, '正在处理文件格式...')

    const response = await fetch('http://localhost:8080/api/upload-shapefile', {
      method: 'POST',
      body: formData
    })

    showProgress(80, '正在解析数据...')

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`上传失败 (${response.status}): ${errorText}`)
    }

    const result = await response.json()

    showProgress(100, '上传完成！')

    // 更新上传记录
    uploadRecord.status = 'success'
    uploadRecord.result = result.data

    // 添加到最近上传列表
    recentUploads.value.unshift(uploadRecord)
    if (recentUploads.value.length > 5) {
      recentUploads.value = recentUploads.value.slice(0, 5)
    }

    // 通知父组件
    emit('upload', {
      files: files,
      result: result.data,
      type: detectFileType(files)
    })

    setTimeout(() => {
      hideProgress()
      isUploading.value = false
    }, 2000)

  } catch (error) {
    console.error('文件上传失败:', error)
    uploadRecord.status = 'error'
    uploadRecord.error = error.message
    recentUploads.value.unshift(uploadRecord)

    alert(`上传失败: ${error.message}`)
    hideProgress()
    isUploading.value = false
  }
}

// 拖拽相关处理函数
const triggerFileSelect = () => {
  fileInputRef.value?.click()
}

const handleDragOver = () => {
  isDragOver.value = true
}

const handleDragEnter = () => {
  isDragOver.value = true
}

const handleDragLeave = () => {
  isDragOver.value = false
}

const handleDrop = (event) => {
  isDragOver.value = false
  const files = event.dataTransfer.files
  if (files && files.length > 0) {
    handleUpload({ dataTransfer: event.dataTransfer })
  }
}

// 辅助函数
const detectFileType = (files) => {
  return files.some(f => f.name.toLowerCase().endsWith('.geojson')) ? 'geojson' : 'shapefile'
}

const getUploadDisplayName = (files) => {
  const fileNames = Array.from(files).map(f => f.name)
  if (fileNames.length === 1) {
    return fileNames[0]
  }
  const baseName = fileNames[0].split('.')[0]
  return `${baseName} 等${fileNames.length}个文件`
}

const generateOutputName = (files) => {
  if (files.length === 1) {
    return files[0].name.split('.')[0]
  }
  const baseName = files[0].name.split('.')[0]
  return `${baseName}_${Date.now()}`
}

const showProgress = (percent, message) => {
  uploadProgress.value = {
    show: true,
    percent: percent,
    message: message
  }
}

const hideProgress = () => {
  uploadProgress.value.show = false
  uploadProgress.value.percent = 0
  uploadProgress.value.message = ''
}

const getStatusText = (status) => {
  const statusMap = {
    'success': '✅ 成功',
    'error': '❌ 失败',
    'uploading': '⏳ 上传中'
  }
  return statusMap[status] || status
}

// 拖拽
const startDrag = (e) => {
  if (!e.target.classList.contains('drag-header')) return
  isDragging.value = true
  const menu = menuRef.value
  offsetX = e.clientX - menu.offsetLeft
  offsetY = e.clientY - menu.offsetTop
  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
}
const onDrag = (e) => {
  if (!isDragging.value) return
  const menu = menuRef.value
  menu.style.left = `${e.clientX - offsetX}px`
  menu.style.top = `${e.clientY - offsetY}px`
}
const stopDrag = () => {
  isDragging.value = false
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
}

// 确认删除对话框
const confirmDelete = (name) => {
  if (confirm(`确定要删除开发区 "${name}" 吗？`)) {
    emit('deleteGeojson', name)
  }
}
</script>

<style scoped>
.menu {
  position: absolute;
  top: 80px;
  left: 20px;
  width: 300px;
  background-color: rgba(245, 245, 245, 0.9);
  border: 1px solid #ccc;
  border-radius: 6px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
  padding: 10px 12px;
  z-index: 999;
  backdrop-filter: blur(4px);
  user-select: none;
  display: flex;
  flex-direction: column;
  max-height: 80vh;
}

.drag-header {
  font-size: 16px;
  font-weight: bold;
  cursor: move;
  margin-bottom: 12px;
  border-bottom: 1px solid #ccc;
  padding-bottom: 6px;
}

.province-select {
  width: 100%;
  padding: 8px 10px;
  margin-bottom: 10px;
  border: 1px solid #ccc;
  border-radius: 6px;
  font-size: 14px;
  background: rgba(255, 255, 255, 0.95);
  box-sizing: border-box;
}

.upload-container {
  margin-bottom: 12px;
}

.upload-zone {
  border: 2px dashed #d9d9d9;
  border-radius: 8px;
  padding: 20px 16px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s ease;
  background: rgba(255, 255, 255, 0.8);
  margin-bottom: 12px;
  min-height: 80px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.upload-zone:hover {
  border-color: #409eff;
  background: rgba(64, 158, 255, 0.05);
}

.upload-zone.dragover {
  border-color: #1890ff;
  background: rgba(24, 144, 255, 0.1);
  transform: scale(1.02);
}

.upload-zone.uploading {
  border-color: #52c41a;
  background: rgba(82, 196, 26, 0.05);
  cursor: not-allowed;
}

.upload-input {
  display: none;
}

.upload-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.upload-icon {
  font-size: 24px;
  opacity: 0.8;
}

.upload-spinner {
  font-size: 20px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.upload-text {
  font-size: 14px;
  line-height: 1.4;
}

.primary-text {
  font-weight: 500;
  color: #333;
  margin-bottom: 2px;
}

.secondary-text {
  font-size: 12px;
  color: #666;
  opacity: 0.8;
}

.upload-progress {
  margin-bottom: 12px;
}

.progress-bar {
  width: 100%;
  height: 6px;
  background: #f0f0f0;
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 4px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #409eff, #1890ff);
  transition: width 0.3s ease;
  border-radius: 3px;
}

.progress-text {
  font-size: 12px;
  color: #666;
  text-align: center;
}

.recent-uploads {
  margin-top: 8px;
  border-top: 1px solid #eee;
  padding-top: 8px;
}

.recent-uploads-title {
  font-size: 12px;
  font-weight: 500;
  color: #666;
  margin-bottom: 6px;
}

.recent-upload-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 8px;
  font-size: 12px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.6);
  margin-bottom: 4px;
}

.upload-name {
  flex: 1;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-right: 8px;
}

.upload-status {
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
}

.upload-status.success {
  color: #52c41a;
}

.upload-status.error {
  color: #ff4d4f;
}

.upload-status.uploading {
  color: #1890ff;
}

.search-input {
  width: 100%;
  padding: 8px 10px;
  margin-bottom: 16px;
  border: 1px solid #ccc;
  border-radius: 6px;
  font-size: 14px;
  background: rgba(255, 255, 255, 0.95);
  box-sizing: border-box;
}
.search-input:focus {
  border-color: #409eff;
  box-shadow: 0 0 4px rgba(64, 158, 255, 0.5);
  outline: none;
}

.menu ul {
  list-style: none;
  padding: 0;
  margin: 0;
  width: 100%;
}
.menu li {
  padding: 8px 12px;
  font-size: 14px;
  color: #333;
  cursor: pointer;
  border-radius: 4px;
  transition: background-color 0.2s;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.menu li:hover {
  background-color: #e6f7ff;
}

.area-item span:first-child {
  flex: 1;
  cursor: pointer;
}

.delete-icon {
  color: #ff4d4f;
  font-size: 18px;
  font-weight: bold;
  cursor: pointer;
  margin-left: 8px;
  display: inline-block;
  width: 20px;
  height: 20px;
  line-height: 18px;
  text-align: center;
  border-radius: 50%;
}

.delete-icon:hover {
  background-color: rgba(255, 77, 79, 0.1);
}

.area-list-container {
  overflow-y: auto;
  max-height: 400px;
  margin-right: -5px;
  padding-right: 5px;
  scrollbar-width: thin;
  scrollbar-color: #c1c1c1 transparent;
}

.area-list-container::-webkit-scrollbar {
  width: 6px;
}

.area-list-container::-webkit-scrollbar-track {
  background: transparent;
}

.area-list-container::-webkit-scrollbar-thumb {
  background-color: #c1c1c1;
  border-radius: 6px;
}

.area-list-container::-webkit-scrollbar-thumb:hover {
  background-color: #a8a8a8;
}
</style>
