// API配置文件
const config = {
  // 根据环境自动切换API基础URL
  get BASE_URL() {
    if (import.meta.env.PROD) {
      // 生产环境
      return import.meta.env.VITE_API_BASE_URL || '/api'
    } else {
      // 开发环境 - 后端服务器端口
      return import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'
    }
  }
}

export default config