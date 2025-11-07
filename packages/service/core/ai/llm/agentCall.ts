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
import { countGptMessagesTokens, countPromptTokens } from '../../../common/string/tiktoken/index';
import { addLog } from '../../../common/system/log';
import type { AgentPlanStepType } from '../../workflow/dispatch/ai/agent/sub/plan/type';
import { calculateCompressionThresholds } from './compressionConstants';

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
 * Compress a single oversized tool response
 * Integrates character reduction + chunk compression logic
 */
const compressSingleToolResponse = async (
  response: string,
  model: LLMModelItemType,
  toolName: string,
  currentDescription: string,
  maxTargetTokens: number = 4000
): Promise<string> => {
  const originalTokens = await countPromptTokens(response);

  console.log(
    `Start single tool compression ${toolName}: ${originalTokens} tokens → target ${maxTargetTokens} tokens`
  );
  console.log('Response content preview:\n', response.slice(0, 1000));

  // ============ Phase 1: Smart character reduction ============
  let reduced = response;

  // delete URL
  reduced = reduced.replace(/https?:\/\/[^\s]+/g, '');

  // delete base64 code
  reduced = reduced.replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, '');
  reduced = reduced.replace(/base64,[A-Za-z0-9+/=]{50,}/g, '');

  // delete HTML/XML tag
  reduced = reduced.replace(/<[^>]+>/g, '');

  // delete Markdown images
  reduced = reduced.replace(/!\[([^\]]*)\]\([^\)]+\)/g, '');

  reduced = reduced.replace(
    /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu,
    ''
  );

  // Compress whitespace
  reduced = reduced.replace(/\n{3,}/g, '\n\n');
  reduced = reduced.replace(/ {2,}/g, ' ');
  reduced = reduced.replace(/\t+/g, ' ');

  // Remove duplicate separators
  reduced = reduced.replace(/[-=_*#]{5,}/g, '---');

  // Deduplicate consecutive identical lines
  const allLines = reduced.split('\n');
  const deduplicatedLines: string[] = [];
  let lastLine = '';
  for (const line of allLines) {
    const trimmed = line.trim();
    if (trimmed !== lastLine || trimmed === '') {
      deduplicatedLines.push(line);
      lastLine = trimmed;
    }
  }
  reduced = deduplicatedLines.join('\n').trim();

  let currentTokens = await countPromptTokens(reduced);
  addLog.info(`After character reduction`, {
    tool: toolName,
    before: originalTokens,
    after: currentTokens,
    saved: originalTokens - currentTokens
  });
  console.log('After character reduction - content preview:\n', reduced.slice(0, 1000));
  // 2. If reduction meets the requirement, return directly
  if (currentTokens <= maxTargetTokens) {
    return reduced;
  }

  // ============ Phase 2: Chunk compression ============
  const thresholds = calculateCompressionThresholds(model.maxContext);
  const chunkMaxTokens = thresholds.chunkSize;

  if (currentTokens <= chunkMaxTokens) {
    const systemPrompt = `你是内容压缩专家。将以下内容压缩到约 ${maxTargetTokens} tokens。
      任务: ${currentDescription}
      工具: ${toolName}
      要求：
      - 保留关键数据、结论、错误信息
      - 删除冗余描述、重复内容
      - 格式简洁
      直接输出压缩文本。
      ${reduced}`;

    try {
      const { answerText } = await createLLMResponse({
        body: {
          model,
          messages: [
            { role: ChatCompletionRequestMessageRoleEnum.System, content: systemPrompt },
            {
              role: ChatCompletionRequestMessageRoleEnum.User,
              content: '请按照目标的 token 数量进行压缩'
            }
          ],
          temperature: 0.1,
          stream: false
        }
      });

      if (answerText) {
        reduced = answerText;
        currentTokens = await countPromptTokens(reduced);
      }
    } catch (error) {
      addLog.error(`LLM 压缩失败: ${toolName}`, error);
    }

    addLog.info(`压缩完成`, {
      tool: toolName,
      final: currentTokens,
      ratio: `${((currentTokens / originalTokens) * 100).toFixed(1)}%`
    });
    console.log('LLM 压缩后-内容预览:\n', reduced);
    return reduced;
  }

  const targetChunkCount = Math.ceil(currentTokens / chunkMaxTokens);
  const chunkSize = Math.ceil(reduced.length / targetChunkCount);
  const chunks: string[] = [];

  for (let i = 0; i < targetChunkCount; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, reduced.length);
    chunks.push(reduced.substring(start, end));
  }

  addLog.info(`分块压缩信息：`, {
    currentTokens: currentTokens,
    tool: toolName,
    chunkslength: chunks.length,
    chunks: chunks
  });

  const targetPerChunk = Math.floor(maxTargetTokens / chunks.length);

  const compressPromises = chunks.map(async (chunk, idx) => {
    const systemPrompt = `你是内容压缩专家。将以下内容压缩到约 ${targetPerChunk} tokens。

      任务: ${currentDescription}
      处理: ${toolName}-块${idx + 1}/${chunks.length}
      
      要求：
      - 保留关键数据、结论、错误
      - 删除冗余、重复内容
      - 格式简洁
      
      直接输出压缩文本。

      ${chunk}`;

    try {
      const { answerText } = await createLLMResponse({
        body: {
          model,
          messages: [
            { role: ChatCompletionRequestMessageRoleEnum.System, content: systemPrompt },
            {
              role: ChatCompletionRequestMessageRoleEnum.User,
              content: '请按照目标的 token 数量进行压缩'
            }
          ],
          temperature: 0.1,
          stream: false
        }
      });

      return answerText || chunk;
    } catch (error) {
      addLog.error(`块${idx + 1}压缩失败`, error);
      return chunk;
    }
  });

  const compressedChunks = await Promise.all(compressPromises);
  reduced = compressedChunks.join('\n\n');

  currentTokens = await countPromptTokens(reduced);
  addLog.info(`分块压缩完成`, {
    tool: toolName,
    step1: originalTokens,
    final: currentTokens,
    ratio: `${((currentTokens / originalTokens) * 100).toFixed(1)}%`,
    reduced: reduced
  });

  return reduced;
};

/**
 * 压缩 Agent 对话历史
 * 当 messages 的 token 长度超过阈值时，调用 LLM 进行压缩
 */
const compressAgentMessages = async (
  messages: ChatCompletionMessageParam[],
  model: LLMModelItemType,
  currentDescription: string
): Promise<ChatCompletionMessageParam[]> => {
  if (!messages || messages.length === 0) return messages;

  const tokenCount = await countGptMessagesTokens(messages);
  const thresholds = calculateCompressionThresholds(model.maxContext);
  const maxTokenThreshold = thresholds.agentMessages.threshold;

  addLog.debug('Agent messages token check', {
    tokenCount,
    maxTokenThreshold,
    needCompress: tokenCount > maxTokenThreshold
  });

  const messagesJson = JSON.stringify(messages, null, 2);

  if (tokenCount <= maxTokenThreshold) {
    console.log('messages 无需压缩，共', messages.length, '条消息');
    return messages;
  }

  const targetTokens = Math.round(tokenCount * thresholds.agentMessages.targetRatio);

  addLog.info('Start compressing agent messages', {
    originalTokens: tokenCount,
    targetTokens,
    compressionRatio: thresholds.agentMessages.targetRatio
  });

  const systemPrompt = `你是 Agent 对话历史压缩专家。你的任务是将对话历史压缩到目标 token 数，同时确保工具调用的 ID 映射关系完全正确。

    ## 当前任务目标
    ${currentDescription}
    
    ## 压缩目标（最高优先级）
    - **原始 token 数**: ${tokenCount} tokens
    - **目标 token 数**: ${targetTokens} tokens (压缩比例: ${Math.round(thresholds.agentMessages.targetRatio * 100)}%)
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

    for await (const tool of toolCalls) {
      // TODO: 加入交互节点处理
      const { response, usages, interactive } = await handleToolResponse({
        call: tool,
        messages: requestMessages.slice(0, requestMessagesLength)
      });

      let finalResponse = response;
      const thresholds = calculateCompressionThresholds(model.maxContext);
      const toolTokenCount = await countPromptTokens(response);
      if (toolTokenCount > thresholds.singleTool.threshold && currentStep) {
        const taskDescription = currentStep.description || currentStep.title;
        finalResponse = await compressSingleToolResponse(
          response,
          model,
          tool.function.name,
          taskDescription,
          thresholds.singleTool.target
        );
      }

      requestMessages.push({
        tool_call_id: tool.id,
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        content: finalResponse
      });

      subAppUsages.push(...usages);

      if (interactive) {
        interactiveResponse = interactive;
      }
    }

    if (toolCalls.length > 0 && currentStep) {
      const taskDescription = currentStep.description || currentStep.title;
      if (taskDescription) {
        requestMessages = await compressAgentMessages(requestMessages, model, taskDescription);
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
