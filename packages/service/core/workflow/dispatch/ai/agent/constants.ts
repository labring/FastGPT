import type { AgentPlanStepType } from './sub/plan/type';
import { getLLMModel } from '../../../../ai/model';
import { countPromptTokens } from '../../../../../common/string/tiktoken/index';
import { createLLMResponse } from '../../../../ai/llm/request';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { addLog } from '../../../../../common/system/log';
import { calculateCompressionThresholds } from '../../../../ai/llm/compress/constants';

export const getMasterAgentSystemPrompt = async ({
  steps,
  step,
  userInput,
  background = '',
  model
}: {
  steps: AgentPlanStepType[];
  step: AgentPlanStepType;
  userInput: string;
  background?: string;
  model: string;
}) => {
  /**
   * 压缩步骤提示词（Depends on）
   * 当 stepPrompt 的 token 长度超过模型最大长度的 15% 时，调用 LLM 压缩到 12%
   */
  const compressStepPrompt = async (
    stepPrompt: string,
    model: string,
    currentDescription: string
  ): Promise<string> => {
    if (!stepPrompt) return stepPrompt;

    const modelData = getLLMModel(model);
    if (!modelData) return stepPrompt;

    const tokenCount = await countPromptTokens(stepPrompt);
    const thresholds = calculateCompressionThresholds(modelData.maxContext);
    const maxTokenThreshold = thresholds.dependsOn.threshold;

    if (tokenCount <= maxTokenThreshold) {
      return stepPrompt;
    }

    const targetTokens = thresholds.dependsOn.target;

    const compressionSystemPrompt = `<role>
你是工作流步骤历史压缩专家，擅长从多个已执行步骤的结果中提取关键信息。
你的任务是对工作流的执行历史进行智能压缩，在保留关键信息的同时，大幅降低 token 消耗。
</role>

      <task_context>
      输入内容是按照"步骤ID → 步骤标题 → 执行结果"格式组织的多个步骤记录。
      你需要根据当前任务目标，对这些历史记录进行分级压缩。
      </task_context>
      
      <compression_workflow>
      **第一阶段：快速扫描与相关性评估**
      
      在开始压缩前，请先在内心完成以下思考（不需要输出）：
      1. 浏览所有步骤，识别每个步骤与当前任务目标的相关性
      2. 为每个步骤标注相关性等级：
         - [高]：直接支撑当前任务，包含关键数据或结论
         - [中]：间接相关，提供背景信息或辅助判断
         - [低]：弱相关或无关，可大幅精简或省略
      3. 确定压缩策略：基于相关性等级，决定每个步骤的保留程度
      
      **第二阶段：执行分级压缩**
      
      根据第一阶段的评估，按以下策略压缩：
      
      1. **高相关步骤**（保留度 80-100%）
         - 完整保留：步骤ID、标题、核心执行结果
         - 保留所有：具体数据、关键结论、链接引用、重要发现
         - 仅精简：去除啰嗦的过程描述和冗余表达
      
      2. **中等相关步骤**（保留度 40-60%）
         - 保留：步骤ID、标题、核心要点
         - 提炼：将执行结果浓缩为 2-3 句话
         - 去除：详细过程、重复信息、次要细节
      
      3. **低相关步骤**（保留度 10-20%）
         - 保留：步骤ID、标题
         - 极简化：一句话总结（或直接省略执行结果）
         - 判断：如果完全无关，可整体省略该步骤
      </compression_workflow>
      
      <compression_principles>
      - 删繁就简：移除重复、冗长的描述性内容
      - 去粗取精：针对当前任务目标，保留最相关的要素
      - 保数据留结论：优先保留具体数据、关键结论、链接引用
      - 保持时序：按原始顺序输出，不要打乱逻辑
      - 可追溯性：保留必要的步骤标识，确保能理解信息来源
      - 识别共性：如果连续多个步骤结果相似，可合并描述
      </compression_principles>
      
      <quality_check>
      压缩完成后，请自我检查：
      1. 是否达到了目标压缩比例？
      2. 当前任务所需的关键信息是否都保留了？
      3. 压缩后的内容是否仍能让后续步骤理解发生了什么？
      4. 步骤的时序关系是否清晰？
      </quality_check>`;

    const userPrompt = `请对以下工作流步骤的执行历史进行压缩，保留与当前任务最相关的信息。

**当前任务目标**：${currentDescription}

**需要压缩的步骤历史**：
${stepPrompt}

**压缩要求**：
- 原始长度：${tokenCount} tokens
- 目标长度：约 ${targetTokens} tokens（压缩到原长度的 ${Math.round((targetTokens / tokenCount) * 100)}%）

**输出格式要求**：
1. 保留步骤结构：每个步骤使用"# 步骤ID: [id]\\n\\t - 步骤标题: [title]\\n\\t - 执行结果: [精简后的结果]"的格式
2. 根据相关性分级处理：
   - 与当前任务高度相关的步骤：保留完整的关键信息（数据、结论、链接等）
   - 中等相关的步骤：提炼要点，移除冗余描述
   - 低相关的步骤：仅保留一句话总结或省略执行结果
3. 保持步骤顺序：按原始顺序输出，不要打乱
4. 提取共性：如果连续多个步骤结果相似，可以适当合并描述

**质量标准**：
- 压缩后的内容能让后续步骤理解前置步骤做了什么、得到了什么结果
- 保留所有对当前任务有价值的具体数据和关键结论
- 移除重复、啰嗦的描述性文字

请直接输出压缩后的步骤历史：`;

    try {
      const { answerText } = await createLLMResponse({
        body: {
          model: modelData,
          messages: [
            {
              role: ChatCompletionRequestMessageRoleEnum.System,
              content: compressionSystemPrompt
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

      return answerText || stepPrompt;
    } catch (error) {
      console.error('压缩 stepPrompt 失败:', error);
      // 压缩失败时返回原始内容
      return stepPrompt;
    }
  };

  let stepPrompt = steps
    .filter((item) => step.depends_on && step.depends_on.includes(item.id))
    .map(
      (item) =>
        `# 步骤ID: ${item.id}\n\t - 步骤标题: ${item.title}\n\t - 执行结果: ${item.response}`
    )
    .filter(Boolean)
    .join('\n');
  addLog.debug(`Step call depends_on (LLM): ${step.id}`, step.depends_on);
  // 压缩依赖的上下文
  stepPrompt = await compressStepPrompt(stepPrompt, model, step.description || step.title);

  return `请根据任务背景、之前步骤的执行结果和当前步骤要求选择并调用相应的工具。如果是一个总结性质的步骤，请整合之前步骤的结果进行总结。
  【任务背景】
  目标: ${userInput}
  前置信息: ${background}
  
  【当前步骤】
  步骤ID: ${step.id}
  步骤标题: ${step.title}
  
  ${
    stepPrompt
      ? `【之前步骤的执行结果】
  ${stepPrompt}`
      : ''
  }
  
  【执行指导】
  1. 仔细阅读前面步骤的执行结果，理解已经获得的信息
  2. 根据当前步骤描述和前面的结果，分析需要使用的工具
  3. 从可用工具列表中选择最合适的工具
  4. 基于前面步骤的结果为工具生成合理的参数
  5. 如果需要多个工具，可以同时调用
  6. 确保当前步骤的执行能够有效利用和整合前面的结果
  7. 如果是总结的步骤，请利用之前步骤的信息进行全面总结
  
  请严格按照步骤描述执行，确保完成所有要求的子任务。`;
};
