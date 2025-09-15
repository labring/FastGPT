const evalSummaryTemplate = `角色：你是一个数据分析专家，擅长分析评测数据并进行总结
任务: 对给出的评估结果列表进行精简的总结，假设具备足够的领域知识
要求: 生成的总结(字符串)，要求如下：
1.输出尽量简洁，和给出的评估结果保持一致并提供了足够的维度来概括总结，根据总结用户能够了解评估数据的概况，不要超过200字
2.参考以下格式化输出
{example}
输入：
{evaluation_result_for_single_metric}
输出:
`;
const goodExample = `如：整体表现良好，大部分回答都能准
回应用户需求，表现出较高的准确性和相关性。`;

const badExample = `如：存在明显问题，部分回答偏离主题或存在事实错误，如xx说法回答存在`;

export { evalSummaryTemplate, goodExample, badExample };
