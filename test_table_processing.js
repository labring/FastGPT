// 测试表格处理增强功能
const { splitText2Chunks } = require('./packages/global/common/string/textSplitter');

// 测试用例1：跨页分割的表格
const testCase1 = `
3. 妇科类(马鞍白风丸、埋宝丸)
同比	%	23.83%	-8.38%	8.28%	5.00%	5.00%	5.00%
毛利率	%	40.16%	38.12%	42.38%	42.00%	42.00%	42.00%

精品国药代表,民族瑰宝传承 ——首次覆盖报告

4.1、关键假设及盈利预测

4. 清热类(感冒清热颗粒、牛黄解毒) | 亿元 | 5.24 | 5.29 | 6.14 | 5.22 | 5.64 | 6.20 |
同比 | % | 5.19% | 0.86% | 16.07% | -15.00% | 8.00% | 10.00% |
毛利率 | % | 36.09% | 34.39% | 34.97% | 35.00% | 35.00% | 35.00% |

5. 其他中药品种 | 亿元 | 28.87 | 33.33 | 39.70 | 41.69 | 45.85 | 52.73 |
同比 | % | 18.90% | 15.45% | 19.11% | 5.00% | 10.00% | 15.00% |
毛利率 | % | 39.36% | 40.25% | 41.65% | 41.00% | 41.00% | 41.00% |
`;

// 测试用例2：不完整的表格
const testCase2 = `
1. 母公司生产: 心脑血管类(安宫、清心、大活络等)	亿元	36.29	40.63	43.88	43.88	47.39	52.13

三、分部间抵消	亿元	-25.14	(29.48)	(34.64)	(37.43)	(42.02)	(48.45)
`;

// 测试用例3：混合内容
const testCase3 = `
这是一个包含表格的文档示例。

| 项目 | 2019年 | 2020年 | 2021年 |
| --- | --- | --- | --- |
| 收入 | 100 | 120 | 150 |

接下来是一些普通文本内容。

然后是另一个表格片段：
项目A	50	60	70
项目B	30	35	40
毛利率	%	25%	27%	30%

最后是结论部分。
`;

function testTableProcessing() {
  console.log('=== 测试表格处理增强功能 ===\n');

  // 测试用例1
  console.log('测试用例1 - 跨页分割表格:');
  console.log('输入:', testCase1);
  try {
    const result1 = splitText2Chunks({
      text: testCase1,
      chunkSize: 500
    });
    console.log('输出chunks数量:', result1.chunks.length);
    result1.chunks.forEach((chunk, index) => {
      console.log(`Chunk ${index + 1}:`, chunk);
      console.log('---');
    });
  } catch (error) {
    console.error('测试用例1错误:', error);
  }

  console.log('\n=================\n');

  // 测试用例2
  console.log('测试用例2 - 不完整表格:');
  console.log('输入:', testCase2);
  try {
    const result2 = splitText2Chunks({
      text: testCase2,
      chunkSize: 500
    });
    console.log('输出chunks数量:', result2.chunks.length);
    result2.chunks.forEach((chunk, index) => {
      console.log(`Chunk ${index + 1}:`, chunk);
      console.log('---');
    });
  } catch (error) {
    console.error('测试用例2错误:', error);
  }

  console.log('\n=================\n');

  // 测试用例3
  console.log('测试用例3 - 混合内容:');
  console.log('输入:', testCase3);
  try {
    const result3 = splitText2Chunks({
      text: testCase3,
      chunkSize: 300
    });
    console.log('输出chunks数量:', result3.chunks.length);
    result3.chunks.forEach((chunk, index) => {
      console.log(`Chunk ${index + 1}:`, chunk);
      console.log('---');
    });
  } catch (error) {
    console.error('测试用例3错误:', error);
  }
}

// 如果是直接运行这个文件
if (require.main === module) {
  testTableProcessing();
}

module.exports = { testTableProcessing }; 