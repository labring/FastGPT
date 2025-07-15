// 制表符表格处理调试脚本
const path = require('path');

// 同仁堂PDF中的实际制表符表格数据
const tabTableData = `
3. 妇科类(马鞍白风丸、埋宝丸)		3.80	3.48	3.77	3.96	4.15	4.36
同比	%	23.83%	-8.38%	8.28%	5.00%	5.00%	5.00%
毛利率	%	40.16%	38.12%	42.38%	42.00%	42.00%	42.00%

精品国药代表,民族瑰宝传承 ——首次覆盖报告

4.1、关键假设及盈利预测

4. 清热类(感冒清热颗粒、牛黄解毒)	亿元	5.24	5.29	6.14	5.22	5.64	6.20
同比	%	5.19%	0.86%	16.07%	-15.00%	8.00%	10.00%
毛利率	%	36.09%	34.39%	34.97%	35.00%	35.00%	35.00%
`;

// 检测是否为制表符表格数据
function isTabTable(text) {
  const lines = text.split('\n').filter(line => line.trim());
  if (lines.length === 0) return false;
  
  const tabLines = lines.filter(line => {
    const tabs = line.split('\t');
    return tabs.length >= 3; // 至少3列才算表格
  });
  
  // 如果80%以上的行都有制表符，认为是表格
  const ratio = tabLines.length / lines.length;
  console.log(`制表符行数: ${tabLines.length}/${lines.length}, 比例: ${(ratio * 100).toFixed(1)}%`);
  
  return ratio >= 0.8 && tabLines.length >= 2;
}

// 将制表符表格转换为Markdown表格
function convertTabTableToMarkdown(text) {
  const lines = text.split('\n').filter(line => line.trim());
  const tabLines = lines.filter(line => line.split('\t').length >= 3);
  
  if (tabLines.length === 0) return text;
  
  // 找到最大列数
  let maxColumns = 0;
  tabLines.forEach(line => {
    const columns = line.split('\t');
    if (columns.length > maxColumns) {
      maxColumns = columns.length;
    }
  });
  
  console.log(`最大列数: ${maxColumns}`);
  
  // 生成表头
  const headerCells = Array(maxColumns).fill(0).map((_, i) => `列${i + 1}`);
  const header = `| ${headerCells.join(' | ')} |`;
  const separator = `| ${Array(maxColumns).fill('---').join(' | ')} |`;
  
  // 转换数据行
  const markdownRows = [header, separator];
  
  tabLines.forEach(line => {
    const cells = line.split('\t');
    // 补齐列数
    while (cells.length < maxColumns) {
      cells.push('');
    }
    // 截取到最大列数
    const row = `| ${cells.slice(0, maxColumns).join(' | ')} |`;
    markdownRows.push(row);
  });
  
  return markdownRows.join('\n');
}

// 分析表格数据结构
function analyzeTableStructure(text) {
  console.log('=== 表格结构分析 ===\n');
  console.log('原始数据:');
  console.log(text);
  console.log('\n--- 行分析 ---');
  
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    if (!line.trim()) return;
    
    const tabs = line.split('\t');
    const pipes = line.split('|');
    
    console.log(`行 ${index + 1}: "${line.trim()}"`);
    console.log(`  制表符数量: ${tabs.length - 1}`);
    console.log(`  管道符数量: ${pipes.length - 1}`);
    console.log(`  是否制表符表格: ${tabs.length >= 3 ? '是' : '否'}`);
    console.log(`  是否管道符表格: ${pipes.length >= 3 && line.includes('|') ? '是' : '否'}`);
    console.log('');
  });
}

// 主测试函数
function debugTabTable() {
  console.log('=== 制表符表格处理调试 ===\n');
  
  // 1. 分析数据结构
  analyzeTableStructure(tabTableData);
  
  // 2. 检测表格类型
  console.log('\n=== 表格检测结果 ===');
  const isTab = isTabTable(tabTableData);
  console.log(`是否为制表符表格: ${isTab ? '是' : '否'}`);
  
  // 3. 转换为Markdown表格
  if (isTab) {
    console.log('\n=== 转换后的Markdown表格 ===');
    const markdownTable = convertTabTableToMarkdown(tabTableData);
    console.log(markdownTable);
  }
  
  // 4. 测试分块处理
  console.log('\n=== 分块处理模拟 ===');
  testChunking(tabTableData);
}

function testChunking(text) {
  const chunkSize = 500;
  const chunks = [];
  let currentChunk = '';
  
  const lines = text.split('\n');
  
  for (const line of lines) {
    if (currentChunk.length + line.length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = line + '\n';
    } else {
      currentChunk += line + '\n';
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  console.log(`分块数量: ${chunks.length}`);
  chunks.forEach((chunk, index) => {
    console.log(`\n--- 分块 ${index + 1} ---`);
    console.log(chunk);
    console.log(`长度: ${chunk.length} 字符`);
    console.log(`包含制表符表格: ${isTabTable(chunk) ? '是' : '否'}`);
  });
}

// 如果是直接运行
if (require.main === module) {
  debugTabTable();
}

module.exports = { debugTabTable, isTabTable, convertTabTableToMarkdown }; 