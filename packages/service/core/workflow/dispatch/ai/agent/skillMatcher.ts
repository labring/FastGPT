import { MongoHelperBotGeneratedSkill } from '../../../../chat/HelperBot/generatedSkillSchema';
import type { HelperBotGeneratedSkillType } from '@fastgpt/global/core/chat/helperBot/generatedSkill/type';
import { createLLMResponse } from '../../../../ai/llm/request';
import type { ChatCompletionMessageParam, ChatCompletionTool } from '@fastgpt/global/core/ai/type';
import { getLLMModel } from '../../../../ai/model';

/**
 * 生成唯一函数名
 * 参考 MatcherService.ts 的 _generateUniqueFunctionName
 */
const generateUniqueFunctionName = (skill: HelperBotGeneratedSkillType): string => {
  let baseName = skill.name || skill._id.toString();

  // 清理名称
  let cleanName = baseName.replace(/[^a-zA-Z0-9_]/g, '_');

  if (cleanName && !/^[a-zA-Z_]/.test(cleanName)) {
    cleanName = 'skill_' + cleanName;
  } else if (!cleanName) {
    cleanName = 'skill_unknown';
  }

  const timestampSuffix = Date.now().toString().slice(-6);
  // return `${cleanName}_${timestampSuffix}`;
  return `${cleanName}`;
};

/**
 * 构建 Skill Tools 数组
 * 参考 MatcherService.ts 的 match 函数
 */
export const buildSkillTools = (
  skills: HelperBotGeneratedSkillType[]
): {
  tools: ChatCompletionTool[];
  skillsMap: Record<string, HelperBotGeneratedSkillType>;
} => {
  const tools: ChatCompletionTool[] = [];
  const skillsMap: Record<string, HelperBotGeneratedSkillType> = {};

  for (const skill of skills) {
    // 生成唯一函数名
    const functionName = generateUniqueFunctionName(skill);
    skillsMap[functionName] = skill;

    // 构建 description
    let description = skill.description || 'No description available';

    tools.push({
      type: 'function',
      function: {
        name: functionName,
        description: description,
        parameters: {
          type: 'object',
          properties: {},
          required: []
        }
      }
    });
  }

  return { tools, skillsMap };
};

/**
 * 格式化 Skill 为 SystemPrompt
 * 将匹配到的 skill 格式化为 XML 提示词
 */
export const formatSkillAsSystemPrompt = (skill: HelperBotGeneratedSkillType): string => {
  let prompt = '<reference_skill>\n';
  prompt += `**参考技能**: ${skill.name}\n\n`;

  if (skill.description) {
    prompt += `**描述**: ${skill.description}\n\n`;
  }

  if (skill.steps && skill.steps.trim()) {
    prompt += `**步骤信息**:\n${skill.steps}\n\n`;
  }

  prompt += '**说明**:\n';
  prompt += '1. 以上是用户之前保存的类似任务的执行计划\n';
  prompt += '2. 请参考该技能的步骤流程和工具选择\n';
  prompt += '3. 根据当前用户的具体需求，调整和优化计划\n';
  prompt += '4. 保持步骤的逻辑性和完整性\n';
  prompt += '</reference_skill>\n';

  return prompt;
};

/**
 * 主匹配函数
 * 参考 MatcherService.ts 的 match 方法
 */
export const matchSkillForPlan = async ({
  teamId,
  appId,
  userInput,
  model
}: {
  teamId: string;
  appId: string;
  userInput: string;
  model: string;
}): Promise<{
  matched: boolean;
  skill?: HelperBotGeneratedSkillType;
  systemPrompt?: string;
  reason?: string;
}> => {
  try {
    // 1. 查询用户的 skills (使用 teamId 和 appId)
    const skills = await MongoHelperBotGeneratedSkill.find({
      teamId,
      appId,
      status: { $in: ['active', 'draft'] }
    })
      .sort({ createTime: -1 })
      .limit(50) // 限制数量，避免 tools 过多
      .lean();
    console.log('skill list length', skills.length);
    console.log('skill', skills);
    if (!skills || skills.length === 0) {
      return { matched: false, reason: 'No skills available' };
    }

    // 2. 构建 tools 数组
    const { tools, skillsMap } = buildSkillTools(skills);

    console.log('tools', tools);

    // 3. 获取模型配置
    const modelData = getLLMModel(model);

    // 4. 调用 LLM Tool Calling 进行匹配
    // 构建系统提示词，指导 LLM 选择相似的任务
    const systemPrompt = `你是一个智能任务匹配助手。请根据用户的当前需求，从提供的技能工具集中选择最相似的任务。

      **匹配原则**：
      1. **任务目标相似性**：选择与用户目标最匹配的技能
      2. **执行步骤相似性**：考虑任务执行的流程和步骤
      3. **工具使用相似性**：优先选择使用类似工具组合的技能
      4. **场景适用性**：考虑应用场景和上下文的相似性
      
      **选择建议**：
      - 如果用户的需求与某个技能高度匹配，直接选择对应的工具
      - 如果有多个相似技能，选择最符合主要目标的那个
      - 如果没有找到完全匹配的技能，选择功能最相近的
      
      请从以下工具中选择一个最匹配的：`;

    // 构建简化的消息，只包含系统提示词和用户输入
    const allMessages = [
      {
        role: 'system' as const,
        content: systemPrompt
      },
      {
        role: 'user' as const,
        content: userInput
      }
    ];
    console.log('match request', { userInput, skillCount: skills.length });

    const { toolCalls } = await createLLMResponse({
      body: {
        model: modelData.model,
        messages: allMessages,
        tools,
        tool_choice: 'auto',
        toolCallMode: modelData.toolChoice ? 'toolChoice' : 'prompt',
        stream: false
      }
    });

    // 5. 解析匹配结果
    if (toolCalls && toolCalls.length > 0) {
      const toolCall = toolCalls[0];
      const functionName = toolCall.function.name;

      if (skillsMap[functionName]) {
        const matchedSkill = skillsMap[functionName];
        const systemPrompt = formatSkillAsSystemPrompt(matchedSkill);

        return {
          matched: true,
          skill: matchedSkill,
          systemPrompt
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
      reason: error.message || 'Unknown error'
    };
  }
};
