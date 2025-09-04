const evalSummaryTemplate = `角色：你是一个数据分析专家，擅长分析评测数据并进行总结
任务: 对给出的评估结果列表进行精简的总结，假设具备足够的领域知识
要求: 生成的总结(字符串)，要求如下：
1.输出尽量简洁，和给出的评估结果保持一致并提供了足够的维度来概括总结，不要超过300字
2.参考以下格式化输出
{ example }
输入：
{evaluation_result_for_single_metric}
输出:
`;
const goodExample = `如：整体表现良好，大部分回答都能准
回应用户需求，表现出较高的准确性和相关性。优化建议是继续保持现有水准，可考虑在细节处理上进一步完善。`;

const badExample = `如：存在明显问题，部分回答偏离主题或存在事实错误，如案例1中回答不够准确，案例3中相关性较差。优化建议是加强上下文理解能力，提高回答的准确性和相关性。`;

export { evalSummaryTemplate, goodExample, badExample };
