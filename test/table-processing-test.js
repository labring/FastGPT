// 由于TypeScript模块导入问题，我们使用更精确的模拟版本
// const { splitText2Chunks } = require('../packages/global/common/string/textSplitter');

// 新增：判断是否为制表符表格
function strIsTabTable(str) {
  const lines = str.split('\n').filter((line) => line.trim());
  if (lines.length < 2) return false;

  const tabLines = lines.filter((line) => {
    const tabs = line.split('\t');
    return tabs.length >= 3; // 至少3列才算表格
  });

  // 降低阈值到70%，以适应混合内容
  return tabLines.length / lines.length >= 0.7 && tabLines.length >= 2;
}

// 新增：将制表符表格转换为Markdown表格
function convertTabTableToMarkdown(text) {
  const lines = text.split('\n').filter((line) => line.trim());
  const tabLines = lines.filter((line) => line.split('\t').length >= 3);
  
  if (tabLines.length === 0) return text;
  
  // 找到最大列数
  let maxColumns = 0;
  tabLines.forEach((line) => {
    const columns = line.split('\t');
    if (columns.length > maxColumns) {
      maxColumns = columns.length;
    }
  });
  
  // 生成表头
  const headerCells = Array(maxColumns)
    .fill(0)
    .map((_, i) => `列${i + 1}`);
  const header = `| ${headerCells.join(' | ')} |`;
  const separator = `| ${Array(maxColumns).fill('---').join(' | ')} |`;
  
  // 转换数据行
  const markdownRows = [header, separator];
  
  tabLines.forEach((line) => {
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

// 判断字符串是否为markdown的表格形式
function strIsMdTable(str) {
  if (!str.includes('|')) {
    return false;
  }

  const lines = str.split('\n').filter((line) => line.trim());
  if (lines.length < 2) {
    return false;
  }

  const headerLine = lines[0].trim();
  if (!headerLine.startsWith('|') || !headerLine.endsWith('|')) {
    return false;
  }

  const separatorLine = lines[1].trim();
  const separatorRegex = /^(\|[\s:]*-+[\s:]*)+\|$/;
  if (!separatorRegex.test(separatorLine)) {
    return false;
  }

  for (let i = 2; i < lines.length; i++) {
    const dataLine = lines[i].trim();
    if (dataLine && (!dataLine.startsWith('|') || !dataLine.endsWith('|'))) {
      return false;
    }
  }

  return true;
}

// 模拟增强的textSplitter功能
function enhancedSplitText2Chunks(params) {
  let { text, chunkSize = 500 } = params;
  
  // 1. 首先检测并转换制表符表格
  if (strIsTabTable(text)) {
    console.log('🔍 检测到制表符表格，正在转换为Markdown格式...');
    text = convertTabTableToMarkdown(text);
    console.log('✅ 转换完成');
  }
  
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
  console.log('=== FastGPT Pro 表格处理测试（增强版）===\n');
  console.log('测试数据（模拟同仁堂PDF表格）：');
  console.log(tongrentangTableData);
  console.log('\n=== 分块结果 ===\n');

  try {
    // 使用增强版分块器
    const result = enhancedSplitText2Chunks({
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
      const isMdTable = strIsMdTable(chunk);
      const isTabTable = strIsTabTable(chunk);
      
      console.log(`包含Markdown表格格式: ${isMdTable ? '是' : '否'}`);
      console.log(`包含管道符表格: ${hasTableFormat ? '是' : '否'}`);
      console.log(`包含制表符数据: ${hasTabData ? '是' : '否'}`);
      console.log(`是制表符表格: ${isTabTable ? '是' : '否'}`);
      console.log('');
    });

    // 分析表格处理效果
    analyzeTableProcessing(result.chunks);

  } catch (error) {
    console.error('测试失败:', error);
  }
}

function analyzeTableProcessing(chunks) {
  console.log('=== 表格处理分析（增强版）===\n');

  let tableChunks = 0;
  let completeTableChunks = 0;
  let fragmentedData = 0;
  let tabTableChunks = 0;
  let markdownTableChunks = 0;

  chunks.forEach((chunk, index) => {
    const lines = chunk.split('\n').filter(line => line.trim());
    const tableLines = lines.filter(line => {
      const trimmed = line.trim();
      return trimmed.includes('|') || /\t/.test(trimmed);
    });

    if (tableLines.length > 0) {
      tableChunks++;
      
      // 检查是否是Markdown表格
      if (strIsMdTable(chunk)) {
        markdownTableChunks++;
        completeTableChunks++;
      }
      // 检查是否是制表符表格
      else if (strIsTabTable(chunk)) {
        tabTableChunks++;
        fragmentedData++;
      }
      // 检查是否是完整表格（有表头和数据）
      else if (chunk.includes('|') && chunk.includes('---')) {
        const hasMultipleRows = tableLines.length >= 3;
        if (hasMultipleRows) {
          completeTableChunks++;
        } else {
          fragmentedData++;
        }
      } else if (tableLines.length > 0) {
        fragmentedData++;
      }
    }
  });

  console.log(`包含表格数据的分块: ${tableChunks}/${chunks.length}`);
  console.log(`完整Markdown表格分块: ${markdownTableChunks}`);
  console.log(`制表符表格分块: ${tabTableChunks}`);
  console.log(`完整表格分块总数: ${completeTableChunks}`);
  console.log(`片段化数据分块: ${fragmentedData}`);
  
  if (fragmentedData > 0) {
    console.log('\n⚠️ 仍有片段化表格数据，需要进一步优化');
  } else {
    console.log('\n✅ 表格处理优秀，数据完整性保持良好');
  }
  
  if (markdownTableChunks > 0) {
    console.log('✅ 成功转换制表符表格为Markdown格式');
  }
}

// 如果是直接运行
if (require.main === module) {
  testTableProcessing();
}

module.exports = { testTableProcessing }; 