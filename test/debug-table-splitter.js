// 调试表格分割器的测试文件
// 直接复制textSplitter.ts中的关键函数

// 计算文本有效长度
const getTextValidLength = (chunk) => {
  return chunk.replace(/[\s\n]/g, '').length;
};

// 判断是否为markdown表格
const strIsMdTable = (str) => {
  if (!str.includes('|')) {
    return false;
  }

  const lines = str.split('\n');
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
};

// 模拟markdownTableSplit函数
const markdownTableSplit = (props) => {
  let { text = '', chunkSize } = props;

  console.log('[DEBUG] markdownTableSplit 被调用');
  console.log('[DEBUG] 输入文本长度:', text.length);
  console.log('[DEBUG] chunkSize:', chunkSize);

  const splitText2Lines = text.split('\n').filter((line) => {
    const trimmed = line.trim();
    return trimmed || line.includes('|');
  });

  if (splitText2Lines.length < 2) {
    return { chunks: [text], chars: text.length };
  }

  const header = splitText2Lines[0];
  const headerSize = header.split('|').length - 2;

  const mdSplitString = `| ${new Array(headerSize > 0 ? headerSize : 1)
    .fill(0)
    .map(() => '---')
    .join(' | ')} |`;

  console.log('[DEBUG] 提取的表头:', header.trim());
  console.log('[DEBUG] 生成的分隔符:', mdSplitString);

  const chunks = [];
  let chunk = `${header}
${mdSplitString}
`;

  for (let i = 2; i < splitText2Lines.length; i++) {
    const chunkLength = getTextValidLength(chunk);
    const nextLineLength = getTextValidLength(splitText2Lines[i]);

    // Over size
    if (chunkLength + nextLineLength > chunkSize) {
      console.log(`[DEBUG] 🚨 表格分块触发！`);
      console.log(`[DEBUG] 当前行索引: ${i}, 当前行内容: "${splitText2Lines[i].trim()}"`);
      console.log(`[DEBUG] 当前chunk长度: ${chunkLength}, 下一行长度: ${nextLineLength}, 限制: ${chunkSize}`);
      chunks.push(chunk);
      chunk = `${header}
${mdSplitString}
`;
      console.log(`[DEBUG] 重新创建chunk，添加表头: "${header.trim()}"`);
    }
    chunk += `${splitText2Lines[i]}\n`;
  }

  if (chunk) {
    chunks.push(chunk);
  }

  console.log('[DEBUG] 最终分块数量:', chunks.length);
  return {
    chunks,
    chars: chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  };
};

// 模拟同仁堂表格数据
const testTableData = `| 关键指标 | 2022A | 2023A | 2024E | 2025E | 2026E |
| --- | --- | --- | --- | --- | --- |
| 成长能力(%YoY) |   |   |   |   |   |
| 收入增长率 | 5.3 | 16.2 | 5.1 | 8.3 | 9.5 |
| 净利润增长率 | 16.3 | 17.5 | 0.1 | 15.9 | 16.6 |
| EBITDA 增长率 | 13.9 | 11.8 | -2.7 | 14.8 | 14.2 |
| EBIT 增长率 | 16.2 | 13.5 | -1.2 | 15.7 | 16.5 |
| 估值指标 |   |   |   |   |   |
| PE | 49.9 | 51.7 | 29.7 | 25.7 | 22.0 |
| PB | 5.4 | 5.8 | 3.5 | 3.2 | 2.9 |
| EV/EBITDA | 15.6 | 14.1 | 14.1 | 12.1 | 10.4 |
| EV/EBIT | 18.0 | 15.9 | 15.8 | 13.4 | 11.2 |
| EV/NOPLAT | 22.2 | 19.0 | 18.8 | 16.0 | 13.4 |
| EV/Sales | 3.1 | 2.7 | 2.5 | 2.3 | 2.0 |
| EV/IC | 3.2 | 2.9 | 2.8 | 2.6 | 2.3 |
| 盈利能力(%) |   |   |   |   |   |
| 毛利率 | 48.8 | 47.3 | 44.5 | 45.5 | 46.5 |
| EBITDA 率 | 19.9 | 19.2 | 17.7 | 18.8 | 19.6 |
| EBIT 率 | 17.3 | 16.9 | 15.9 | 17.0 | 18.1 |
| 税前净利润率 | 17.7 | 17.3 | 16.5 | 17.6 | 18.7 |
| 税后净利润率(归属母公司) | 7.5 | 7.8 | 7.5 | 8.0 | 8.5 |
| ROA | 8.1 | 8.6 | 8.3 | 8.7 | 9.4 |
| ROE(归属母公司)(摊薄) | 11.9 | 12.8 | 11.7 | 12.1 | 12.6 |
| 经营性 ROIC | 120.4 | 98.3 | 154.6 | 221.2 | 506.2 |
| 偿债能力 |   |   |   |   |   |
| 流动比率 | 3.2 | 3.3 | 3.6 | 3.6 | 4.0 |
| 速动比率 | 2.1 | 1.9 | 2.3 | 2.2 | 2.6 |
| 归属母公司权益/有息债务 | 3.9 | 4.0 | 5.1 | 6.3 | 7.8 |
| 有形资产/有息债务 | 8.0 | 8.3 | 10.4 | 12.8 | 15.6 |
| 每股指标(按最新预测年度股本计算历史数据) |   |   |   |   |   |
| EPS | 1.04 | 1.22 | 1.22 | 1.41 | 1.65 |
| 每股红利 | 0.32 | 0.50 | 0.35 | 0.36 | 0.38 |
| 每股经营现金流 | 1.82 | 1.13 | 2.00 | 1.84 | 2.34 |
| 每股自由现金流(FCFF) | 1.87 | 1.19 | 2.11 | 1.83 | 2.28 |
| 每股净资产 | 8.61 | 9.52 | 10.24 | 11.31 | 12.59 |
| 每股销售收入 | 11.21 | 13.02 | 13.68 | 14.82 | 16.24 |

资料来源：Wind, 诚通证券研究所`;

console.log('=== 开始调试表格分割器 ===');
console.log('测试数据长度:', testTableData.length);
console.log('是否为markdown表格:', strIsMdTable(testTableData));

// 使用较小的chunkSize来强制触发分块
const result = markdownTableSplit({
  text: testTableData,
  chunkSize: 1000 // 设置较小的chunkSize来强制分块
});

console.log('\n=== 分块结果 ===');
console.log(`总分块数量: ${result.chunks.length}`);
console.log(`总字符数: ${result.chars}`);

result.chunks.forEach((chunk, index) => {
  console.log(`\n--- 分块 ${index + 1} ---`);
  console.log(`长度: ${chunk.length} 字符`);
  console.log('内容预览:');
  console.log(chunk.substring(0, 300) + (chunk.length > 300 ? '...' : ''));
  
  // 检查是否包含重复表头
  const headerCount = (chunk.match(/\| 关键指标 \| 2022A \| 2023A \| 2024E \| 2025E \| 2026E \|/g) || []).length;
  if (headerCount > 1) {
    console.log(`⚠️ 发现 ${headerCount} 个重复表头！`);
  }
});

console.log('\n=== 调试完成 ===');