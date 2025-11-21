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

    <!-- 文件导入 -->
    <div class="upload-container">
      <input type="file" accept=".geojson" @change="handleUpload" class="upload-input" multiple />
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
const search = ref('')
const selectedProvince = ref('')

const isDragging = ref(false)
let offsetX = 0
let offsetY = 0

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

const handleUpload = (event) => {
  const files = event.target.files
  if (files && files.length > 0) {
    // 将FileList转换为数组并发送
    const filesArray = Array.from(files)
    emit('upload', { files: filesArray, type: 'geojson' })
  }
  event.target.value = '' // 清空，允许重复选同一文件
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

.upload-input {
  display: block;
  margin-bottom: 12px;
  font-size: 14px;
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
