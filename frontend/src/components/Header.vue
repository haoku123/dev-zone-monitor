<template>
  <div class="header">
    <div class="header-content">
      <div class="menu-group left">
        <div class="dropdown">
          <button class="dropdown-btn">系统设置</button>
          <div class="dropdown-content">
            <a href="#" @click.prevent="$emit('showExcelImport')">Excel数据导入</a>
            <a href="#" @click.prevent="$emit('showZoneManagement')">开发区数据管理</a>
            <a href="#">设置项3</a>
          </div>
        </div>
        <div class="dropdown">
          <button class="dropdown-btn">数据表格</button>
          <div class="dropdown-content">
            <a href="#" @click.prevent="$emit('showIndicatorsTable')">开发区指标汇总</a>
            <a href="#" @click.prevent="$emit('showPotentialTable')">开发区潜力汇总</a>
            <a href="#">其他数据表格</a>
          </div>
        </div>
      </div>

      <div class="header-title">全国开发区用地潜力监测系统</div>

      <div class="menu-group right">
        <div class="dropdown">
          <button class="dropdown-btn">数据分析</button>
          <div class="dropdown-content">
            <a href="#" @click.prevent="$emit('showRanking')">开发区排名</a>
          </div>
        </div>
        <div class="dropdown">
          <button class="dropdown-btn">生成报告</button>
          <div class="dropdown-content">
            <a href="#" @click.prevent="exportReport">导出报告</a>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const exportReport = () => {
  const reportContent = `根据监测统计结果，在土地开发程度方面，参评国家级开发区审批范围扣除河流、湖泊、山体等不可建设土地后，共有可开发建设土地52.28万公顷，其中达到"三通一平"以上供应条件的土地48.02万公顷，土地开发率91.87%；已供应国有建设用地44.70万公顷，土地供应率93.07%；已建成城镇建设用地41.49万公顷，土地建成率92.83%，工业用地率47.59%。在土地利用强度方面，开发区综合容积率1.06，建筑密度33.87%，工业用地综合容积率0.99，工业用地建筑系数54.58%。在土地利用效益方面，工业用地固定资产投入强度11844.36万元/公顷，工业用地地均税收达到832.61万元/公顷，综合地均税收635.70万元/公顷。`;

  const blob = new Blob([reportContent], { type: 'text/plain;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = '开发区用地潜力监测报告.txt';
  link.click();
  URL.revokeObjectURL(link.href);
};
</script>

<style scoped>
.header {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 0 20px;
  height: 64px;
  background-color: #2c3e50;
  color: white;
  position: relative;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
  z-index: 999;
}

.header-content {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  max-width: 1200px;
}

.header-title {
  font-size: 22px;
  font-weight: bold;
  white-space: nowrap;
  letter-spacing: 2px;
  margin: 0 80px;
}

.menu-group {
  display: flex;
  gap: 80px; /* 增加菜单项之间的间距到80px */
}

.menu-group.left {
  margin-right: 80px;
}

.menu-group.right {
  margin-left: 80px;
}

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
  white-space: nowrap; /* 防止文字换行 */
}

.dropdown-btn:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.dropdown-content {
  display: none;
  position: absolute;
  top: 100%;
  left: 0;
  background-color: #f9f9f9;
  min-width: 160px;
  box-shadow: 0px 8px 16px rgba(0, 0, 0, 0.2);
  z-index: 1;
  border-radius: 6px;
  overflow: hidden;
}

.dropdown:hover .dropdown-content {
  display: block;
}

.dropdown-content a {
  font-size: 14px;
  color: #333;
  padding: 8px 14px;
  text-decoration: none;
  display: block;
  transition: background-color 0.2s;
}

.dropdown-content a:hover {
  background-color: #e6f7ff;
  color: #0077cc;
}
</style>
