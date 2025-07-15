// 最终表格处理综合测试
const fs = require('fs');
const path = require('path');

// 同仁堂PDF中的完整表格数据（跨页表格示例）
const complexTableData = `
3. 妇科类(马鞍白风丸、埋宝丸)		3.80	3.48	3.77	3.96	4.15	4.36
同比	%	23.83%	-8.38%	8.28%	5.00%	5.00%	5.00%
毛利率	%	40.16%	38.12%	42.38%	42.00%	42.00%	42.00%

精品国药代表,民族瑰宝传承 ——首次覆盖报告

4.1、关键假设及盈利预测

4. 清热类(感冒清热颗粒、牛黄解毒)	亿元	5.24	5.29	6.14	5.22	5.64	6.20
同比	%	5.19%	0.86%	16.07%	-15.00%	8.00%	10.00%
毛利率	%	36.09%	34.39%	34.97%	35.00%	35.00%	35.00%

5. 其他中药品种	亿元	28.87	33.33	39.70	41.69	45.85	52.73
同比	%	18.90%	15.45%	19.11%	5.00%	10.00%	15.00%
毛利率	%	39.36%	40.25%	41.65%	41.00%	41.00%	41.00%

二、商业分部(同仁堂商业)	亿元	82.41	84.80	102.5	111.7	121.7	132.7
同比	%	12.64%	2.90%	20.83%	9.00%	9.00%	9.00%
毛利率	%	31.51%	30.95%	31.11%	31.00%	31.00%	31.00%

1. 母公司生产: 心脑血管类(安宫、清心、大活络等)	亿元	36.29	40.63	43.88	43.88	47.39	52.13

三、分部间抵消	亿元	-25.14	(29.48)	(34.64)	(37.43)	(42.02)	(48.45)
`;

// 表格处理核心函数
function strIsTabTable(str) {
  const lines = str.split('\n').filter((line) => line.trim());
  if (lines.length < 2) return false;

  const tabLines = lines.filter((line) => {
    const tabs = line.split('\t');
    return tabs.length >= 3;
  });

  return tabLines.length / lines.length >= 0.7 && tabLines.length >= 2;
}

function convertTabTableToMarkdown(text) {
  const lines = text.split('\n').filter((line) => line.trim());
  const tabLines = lines.filter((line) => line.split('\t').length >= 3);
  
  if (tabLines.length === 0) return text;
  
  let maxColumns = 0;
  tabLines.forEach((line) => {
    const columns = line.split('\t');
    if (columns.length > maxColumns) {
      maxColumns = columns.length;
    }
  });
  
  const headerCells = Array(maxColumns)
    .fill(0)
    .map((_, i) => `列${i + 1}`);
  const header = `| ${headerCells.join(' | ')} |`;
  const separator = `| ${Array(maxColumns).fill('---').join(' | ')} |`;
  
  const markdownRows = [header, separator];
  
  tabLines.forEach((line) => {
    const cells = line.split('\t');
    while (cells.length < maxColumns) {
      cells.push('');
    }
    const row = `| ${cells.slice(0, maxColumns).join(' | ')} |`;
    markdownRows.push(row);
  });
  
  return markdownRows.join('\n');
}

function strIsMdTable(str) {
  if (!str.includes('|')) return false;
  const lines = str.split('\n').filter((line) => line.trim());
  if (lines.length < 2) return false;
  
  const headerLine = lines[0].trim();
  if (!headerLine.startsWith('|') || !headerLine.endsWith('|')) return false;
  
  const separatorLine = lines[1].trim();
  const separatorRegex = /^(\|[\s:]*-+[\s:]*)+\|$/;
  return separatorRegex.test(separatorLine);
}

// 增强的分块函数，支持表格完整性保护
function enhancedSplitText2Chunks(params) {
  let { text, chunkSize = 500, maxSize = 3500 } = params;
  
  // 1. 检测并转换制表符表格
  if (strIsTabTable(text)) {
    console.log('🔍 检测到制表符表格，正在转换为Markdown格式...');
    text = convertTabTableToMarkdown(text);
    console.log('✅ 转换完成\n');
  }
  
  // 2. 检测表格并使用表格专用分块策略
  if (strIsMdTable(text)) {
    console.log('📊 检测到Markdown表格，使用表格分块策略');
    return markdownTableSplit(text, chunkSize, maxSize);
  }
  
  // 3. 常规分块
  return regularChunking(text, chunkSize);
}

// 表格专用分块函数
function markdownTableSplit(text, chunkSize, maxSize) {
  const lines = text.split('\n');
  const header = lines[0];
  const separator = lines[1];
  
  const chunks = [];
  let chunk = `${header}\n${separator}\n`;
  
  // 使用更大的表格块大小
  const tableChunkSize = Math.max(chunkSize, maxSize * 0.8);
  
  for (let i = 2; i < lines.length; i++) {
    const chunkLength = chunk.length;
    const nextLineLength = lines[i].length;
    
    if (chunkLength + nextLineLength > tableChunkSize && chunk !== `${header}\n${separator}\n`) {
      chunks.push(chunk.trim());
      chunk = `${header}\n${separator}\n`;
    }
    chunk += `${lines[i]}\n`;
  }
  
  if (chunk.trim() !== `${header}\n${separator}`.trim()) {
    chunks.push(chunk.trim());
  }
  
  return {
    chunks,
    chars: text.length
  };
}

// 常规分块函数
function regularChunking(text, chunkSize) {
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
  
  return {
    chunks,
    chars: text.length
  };
}

// 分析表格处理效果
function analyzeResults(chunks) {
  console.log('\n=== 表格处理效果分析 ===\n');
  
  let mdTableChunks = 0;
  let tabTableChunks = 0;
  let regularChunks = 0;
  let tableDataPreserved = 0;
  
  chunks.forEach((chunk, index) => {
    console.log(`--- 分块 ${index + 1} ---`);
    console.log(`长度: ${chunk.length} 字符`);
    
    const isMdTable = strIsMdTable(chunk);
    const isTabTable = strIsTabTable(chunk);
    const hasTableData = chunk.includes('|') || chunk.includes('\t');
    
    if (isMdTable) {
      mdTableChunks++;
      tableDataPreserved++;
      console.log('✅ Markdown表格格式');
    } else if (isTabTable) {
      tabTableChunks++;
      console.log('⚠️ 制表符表格格式');
    } else if (hasTableData) {
      console.log('⚠️ 包含表格数据但格式不完整');
    } else {
      regularChunks++;
      console.log('📄 普通文本');
    }
    
    // 显示内容预览
    const preview = chunk.substring(0, 100) + (chunk.length > 100 ? '...' : '');
    console.log(`内容预览: ${preview.replace(/\n/g, ' ')}`);
    console.log('');
  });
  
  // 总结
  console.log('=== 处理总结 ===');
  console.log(`总分块数: ${chunks.length}`);
  console.log(`Markdown表格分块: ${mdTableChunks}`);
  console.log(`制表符表格分块: ${tabTableChunks}`);
  console.log(`普通文本分块: ${regularChunks}`);
  console.log(`表格数据保持完整性: ${mdTableChunks > 0 ? '✅ 是' : '❌ 否'}`);
  
  if (mdTableChunks > 0 && tabTableChunks === 0) {
    console.log('\n🎉 表格处理成功！制表符表格已正确转换为Markdown格式！');
  } else if (tabTableChunks > 0) {
    console.log('\n⚠️ 仍有制表符表格未转换，需要进一步优化');
  } else {
    console.log('\n❌ 表格处理失败，数据被分割');
  }
}

// 主测试函数
function runFinalTableTest() {
  console.log('=== FastGPT Pro 表格处理最终测试 ===\n');
  console.log('📋 测试数据: 同仁堂PDF复杂跨页表格');
  console.log(`📊 数据长度: ${complexTableData.length} 字符`);
  console.log(`📝 行数: ${complexTableData.split('\n').length}`);
  
  // 分析原始数据
  console.log('\n--- 原始数据分析 ---');
  console.log(`是否为制表符表格: ${strIsTabTable(complexTableData) ? '是' : '否'}`);
  console.log(`是否为Markdown表格: ${strIsMdTable(complexTableData) ? '是' : '否'}`);
  
  // 执行处理
  console.log('\n--- 开始处理 ---');
  const result = enhancedSplitText2Chunks({
    text: complexTableData,
    chunkSize: 800,  // 使用更大的分块大小以适应表格
    maxSize: 3500
  });
  
  // 分析结果
  analyzeResults(result.chunks);
  
  // 生成报告
  generateReport(result);
}

function generateReport(result) {
  const report = {
    timestamp: new Date().toISOString(),
    testData: 'tongrentang_table_data',
    totalChunks: result.chunks.length,
    totalChars: result.chars,
    averageChunkSize: Math.round(result.chars / result.chunks.length),
    tableProcessingSuccess: result.chunks.some(chunk => strIsMdTable(chunk)),
    chunks: result.chunks.map((chunk, index) => ({
      index: index + 1,
      length: chunk.length,
      type: strIsMdTable(chunk) ? 'markdown_table' : 
            strIsTabTable(chunk) ? 'tab_table' : 'regular_text',
      preview: chunk.substring(0, 50).replace(/\n/g, ' ')
    }))
  };
  
  console.log('\n=== 测试报告 ===');
  console.log(`⏰ 测试时间: ${report.timestamp}`);
  console.log(`📊 分块数量: ${report.totalChunks}`);
  console.log(`📝 平均分块大小: ${report.averageChunkSize} 字符`);
  console.log(`✅ 表格处理成功: ${report.tableProcessingSuccess ? '是' : '否'}`);
  
  // 保存报告
  try {
    fs.writeFileSync(
      path.join(__dirname, 'table-processing-report.json'),
      JSON.stringify(report, null, 2)
    );
    console.log('📄 详细报告已保存到: table-processing-report.json');
  } catch (error) {
    console.log('⚠️ 报告保存失败:', error.message);
  }
}

// 运行测试
if (require.main === module) {
  runFinalTableTest();
}

module.exports = {
  runFinalTableTest,
  enhancedSplitText2Chunks,
  strIsTabTable,
  convertTabTableToMarkdown
}; 