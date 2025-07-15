const { splitText2Chunks } = require('../packages/global/common/string/textSplitter');

// 模拟同仁堂PDF中的表格数据
const tongrentangTableData = `
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

function testTableProcessing() {
  console.log('=== FastGPT Pro 表格处理测试 ===\n');
  console.log('测试数据（模拟同仁堂PDF表格）：');
  console.log(tongrentangTableData);
  console.log('\n=== 分块结果 ===\n');

  try {
    const result = splitText2Chunks({
      text: tongrentangTableData,
      chunkSize: 500,
      overlapRatio: 0.1
    });

    console.log(`总分块数量: ${result.chunks.length}`);
    console.log(`总字符数: ${result.chars}`);
    console.log('\n各分块内容：\n');

    result.chunks.forEach((chunk, index) => {
      console.log(`--- 分块 ${index + 1} ---`);
      console.log(chunk);
      console.log(`长度: ${chunk.length} 字符`);
      
      // 检查是否包含表格格式
      const hasTableFormat = chunk.includes('|') && chunk.split('|').length > 4;
      const hasTabData = /\t/.test(chunk) && chunk.split('\n').length > 2;
      
      console.log(`包含表格格式: ${hasTableFormat ? '是' : '否'}`);
      console.log(`包含制表符数据: ${hasTabData ? '是' : '否'}`);
      console.log('');
    });

    // 分析表格处理效果
    analyzeTableProcessing(result.chunks);

  } catch (error) {
    console.error('测试失败:', error);
  }
}

function analyzeTableProcessing(chunks) {
  console.log('=== 表格处理分析 ===\n');

  let tableChunks = 0;
  let completeTableChunks = 0;
  let fragmentedData = 0;

  chunks.forEach((chunk, index) => {
    const lines = chunk.split('\n').filter(line => line.trim());
    const tableLines = lines.filter(line => {
      const trimmed = line.trim();
      return trimmed.includes('|') || /\t/.test(trimmed);
    });

    if (tableLines.length > 0) {
      tableChunks++;
      
      // 检查是否是完整表格（有表头和数据）
      const hasHeader = chunk.includes('|') && chunk.includes('---');
      const hasMultipleRows = tableLines.length >= 3;
      
      if (hasHeader && hasMultipleRows) {
        completeTableChunks++;
      } else if (tableLines.length > 0) {
        fragmentedData++;
      }
    }
  });

  console.log(`包含表格数据的分块: ${tableChunks}/${chunks.length}`);
  console.log(`完整表格分块: ${completeTableChunks}`);
  console.log(`片段化数据分块: ${fragmentedData}`);
  
  if (fragmentedData > 0) {
    console.log('\n⚠️ 发现片段化表格数据，建议优化表格合并算法');
  } else {
    console.log('\n✅ 表格处理良好，数据完整性保持');
  }
}

// 如果是直接运行
if (require.main === module) {
  testTableProcessing();
}

module.exports = { testTableProcessing }; 