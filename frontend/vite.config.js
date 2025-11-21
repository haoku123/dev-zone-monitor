import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteStaticCopy } from 'vite-plugin-static-copy'

const cesiumSouce = 'node_modules/cesium/Build/Cesium'
const cesiumBaseUrl = 'Cesium'
// https://vite.dev/config/
export default defineConfig({
  define: {
    CESIUM_BASE_URL: JSON.stringify(`/${cesiumBaseUrl}`)
  },
  plugins: [vue(),
  viteStaticCopy({
    targets: [
      { src: `${cesiumSouce}/ThirdParty`, dest: cesiumBaseUrl },
      { src: `${cesiumSouce}/Assets`, dest: cesiumBaseUrl },
      { src: `${cesiumSouce}/Widgets`, dest: cesiumBaseUrl },
      { src: `${cesiumSouce}/Workers`, dest: cesiumBaseUrl },
    ]
  })
  ],
})
