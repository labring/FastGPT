import { MongoAiSkill } from '../../../../ai/skill/schema';
import type { AiSkillSchemaType } from '@fastgpt/global/core/ai/skill/type';
import { createLLMResponse } from '../../../../ai/llm/request';
import type { ChatCompletionMessageParam, ChatCompletionTool } from '@fastgpt/global/core/ai/type';
import { getLLMModel } from '../../../../ai/model';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getErrText } from '@fastgpt/global/common/error/utils';
import type { SubAppRuntimeType } from './type';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import { getSubapps } from './utils';
import { addLog } from '../../../../../common/system/log';

/**
 * 主匹配函数
 * 参考 MatcherService.ts 的 match 方法
 */
export const matchSkillForPlan = async ({
  teamId,
  appId,
  userInput,
  messages,
  model,
  tmbId,
  lang
}: {
  teamId: string;
  appId: string;
  userInput: string;
  messages?: ChatCompletionMessageParam[];
  model: string;

  tmbId: string;
  lang?: localeType;
}): Promise<
  | {
      matched: false;
      reason: string;
    }
  | {
      matched: true;
      reason?: string;
      skill: AiSkillSchemaType;
      systemPrompt: string;
      completionTools: ChatCompletionTool[];
      subAppsMap: Map<string, SubAppRuntimeType>;
    }
> => {
  /**
   * 构建 Skill Tools 数组
   * 参考 MatcherService.ts 的 match 函数
   */
  const buildSkillTools = (skills: AiSkillSchemaType[]) => {
    const skillCompletionTools: ChatCompletionTool[] = [];
    const skillsMap: Record<string, AiSkillSchemaType> = {};

    for (const skill of skills) {
      // 生成唯一函数名
      const functionName = getNanoid(6);
      skill.name = functionName;
      skillsMap[functionName] = skill;

      if (skill.description) {
        skillCompletionTools.push({
          type: 'function',
          function: {
            name: functionName,
            description: skill.description,
            parameters: {
              type: 'object',
              properties: {},
              required: []
            }
          }
        });
      }
    }

    return { skillCompletionTools, skillsMap };
  };

  /**
   * 格式化 Skill 为 SystemPrompt
   * 将匹配到的 skill 格式化为 XML 提示词
   */
  const formatSkillAsSystemPrompt = (skill: AiSkillSchemaType): string => {
    const lines = ['<reference_skill>', `**参考技能**: ${skill.name}`, ''];

    if (skill.description) {
      lines.push(`**描述**: ${skill.description}`, '');
    }

    if (skill.steps && skill.steps.trim()) {
      lines.push(`**步骤信息**:`, skill.steps, '');
    }

    lines.push(
      '**说明**:',
      '1. 以上是用户之前保存的类似任务的执行框架',
      '2. 请参考该技能的宏观阶段划分和资源方向',
      '3. 根据当前用户的具体需求，调整和优化框架',
      '4. 保持阶段的逻辑性和方向的清晰性',
      '',
      '</reference_skill>'
    );

    return lines.join('\n');
  };

  addLog.debug('matchSkillForPlan start');
  const modelData = getLLMModel(model);

  try {
    const skills = await MongoAiSkill.find({
      teamId,
      appId
    })
      .sort({ createTime: -1 })
      .limit(50)
      .lean();

    if (!skills || skills.length === 0) {
      return { matched: false, reason: 'No skills available' };
    }

    const { skillCompletionTools, skillsMap } = buildSkillTools(skills);

    console.debug('skill tools', skillCompletionTools);

    // 4. 调用 LLM Tool Calling 进行匹配
    // 构建系统提示词，指导 LLM 选择相似的任务
    const skillMatchSystemPrompt = `你是一个智能任务匹配助手。请根据用户的当前需求，从提供的技能工具集中选择最相似的任务。

      **匹配原则**：
      1. **任务目标相似性**：选择与用户目标最匹配的技能
      2. **执行步骤相似性**：考虑任务执行的流程和步骤
      3. **工具使用相似性**：优先选择使用类似工具组合的技能
      4. **场景适用性**：考虑应用场景和上下文的相似性
      
      **选择建议**：
      - 如果用户的需求与某个技能高度匹配，直接选择对应的工具
      - 如果有多个相似技能，选择最符合主要目标的那个
      - 如果没有找到完全匹配的技能，选择功能最相近的
      
      请从以下工具中选择一个最匹配的：
      
      工具匹配上直接使用工具调用的形式而不是文本描述的形式来进行返回`;

    const allMessages: ChatCompletionMessageParam[] = [
      {
        role: 'system' as const,
        content: skillMatchSystemPrompt
      }
    ];

    if (messages && messages.length > 0) {
      allMessages.push(...messages);
    }

    allMessages.push({
      role: 'user' as const,
      content: userInput
    });

    // console.debug('match request', {
    //   hasHistory: !!(messages && messages.length > 0),
    //   historyCount: messages?.length || 0,
    //   currentInput: userInput.substring(0, 100), // 只显示前100个字符
    //   skillCount: skills.length
    // });

    const llmResponse = await createLLMResponse({
      body: {
        model: modelData.model,
        messages: allMessages,
        tools: skillCompletionTools,
        tool_choice: 'auto',
        toolCallMode: modelData.toolChoice ? 'toolChoice' : 'prompt',
        stream: false
      }
    });

    // 打印完整对象（过滤掉可能很长的字段）
    const { assistantMessage, ...otherFields } = llmResponse;

    const { toolCalls } = llmResponse;

    // 5. 解析匹配结果
    if (toolCalls && toolCalls.length > 0) {
      const toolCall = toolCalls[0];
      const functionName = toolCall.function.name;

      if (skillsMap[functionName]) {
        const matchedSkill = skillsMap[functionName];
        console.log('matchedSkill', matchedSkill);
        const systemPrompt = formatSkillAsSystemPrompt(matchedSkill);

        // Get tools
        const { completionTools, subAppsMap } = await getSubapps({
          tools: matchedSkill.tools,
          tmbId,
          lang
        });

        return {
          matched: true,
          skill: matchedSkill,
          systemPrompt,
          completionTools,
          subAppsMap
        };
      }
    }

    return {
      matched: false,
      reason: 'No matching skill found'
    };
  } catch (error: any) {
    console.error('Error during skill matching:', error);
    return {
      matched: false,
      reason: getErrText(error)
    };
  }
};

export const matchSkillForId = async ({
  id,
  tmbId,
  lang
}: {
  id: string;
  tmbId: string;
  lang?: localeType;
}) => {
  const skill = await MongoAiSkill.findById(id).lean();
  if (!skill || !skill.tools) return;
  const { completionTools: skillTools, subAppsMap: skillSubAppsMap } = await getSubapps({
    tools: skill.tools,
    tmbId,
    lang
  });

  return {
    skillTools,
    skillSubAppsMap
  };
};
