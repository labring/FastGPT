import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionMessageToolCall
} from '@fastgpt/global/core/ai/type';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import type { AIChatItemType, AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import type {
  InteractiveNodeResponseType,
  WorkflowInteractiveResponseType
} from '@fastgpt/global/core/workflow/template/system/interactive/type';
import type { CreateLLMResponseProps, ResponseEvents } from './request';
import { createLLMResponse } from './request';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { countGptMessagesTokens } from '../../../common/string/tiktoken/index';
import { addLog } from '../../../common/system/log';
import type { AgentPlanStepType } from '../../workflow/dispatch/ai/agent/sub/plan/type';

type RunAgentCallProps = {
  maxRunAgentTimes: number;
  interactiveEntryToolParams?: WorkflowInteractiveResponseType['toolParams'];
  currentStep?: AgentPlanStepType;

  body: {
    messages: ChatCompletionMessageParam[];
    model: LLMModelItemType;
    temperature?: number;
    top_p?: number;
    stream?: boolean;
    subApps: ChatCompletionTool[];
  };

  userKey?: CreateLLMResponseProps['userKey'];
  isAborted?: CreateLLMResponseProps['isAborted'];

  getToolInfo: (id: string) => {
    name: string;
    avatar: string;
  };
  handleToolResponse: (e: {
    call: ChatCompletionMessageToolCall;
    messages: ChatCompletionMessageParam[];
  }) => Promise<{
    response: string;
    usages: ChatNodeUsageType[];
    interactive?: InteractiveNodeResponseType;
  }>;
} & ResponseEvents;

type RunAgentResponse = {
  completeMessages: ChatCompletionMessageParam[];
  assistantResponses: AIChatItemValueItemType[];
  interactiveResponse?: InteractiveNodeResponseType;

  // Usage
  inputTokens: number;
  outputTokens: number;
  subAppUsages: ChatNodeUsageType[];
};

/**
 * 压缩 Agent 对话历史
 * 当 messages 的 token 长度超过模型最大长度的 0.7 时，调用 LLM 进行压缩
 */
const compressAgentMessages = async (
  messages: ChatCompletionMessageParam[],
  model: LLMModelItemType,
  currentDescription: string
): Promise<ChatCompletionMessageParam[]> => {
  if (!messages || messages.length === 0) return messages;

  const tokenCount = await countGptMessagesTokens(messages);
  const maxTokenThreshold = model.maxContext * 0.7;
  // Test
  // const maxTokenThreshold = 10000;

  addLog.debug('Agent messages token check', {
    tokenCount,
    maxTokenThreshold,
    needCompress: tokenCount > maxTokenThreshold
  });

  const messagesJson = JSON.stringify(messages, null, 2);

  if (tokenCount <= maxTokenThreshold) {
    console.log('messages 无需压缩，共', messages.length, '条消息');
    // console.log('messagesJson', messagesJson);
    // messages.forEach((msg, idx) => {
    //   console.log(`\n=== Message ${idx} (${msg.role}) ===`);
    //   console.log(JSON.stringify(msg, null, 2));
    // });
    return messages;
  }

  const compressionRatio = 0.6;
  const targetTokens = Math.round(tokenCount * compressionRatio);

  addLog.info('Start compressing agent messages', {
    originalTokens: tokenCount,
    targetTokens,
    compressionRatio
  });

  const systemPrompt = `你是 Agent 对话历史压缩专家。你的任务是将对话历史压缩到目标 token 数，同时确保工具调用的 ID 映射关系完全正确。

    ## 当前任务目标
    ${currentDescription}
    
    ## 压缩目标（最高优先级）
    - **原始 token 数**: ${tokenCount} tokens
    - **目标 token 数**: ${targetTokens} tokens (压缩比例: ${Math.round(compressionRatio * 100)}%)
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
    
    2. **评估消息相关性**
       根据当前任务目标「${currentDescription}」，为每条消息标注相关性等级：
       - **[高]**: 直接支撑任务目标，包含关键数据/结论
       - **[中]**: 间接相关，提供背景信息
       - **[低]**: 弱相关或无关，可大幅精简或删除
    
    3. **确定压缩策略**
       - **system 消息**：保持完整，不做修改
       - 高相关消息：保留 70-90% 内容（精简冗余表达）
       - 中等相关消息：保留 30-50% 内容（提炼核心要点）
       - 低相关消息：保留 10-20% 内容或删除（仅保留一句话总结）
    
    ---
    
    ### 【第二阶段：执行压缩】
    
    基于第一阶段的分析，执行压缩操作：
    
    **压缩原则**：
    1. **ID 不可变**: 所有 tool_call 的 id 和 tool_call_id 必须原样保留，绝不修改
    2. **结构完整**: 每个 tool_call 对象必须包含 \`id\`, \`type\`, \`function\` 字段
    3. **顺序保持**: assistant 的 tool_calls 和对应的 tool 响应按原始顺序出现
    4. **大幅精简 content**:
       - tool 消息的 content：删除冗长描述、重复信息，只保留核心结论和关键数据
       - 合并相似的工具结果（但保留各自的 tool_call_id）
    5. **目标优先**: 围绕任务目标压缩，与目标无关的消息可删除
    
    **压缩技巧**：
    - 删除：详细过程描述、重复信息、失败尝试、调试日志
    - 保留：具体数据、关键结论、错误信息、链接引用
    - 精简：用"核心发现：A、B、C"代替长篇叙述
    
    ---
    
    ### 【第三阶段：自校验】
    
    输出前，必须检查：
    
    1. **ID 一致性校验**
       - 每个 assistant 消息中的 tool_calls[i].id 是否有对应的 tool 消息？
       - 每个 tool 消息的 tool_call_id 是否能在前面的 assistant 消息中找到？
       - 是否所有 ID 都原样保留，没有修改或生成新 ID？
    
    2. **压缩比例校验**
       - 估算输出的 JSON 字符串长度，是否接近 ${targetTokens} tokens？
       - 如果超出目标，需进一步精简 content 字段
    
    3. **格式完整性校验**
       - 所有 tool_call 对象是否包含完整的 \`id\`, \`type\`, \`function\` 字段？
       - JSON 结构是否正确？
    
    ---
    
    ## 输出格式
    
    请按照以下 JSON 格式输出（必须使用 \`\`\`json 代码块）：
    
    \`\`\`json
    {
      "compressed_messages": [
        {"role": "system", "content": "系统指令（精简后）"},
        {"role": "user", "content": "用户请求"},
        {
          "role": "assistant",
          "content": "",
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
        }
      ],
      "compression_summary": "原始${tokenCount}tokens → 约X tokens (压缩比例Y%)。操作：删除了Z条低相关消息，精简了N个工具响应。ID映射关系已验证正确。"
    }
    \`\`\`
    
    ---
    
    ## 压缩示例
    
    **示例 1：工具调用压缩**
    
    原始（500+ tokens）：
    \`\`\`json
    [
      {"role": "assistant", "tool_calls": [{"id": "call_abc", "type": "function", "function": {"name": "search", "arguments": "{\\"query\\":\\"Python性能优化完整指南\\",\\"max_results\\":10}"}}]},
      {"role": "tool", "tool_call_id": "call_abc", "content": "找到10篇文章：\\n1. 标题：Python性能优化完整指南\\n   作者：张三\\n   发布时间：2024-01-15\\n   摘要：本文详细介绍了Python性能优化的各种技巧，包括...（此处省略400字详细内容）\\n   URL: https://example.com/article1\\n2. 标题：..."}
    ]
    \`\`\`
    
    压缩后（100 tokens）：
    \`\`\`json
    [
      {"role": "assistant", "tool_calls": [{"id": "call_abc", "type": "function", "function": {"name": "search", "arguments": "{\\"query\\":\\"Python性能优化\\"}"}}]},
      {"role": "tool", "tool_call_id": "call_abc", "content": "找到10篇文章。核心发现：①Cython可提升30%性能 ②NumPy向量化比循环快10倍 ③使用__slots__节省内存"}
    ]
    \`\`\`
    
    **示例 2：相似内容合并**
    
    如果有多个相似的搜索结果，可以合并 content，但必须保留各自的 ID 映射。
    
    ---
    
    ## 待压缩的对话历史
    
    ${messagesJson}
    
    ---
    
    请严格按照三阶段工作流执行，确保 ID 映射关系完全正确，输出接近目标 token 数。`;

  const userPrompt = '请执行压缩操作，严格按照JSON格式返回结果。';

  try {
    const { answerText } = await createLLMResponse({
      body: {
        model,
        messages: [
          {
            role: ChatCompletionRequestMessageRoleEnum.System,
            content: systemPrompt
          },
          {
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: userPrompt
          }
        ],
        temperature: 0.1,
        stream: false
      }
    });

    if (!answerText) {
      addLog.warn('Compression failed: empty response, return original messages');
      return messages;
    }

    const jsonMatch =
      answerText.match(/```json\s*([\s\S]*?)\s*```/) || answerText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      addLog.warn('Compression failed: cannot parse JSON, return original messages');
      return messages;
    }

    const jsonText = jsonMatch[1] || jsonMatch[0];
    const parsed = JSON.parse(jsonText);

    if (!parsed.compressed_messages || !Array.isArray(parsed.compressed_messages)) {
      addLog.warn('Compression failed: invalid format, return original messages');
      return messages;
    }

    const compressedTokens = await countGptMessagesTokens(parsed.compressed_messages);
    addLog.info('Agent messages compressed successfully', {
      originalTokens: tokenCount,
      compressedTokens,
      actualRatio: (compressedTokens / tokenCount).toFixed(2),
      summary: parsed.compression_summary
    });

    // console.log("------------- \n压缩完成 \n压缩前的 message：", messagesJson);
    // console.log('压缩后的 message：', JSON.stringify(parsed.compressed_messages, null, 2));
    return parsed.compressed_messages as ChatCompletionMessageParam[];
  } catch (error) {
    addLog.error('Compression failed', error);
    return messages;
  }
};

export const runAgentCall = async ({
  maxRunAgentTimes,
  interactiveEntryToolParams,
  currentStep,
  body: { model, messages, stream, temperature, top_p, subApps },
  userKey,
  isAborted,

  handleToolResponse,
  getToolInfo,

  onReasoning,
  onStreaming,
  onToolCall,
  onToolParam
}: RunAgentCallProps): Promise<RunAgentResponse> => {
  let runTimes = 0;

  const assistantResponses: AIChatItemValueItemType[] = [];
  let interactiveResponse: InteractiveNodeResponseType | undefined;

  let requestMessages = messages;

  let inputTokens: number = 0;
  let outputTokens: number = 0;
  const subAppUsages: ChatNodeUsageType[] = [];

  // TODO: interactive rewrite messages

  while (runTimes < maxRunAgentTimes) {
    // TODO: 费用检测
    runTimes++;

    // Request LLM
    let {
      reasoningText: reasoningContent,
      answerText: answer,
      toolCalls = [],
      usage,
      getEmptyResponseTip,
      completeMessages
    } = await createLLMResponse({
      body: {
        model,
        messages: requestMessages,
        tool_choice: 'auto',
        toolCallMode: model.toolChoice ? 'toolChoice' : 'prompt',
        tools: subApps,
        parallel_tool_calls: true,
        stream,
        temperature,
        top_p
      },
      userKey,
      isAborted,
      onReasoning,
      onStreaming,
      onToolCall,
      onToolParam
    });

    if (!answer && !reasoningContent && !toolCalls.length) {
      return Promise.reject(getEmptyResponseTip());
    }

    const requestMessagesLength = requestMessages.length;
    requestMessages = completeMessages.slice();

    let isFirstTool = true;
    console.log('toolCalls', toolCalls);
    for await (const tool of toolCalls) {
      console.log('tool', tool);
      if (isFirstTool) {
        const lastMessage = requestMessages[requestMessages.length - 1];
        if (lastMessage?.role === ChatCompletionRequestMessageRoleEnum.Assistant) {
          requestMessages[requestMessages.length - 1] = {
            role: ChatCompletionRequestMessageRoleEnum.Assistant,
            content: lastMessage.content || '',
            tool_calls: [tool]
          };
        }
        isFirstTool = false;
      } else {
        requestMessages.push({
          role: ChatCompletionRequestMessageRoleEnum.Assistant,
          content: '',
          tool_calls: [tool]
        });
      }
      // TODO: 加入交互节点处理
      const { response, usages, interactive } = await handleToolResponse({
        call: tool,
        messages: requestMessages.slice(0, requestMessagesLength) // 取原来 request 的上下文
      });

      requestMessages.push({
        tool_call_id: tool.id,
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        content: response
      });
      if (currentStep) {
        const taskDescription = currentStep.description || currentStep.title;
        if (taskDescription) {
          requestMessages = await compressAgentMessages(requestMessages, model, taskDescription);
        }
      }

      subAppUsages.push(...usages);

      if (interactive) {
        interactiveResponse = interactive;
      }
    }
    // TODO: 移动到工作流里 assistantResponses concat
    const currentAssistantResponses = GPTMessages2Chats({
      messages: requestMessages.slice(requestMessagesLength),
      getToolInfo
    })[0] as AIChatItemType;

    if (currentAssistantResponses) {
      assistantResponses.push(...currentAssistantResponses.value);
    }

    // Usage concat
    inputTokens += usage.inputTokens;
    outputTokens += usage.outputTokens;

    if (toolCalls.length === 0) {
      break;
    }
  }

  return {
    inputTokens,
    outputTokens,
    completeMessages: requestMessages,
    assistantResponses,
    subAppUsages,
    interactiveResponse
  };
};
