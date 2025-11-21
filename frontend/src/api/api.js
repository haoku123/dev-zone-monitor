import config from '../config/api.js'

// 创建统一的fetch函数，添加错误处理
async function apiRequest(url, options = {}) {
  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    })

    if (!response.ok) {
      throw new Error(`API请求失败: ${response.status} ${response.statusText}`)
    }

    return await response.json()
  } catch (error) {
    console.error('API请求错误:', error)
    throw error
  }
}

// 获取GeoJSON索引列表
export async function fetchGeojsonIndex() {
  return apiRequest(`${config.BASE_URL}/geojson_index`)
}

// 获取GeoJSON列表
export async function fetchGeojsonList() {
  return apiRequest(`${config.BASE_URL}/geojson`)
}

// 获取特定名称的GeoJSON
export async function fetchGeojson(name) {
  return apiRequest(`${config.BASE_URL}/geojson/${encodeURIComponent(name)}`)
}

// 上传GeoJSON
export async function uploadGeojson(name, geojsonContent) {
  return apiRequest(`${config.BASE_URL}/geojson`, {
    method: 'POST',
    body: JSON.stringify({ name, geojson: geojsonContent })
  })
}

// 删除GeoJSON
export async function deleteGeojson(name) {
  return apiRequest(`${config.BASE_URL}/geojson/${encodeURIComponent(name)}`, {
    method: 'DELETE'
  })
}

// 获取已删除列表
export async function fetchDeletedList() {
  return apiRequest(`${config.BASE_URL}/deleted`)
}

// Excel导入功能
export async function importExcel(file) {
  const formData = new FormData();
  formData.append('excel', file);

  try {
    const response = await fetch(`${config.BASE_URL}/import-excel`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Excel导入失败: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Excel导入错误:', error);
    throw error;
  }
}

// 获取所有开发区列表
export async function getAllZones() {
  return apiRequest(`${config.BASE_URL}/zones`);
}

// 获取开发区数据
export async function getZoneData(areaName) {
  return apiRequest(`${config.BASE_URL}/zones/${encodeURIComponent(areaName)}/data`);
}

// 更新开发区数据
export async function updateZoneData(areaName, data) {
  return apiRequest(`${config.BASE_URL}/zones/${encodeURIComponent(areaName)}/data`, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
}

// 获取开发区评价指标
export async function getZoneIndicators(areaName) {
  return apiRequest(`${config.BASE_URL}/zones/${encodeURIComponent(areaName)}/indicators`);
}

// 获取开发区潜力分析
export async function getZonePotentials(areaName) {
  return apiRequest(`${config.BASE_URL}/zones/${encodeURIComponent(areaName)}/potentials`);
}
