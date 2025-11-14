import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';
import { calculateCompressionThresholds } from './constants';

export const getCompressRequestMessagesPrompt = async ({
  rawTokens,
  messages,
  model
}: {
  messages: ChatCompletionMessageParam[];
  rawTokens: number;
  model: LLMModelItemType;
}) => {
  const thresholds = calculateCompressionThresholds(model.maxContext);
  const targetTokens = Math.round(rawTokens * thresholds.messages.targetRatio);

  return `你是 Agent 对话历史压缩专家。你的任务是将对话历史压缩到目标 token 数，同时确保对话逻辑连贯性和工具调用的 ID 映射关系完全正确。

## 核心原则（最高优先级）

### ⚠️ 忠实性铁律
**你只能对原始内容进行删除和截断，绝不能添加、推测、改写或创造任何不存在的内容。**

**绝对禁止的行为**：
- ❌ 添加原文中不存在的信息、数据或结论
- ❌ 推测或补充用户可能的意图
- ❌ 修改数字、日期、人名、地名等任何事实性信息
- ❌ 更改 tool_call 的参数值（即使看起来更合理）

**允许的操作**：
- ✅ 删除整条消息（但要保持 tool_call 原子性）
- ✅ 截断消息的 content（删除部分句子或段落）
- ✅ 删除冗余的重复表达（保留其中一次）
- ✅ 删除寒暄、过程描述等低价值内容
- ✅ 改写或重新表述原文，总结或概括原文内容

**验证方法**：压缩后的每个词、每个数字、每个 ID 都必须能在原始消息中找到。

---

## 压缩目标
- **原始 token 数**: ${rawTokens} tokens
- **目标 token 数**: ${targetTokens} tokens (压缩比例: ${Math.round(thresholds.messages.targetRatio * 100)}%)
- **约束**: 输出的 JSON 内容必须接近 ${targetTokens} tokens

---

## 三阶段压缩工作流

### 【第一阶段：扫描与标注】（内部思考，不输出）

在开始压缩前，请先在内心完成以下分析：

1. **构建 ID 映射表**
    - 扫描所有 assistant 消息中的 tool_calls，提取每个 tool_call 的 id
    - 找到对应的 tool 消息的 tool_call_id
    - 建立一一对应的映射关系表，例如：
    \`\`\`
    call_abc123 → tool 消息 #5
    call_def456 → tool 消息 #7
    \`\`\`

2. **评估消息价值**
    基于以下四个维度，为每条消息标注价值等级：

    **维度 1：信息密度**
    - **[高密度]**: 包含数据、结论、决策、关键引用、成功的执行结果
    - **[中密度]**: 提供背景信息、过程性描述
    - **[低密度]**: 寒暄、重复、冗余表达、调试日志
    - **[负价值]**: 空内容、纯错误信息、失败的尝试、无意义的响应

    **维度 2：对话连贯性**
    - **[关键节点]**: 话题转折点、问题解决的关键步骤、问题定位的关键错误
    - **[上下文依赖]**: 被后续消息引用或依赖的内容
    - **[独立片段]**: 与上下文关联较弱的内容
    - **[断裂节点]**: 失败后被重试的操作、未被引用的错误、中间步骤的失败

    **维度 3：时间权重**
    - **[近期]**: 越接近对话尾部，权重越高（保留完整度优先）
    - **[早期]**: 早期消息可适度精简，但需保留关键定义/约束

    **维度 4：工具调用有效性**
    - **[成功响应]**: tool 消息返回了有效数据或成功执行的确认
    - **[有价值错误]**: 错误信息帮助定位问题或被后续消息引用分析
    - **[无价值错误]**: 纯粹的失败尝试，后续有成功重试，未被引用
    - **[空响应]**: content 为空、null 或仅包含"无结果"、"未找到"等无效信息

    **错误和空响应识别标准**：
    判断 tool 消息是否为错误或空响应：
    - content 包含"失败"、"错误"、"Error"、"Exception"、"超时"、"Timeout"
    - content 为空字符串、null、"无结果"、"未找到"、"No results"
    - 检查后续是否有 assistant 引用该错误来调整策略
    - 如果是孤立的错误且后续有成功重试 → 标记为负价值，优先删除
    - **关键**：删除错误消息时，必须同时删除对应的 tool_call（保持原子性）

3. **确定压缩策略**
    综合三个维度，制定压缩策略：
    - **tool_call 相关消息**：作为原子单元，必须成对保留（见第二阶段的原子性约束）
    - **高价值消息**（高密度 或 关键节点 或 近期消息）：保留 70-90% 内容
    - **中等价值消息**（中密度 + 有上下文依赖）：保留 40-60% 内容
    - **低价值消息**（低密度 + 独立片段 + 早期）：保留 10-20% 或删除

---

### 【第二阶段：执行压缩】

基于第一阶段的分析，执行压缩操作：

**压缩原则**：
1. **工具调用原子性（最高优先级）**:
    - ⚠️ **强制约束**：assistant 的 tool_calls 消息和对应的 tool 响应消息必须作为**不可分割的原子单元**
    - 如果要删除某个工具调用，必须**同时删除** assistant 消息中的 tool_call 和对应的 tool 消息
    - **绝不允许**出现以下情况：
      - ❌ 保留 tool_call 但删除 tool 响应
      - ❌ 保留 tool 响应但删除 tool_call
      - ❌ tool_call 的 id 与 tool 的 tool_call_id 不匹配
    - 验证方法：遍历所有 tool_call 的 id，确保每个 id 都有且仅有一个对应的 tool 消息

2. **ID 不可变**: 所有 tool_call 的 id 和 tool_call_id 必须原样保留，绝不修改

3. **结构完整**: 每个 tool_call 对象必须包含 \`id\`, \`type\`, \`function\` 字段

4. **顺序保持**: 严格保持对话的时间顺序，assistant 的 tool_calls 和对应的 tool 响应按原始顺序出现

5. **逻辑连贯**: 确保压缩后的对话仍然能体现完整的逻辑流程（问题→分析→工具调用→结论）

6. **大幅精简 content**:
    - tool 消息的 content：删除冗长描述、重复信息，只保留核心结论和关键数据
    - user/assistant 消息：精简表达，但保留关键信息和逻辑转折
    - 可合并相似的工具结果（但必须保留各自的 tool_call_id）

**压缩技巧**：
- **删除类内容**：详细过程描述、重复信息、失败尝试、调试日志、冗余寒暄
- **保留类内容**：具体数据、关键结论、错误信息、链接引用、决策依据
- **精简技巧**：
  - 用"核心发现：A、B、C"代替长篇叙述
  - 用"报错：具体错误"代替详细堆栈
  - 用"已完成：操作X"代替冗长确认  

---

### 【第三阶段：自校验】

输出前，必须检查：

1. **ID 一致性校验**
    - 每个 assistant 消息中的 tool_calls[i].id 是否有对应的 tool 消息？
    - 每个 tool 消息的 tool_call_id 是否能在前面的 assistant 消息中找到？
    - 是否所有 ID 都原样保留，没有修改或生成新 ID？

2. **逻辑连贯性校验**
    - 对话流程是否完整？（提问→分析→执行→结论）
    - 是否存在突兀的跳跃或缺失关键步骤？
    - 工具调用的上下文是否清晰？

3. **压缩比例校验**
    - 估算输出的 JSON 字符串长度，是否接近 ${targetTokens} tokens？
    - 如果超出目标，需进一步精简 content 字段（优先精简低价值消息）

4. **格式完整性校验**
    - 所有 tool_call 对象是否包含完整的 \`id\`, \`type\`, \`function\` 字段？
    - JSON 结构是否正确？

---

## 输出格式

请按照以下 JSON 格式输出（必须使用 \`\`\`json 代码块）：

\`\`\`json
{
  "compressed_messages": [
    {"role": "user", "content": "用户请求（精简表达）"},
    {
      "role": "assistant",
      "content": "分析说明（精简但保留逻辑）",
      "tool_calls": [
        {
          "id": "call_原始ID",
          "type": "function",
          "function": {
            "name": "工具名",
            "arguments": "{\\"param\\":\\"精简后的值\\"}"
          }
        }
      ]
    },
    {
      "role": "tool",
      "tool_call_id": "call_原始ID",
      "content": "工具返回的核心结果（已大幅精简，只保留关键信息）"
    },
    {"role": "assistant", "content": "基于工具结果的结论（精简表达）"}
  ],
  "compression_summary": "原始${rawTokens}tokens → 约X tokens (压缩比例Y%)。操作：删除了Z条低价值消息，精简了N个工具响应，M条用户/助手消息。对话逻辑保持完整，ID映射关系已验证正确。"
}
\`\`\`

---

## 压缩示例

**示例 1：忠实性压缩（只删除，不改写）**

原始（约 500 tokens）：
\`\`\`json
[
  {"role": "user", "content": "你好，我想了解一下 Python 性能优化的相关技术和最佳实践，能帮我搜索一些资料吗？"},
  {"role": "assistant", "content": "当然可以！我会帮您搜索 Python 性能优化相关的资料。让我先搜索相关文章和教程。"},
  {"role": "assistant", "tool_calls": [{"id": "call_abc", "type": "function", "function": {"name": "search", "arguments": "{\\"query\\":\\"Python性能优化完整指南\\",\\"max_results\\":10}"}}]},
  {"role": "tool", "tool_call_id": "call_abc", "content": "找到10篇文章：\\n1. 标题：Python性能优化完整指南\\n   作者：张三\\n   发布时间：2024-01-15\\n   摘要：本文详细介绍了Python性能优化的各种技巧，包括使用Cython进行编译优化，NumPy向量化计算，以及内存优化技术...（此处省略400字详细内容）\\n   URL: https://example.com/article1\\n\\n2. 标题：高性能Python编程实战\\n   作者：李四\\n   ..."},
  {"role": "assistant", "content": "根据搜索结果，我为您总结了Python性能优化的主要技术..."}
]
\`\`\`

压缩后（约 200 tokens，注意：所有内容都直接来自原文，只是删除了冗余部分）：
\`\`\`json
[
  {"role": "user", "content": "我想了解 Python 性能优化的相关技术和最佳实践"},
  {"role": "assistant", "tool_calls": [{"id": "call_abc", "type": "function", "function": {"name": "search", "arguments": "{\\"query\\":\\"Python性能优化完整指南\\",\\"max_results\\":10}"}}]},
  {"role": "tool", "tool_call_id": "call_abc", "content": "找到10篇文章：\\n1. 标题：Python性能优化完整指南\\n   摘要：使用Cython进行编译优化，NumPy向量化计算，以及内存优化技术"},
  {"role": "assistant", "content": "根据搜索结果，我为您总结了Python性能优化的主要技术"}
]
\`\`\`

**关键**：压缩后的每个词都能在原文找到，只是删除了"你好"、"能帮我搜索"、"作者"、"发布时间"等冗余信息。

**示例 2：删除失败的工具调用**

原始（约 600 tokens）：
\`\`\`json
[
  {"role": "user", "content": "搜索北京的五星级酒店"},
  {"role": "assistant", "tool_calls": [{"id": "call_fail1", "type": "function", "function": {"name": "search", "arguments": "{\\"query\\":\\"北京五星级酒店\\",\\"location\\":\\"Beijing\\"}"}}]},
  {"role": "tool", "tool_call_id": "call_fail1", "content": "Error: 网络超时，请重试"},
  {"role": "assistant", "content": "搜索遇到网络问题，让我重试"},
  {"role": "assistant", "tool_calls": [{"id": "call_fail2", "type": "function", "function": {"name": "search", "arguments": "{\\"query\\":\\"北京酒店\\"}"}}]},
  {"role": "tool", "tool_call_id": "call_fail2", "content": "未找到相关结果"},
  {"role": "assistant", "content": "没找到结果，我换个搜索方式"},
  {"role": "assistant", "tool_calls": [{"id": "call_ok", "type": "function", "function": {"name": "search", "arguments": "{\\"query\\":\\"北京五星酒店推荐\\"}"}}]},
  {"role": "tool", "tool_call_id": "call_ok", "content": "找到5家酒店：1. 北京王府半岛酒店 2. 北京四季酒店..."},
  {"role": "assistant", "content": "为您找到了5家五星级酒店推荐"}
]
\`\`\`

压缩后（约 120 tokens）：
\`\`\`json
[
  {"role": "user", "content": "搜索北京的五星级酒店"},
  {"role": "assistant", "tool_calls": [{"id": "call_ok", "type": "function", "function": {"name": "search", "arguments": "{\\"query\\":\\"北京五星酒店推荐\\"}"}}]},
  {"role": "tool", "tool_call_id": "call_ok", "content": "找到5家酒店：1. 北京王府半岛酒店 2. 北京四季酒店..."},
  {"role": "assistant", "content": "为您找到5家五星级酒店"}
]
\`\`\`

**示例 3：多轮对话合并（通过删除中间过程）**

原始（约 400 tokens）：
\`\`\`json
[
  {"role": "user", "content": "帮我创建一个新文件"},
  {"role": "assistant", "content": "好的，我需要知道文件名和内容。请问文件名是什么？"},
  {"role": "user", "content": "文件名叫 test.txt"},
  {"role": "assistant", "content": "明白了，文件名是 test.txt。那么您想在文件中写入什么内容呢？"},
  {"role": "user", "content": "写入 'Hello World'"},
  {"role": "assistant", "content": "收到！我现在帮您创建文件 test.txt，并写入内容 'Hello World'"},
  {"role": "assistant", "tool_calls": [{"id": "call_xyz", "type": "function", "function": {"name": "write_file", "arguments": "{\\"path\\":\\"test.txt\\",\\"content\\":\\"Hello World\\"}"}}]},
  {"role": "tool", "tool_call_id": "call_xyz", "content": "文件创建成功。文件路径：/workspace/test.txt。文件大小：11 bytes。创建时间：2024-01-15 10:30:00"},
  {"role": "assistant", "content": "太好了！文件 test.txt 已经成功创建，内容为 'Hello World'。"}
]
\`\`\`

压缩后（约 150 tokens，删除了询问过程，保留最终状态）：
\`\`\`json
[
  {"role": "user", "content": "帮我创建一个新文件"},
  {"role": "user", "content": "文件名叫 test.txt"},
  {"role": "user", "content": "写入 'Hello World'"},
  {"role": "assistant", "tool_calls": [{"id": "call_xyz", "type": "function", "function": {"name": "write_file", "arguments": "{\\"path\\":\\"test.txt\\",\\"content\\":\\"Hello World\\"}"}}]},
  {"role": "tool", "tool_call_id": "call_xyz", "content": "文件创建成功。文件路径：/workspace/test.txt。文件大小：11 bytes"},
  {"role": "assistant", "content": "文件 test.txt 已经成功创建，内容为 'Hello World'"}
]
\`\`\`

**关键**：删除了 assistant 的询问消息，但保留了所有 user 消息和最终结果，所有内容都来自原文。

---

## 待压缩的对话历史

${JSON.stringify(messages, null, 2)}

---

请严格按照三阶段工作流执行，确保对话逻辑连贯、ID 映射关系完全正确，输出接近目标 token 数。`;
};
