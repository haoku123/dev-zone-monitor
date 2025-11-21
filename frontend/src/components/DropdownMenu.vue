<template>
  <div class="dropdown">
    <button class="dropdown-btn" @click.stop="toggleMenu">{{ title }}</button>
    <div class="dropdown-content" v-show="menuVisible">
      <a
        v-for="(item, index) in items"
        :key="index"
        href="#"
        @click.prevent="handleClick(item)"
      >
        {{ typeof item === 'string' ? item : item.label }}
      </a>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
const props = defineProps({
  title: String,
  items: Array
})

const emit = defineEmits(['menu-click'])

const menuVisible = ref(false)
const toggleMenu = () => {
  menuVisible.value = !menuVisible.value
}
const handleClick = (item) => {
  if (typeof item === 'object' && item.action) {
    emit('menu-click', item.action)
  }
}
</script>

<style scoped>
.dropdown {
  position: relative;
}
.dropdown-btn {
  background-color: transparent;
  color: white;
  font-size: 18px;
  font-weight: bold;
  padding: 6px 16px;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.2s ease;
  border: none;
}
.dropdown-btn:hover {
  background-color: rgba(255, 255, 255, 0.1);
}
.dropdown-content {
  position: absolute;
  top: 100%;
  left: 0;
  background-color: #f9f9f9;
  min-width: 160px;
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2);
  z-index: 1;
  border-radius: 6px;
  overflow: hidden;
}
.dropdown-content a {
  font-size: 14px;
  color: #333;
  padding: 8px 14px;
  text-decoration: none;
  display: block;
}
.dropdown-content a:hover {
  background-color: #e6f7ff;
  color: #0077cc;
}
</style>
