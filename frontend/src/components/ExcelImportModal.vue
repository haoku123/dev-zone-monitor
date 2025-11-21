<template>
  <div v-if="visible" class="excel-import-modal">
    <div class="modal-backdrop" @click="closeModal"></div>
    <div class="modal-content">
      <div class="modal-header">
        <h3>Excel数据导入</h3>
        <button class="close-btn" @click="closeModal">×</button>
      </div>

      <div class="modal-body">
        <div class="upload-area"
             :class="{ 'drag-over': isDragOver }"
             @drop="handleDrop"
             @dragover="handleDragOver"
             @dragleave="handleDragLeave">

          <div v-if="!selectedFile" class="upload-prompt">
            <div class="upload-icon">📊</div>
            <p>拖拽Excel文件到此处或点击选择文件</p>
            <p class="upload-tip">支持 .xlsx 格式文件</p>
            <input type="file"
                   ref="fileInput"
                   accept=".xlsx,.xls"
                   @change="handleFileSelect"
                   style="display: none;">
            <button class="select-btn" @click="triggerFileSelect">选择文件</button>
          </div>

          <div v-else class="selected-file">
            <div class="file-info">
              <span class="file-name">{{ selectedFile.name }}</span>
              <span class="file-size">({{ formatFileSize(selectedFile.size) }})</span>
            </div>
            <button class="remove-btn" @click="removeFile">移除</button>
          </div>
        </div>

        <div v-if="importResult" class="import-result" :class="{ 'success': importResult.success, 'error': !importResult.success }">
          <div class="result-icon">{{ importResult.success ? '✅' : '❌' }}</div>
          <div class="result-message">{{ importResult.message }}</div>
          <div v-if="importResult.data" class="result-details">
            <p>成功导入以下开发区：</p>
            <ul>
              <li v-for="zone in importResult.data" :key="zone.areaName">
                {{ zone.areaName }} ({{ zone.province }} - {{ zone.city }})
              </li>
            </ul>
          </div>
        </div>

        <div class="import-actions">
          <button
            class="import-btn"
            :disabled="!selectedFile || importing"
            @click="handleImport">
            {{ importing ? '导入中...' : '开始导入' }}
          </button>
          <button class="cancel-btn" @click="closeModal">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, defineProps, defineEmits } from 'vue'
import { importExcel } from '../api/api.js'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close', 'import-success'])

const fileInput = ref(null)
const selectedFile = ref(null)
const isDragOver = ref(false)
const importing = ref(false)
const importResult = ref(null)

const triggerFileSelect = () => {
  fileInput.value?.click()
}

const handleFileSelect = (event) => {
  const file = event.target.files[0]
  if (file && isExcelFile(file)) {
    selectedFile.value = file
    importResult.value = null
  } else {
    alert('请选择有效的Excel文件 (.xlsx, .xls)')
  }
}

const handleDrop = (event) => {
  event.preventDefault()
  isDragOver.value = false

  const file = event.dataTransfer.files[0]
  if (file && isExcelFile(file)) {
    selectedFile.value = file
    importResult.value = null
  } else {
    alert('请拖拽有效的Excel文件 (.xlsx, .xls)')
  }
}

const handleDragOver = (event) => {
  event.preventDefault()
  isDragOver.value = true
}

const handleDragLeave = () => {
  isDragOver.value = false
}

const removeFile = () => {
  selectedFile.value = null
  importResult.value = null
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

const isExcelFile = (file) => {
  const excelTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel'
  ]
  return excelTypes.includes(file.type) || file.name.match(/\.(xlsx|xls)$/i)
}

const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const handleImport = async () => {
  if (!selectedFile.value) return

  importing.value = true
  importResult.value = null

  try {
    const result = await importExcel(selectedFile.value)
    importResult.value = result

    if (result.success) {
      emit('import-success', result)
      // 延迟关闭模态框，让用户看到成功结果
      setTimeout(() => {
        closeModal()
      }, 2000)
    }
  } catch (error) {
    importResult.value = {
      success: false,
      message: '导入失败: ' + error.message
    }
  } finally {
    importing.value = false
  }
}

const closeModal = () => {
  emit('close')
  selectedFile.value = null
  importResult.value = null
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}
</script>

<style scoped>
.excel-import-modal {
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

.modal-backdrop {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
}

.modal-content {
  position: relative;
  background: white;
  border-radius: 8px;
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #e5e7eb;
}

.modal-header h3 {
  margin: 0;
  color: #1f2937;
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

.modal-body {
  padding: 24px;
}

.upload-area {
  border: 2px dashed #d1d5db;
  border-radius: 8px;
  padding: 40px 20px;
  text-align: center;
  transition: all 0.3s ease;
  background-color: #f9fafb;
}

.upload-area.drag-over {
  border-color: #3b82f6;
  background-color: #eff6ff;
}

.upload-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.upload-prompt p {
  margin: 8px 0;
  color: #374151;
}

.upload-tip {
  font-size: 14px;
  color: #6b7280 !important;
}

.select-btn {
  background-color: #3b82f6;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  margin-top: 16px;
  transition: background-color 0.2s;
}

.select-btn:hover {
  background-color: #2563eb;
}

.selected-file {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: white;
  padding: 16px;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
}

.file-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.file-name {
  font-weight: 500;
  color: #1f2937;
}

.file-size {
  font-size: 14px;
  color: #6b7280;
}

.remove-btn {
  background-color: #ef4444;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.remove-btn:hover {
  background-color: #dc2626;
}

.import-result {
  margin-top: 20px;
  padding: 16px;
  border-radius: 6px;
  border: 1px solid;
}

.import-result.success {
  background-color: #ecfdf5;
  border-color: #10b981;
  color: #065f46;
}

.import-result.error {
  background-color: #fef2f2;
  border-color: #ef4444;
  color: #991b1b;
}

.result-icon {
  font-size: 24px;
  margin-bottom: 8px;
}

.result-message {
  font-weight: 500;
  margin-bottom: 8px;
}

.result-details {
  font-size: 14px;
}

.result-details ul {
  margin: 8px 0 0 20px;
  padding: 0;
}

.result-details li {
  margin: 4px 0;
}

.import-actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
  justify-content: flex-end;
}

.import-btn {
  background-color: #10b981;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.2s;
}

.import-btn:hover:not(:disabled) {
  background-color: #059669;
}

.import-btn:disabled {
  background-color: #9ca3af;
  cursor: not-allowed;
}

.cancel-btn {
  background-color: #6b7280;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.2s;
}

.cancel-btn:hover {
  background-color: #4b5563;
}
</style>