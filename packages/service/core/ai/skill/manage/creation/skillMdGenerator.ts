import { createLLMResponse } from '../../../llm/request';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';
import { sliceJsonStr } from '@fastgpt/global/common/string/tools';
import json5 from 'json5';

export type GenerateSkillParam = {
  name: string;
  description: string;
  requirements: string;
  model: string;
};

export type SkillGuidance = {
  goal: string;
  workflow?: string;
  requirements?: string;
  examples?: string;
};

export type SkillMdGenerationUsage = {
  inputTokens: number;
  outputTokens: number;
  usedUserOpenAIKey: boolean;
};

/**
 * 生成 SKILL.md 的 system prompt。
 *
 * 这个 prompt 只用于创建阶段的 AI 辅助生成，要求模型直接输出完整 SKILL.md，
 * 不额外包裹解释文本，避免后续打包前还要做二次清洗。
 */
const getSkillMdGeneratorSystemPrompt = () => {
  return `You create concise, production-ready Agent Skill SKILL.md files.

## Output Contract
Return only the SKILL.md file content. Do not add explanations, notes, or markdown code fences.

The file must use this exact outer structure:
---
name: <kebab-case-skill-name>
description: <short trigger description>
---

<markdown body content>

## Frontmatter Rules
- The first line must be exactly "---".
- Include a closing "---" line after the frontmatter.
- Include exactly one blank line between the closing "---" and the markdown body.
- "name" must be kebab-case, 1-64 characters, lowercase letters/numbers/hyphens only, with no leading, trailing, or consecutive hyphens.
- "description" must be 1-200 characters and describe when/why the skill should trigger.

## Body Rules
- Start the markdown body with "# Overview".
- Include "## Instructions" and "## Examples" sections.
- Write the description and markdown body in the same natural language as the user's requirements.
- Prefer concise imperative instructions over long explanations.
- Preserve the user's requirements faithfully. Do not invent tools, dependencies, files, or capabilities that were not requested.
- Keep content practical and directly usable.

## Instruction Quality Rules
- The "## Instructions" section is the most important part of the skill. Make it a concrete workflow, not a generic checklist.
- Include 4-8 numbered steps when the task has a repeatable process.
- Each step must contain a specific action and a decision/output, such as what to inspect, what to create, what to validate, or when to stop and ask the user.
- Include task-specific details from the requirements: expected inputs, files/resources, tools/APIs, constraints, validation checks, and final output shape when they are provided.
- If the requirements do not specify a tool or file, write tool-neutral steps instead of inventing one.
- Avoid vague steps like "Analyze the request", "Do the task", "Ensure quality", or "Return the result" unless they are expanded with task-specific criteria.

## Valid Example
---
name: web-search
description: Search the web
---

# Overview
Provide a clear overview of the skill here.

## Instructions
1. Identify the exact question, required freshness, and any source or domain constraints.
2. Search primary or authoritative sources first; use secondary sources only to fill context gaps.
3. Compare publication dates and discard stale or conflicting results unless the conflict is relevant.
4. Summarize the answer with direct source links and note any uncertainty or missing evidence.

## Examples
- User asks for current product information.
- User asks to compare recent public sources.

## Final Check
Before answering, verify that the first line is "---", the frontmatter has both required fields, the closing "---" exists, and the body starts after one blank line.`;
};

/**
 * 生成 SKILL.md 的 user prompt。
 */
const getSkillMdGeneratorUserPrompt = (params: {
  goal: string;
  workflow?: string;
  requirements?: string;
  examples?: string;
}) => {
  const { goal, workflow, requirements, examples } = params;

  return [
    `Please generate a complete SKILL.md file based on the following skill requirements:

## Skill Goal
${goal}`,
    workflow
      ? `## Workflow/Process
${workflow}`
      : '',
    requirements
      ? `## Additional Requirements
${requirements}`
      : '',
    examples
      ? `## Usage Examples
${examples}`
      : '',
    'Generate the SKILL.md now. Follow the system output contract exactly.'
  ]
    .filter(Boolean)
    .join('\n\n');
};

/**
 * 提取用户 requirements 的结构化设计信息。
 */
const getSkillGuidanceSystemPrompt = () =>
  `You are a skill design analyst. Your task is to analyze the user's skill requirements text and extract structured design information.

Output a JSON object with the following fields:
- "goal" (required, string): A concise statement of what the skill should accomplish
- "workflow" (required, string): A concrete step-by-step process, use numbered list format
- "requirements" (optional, string): Specific constraints, technical requirements, or rules
- "examples" (optional, string): Concrete usage examples or sample scenarios

Rules:
- Output ONLY valid JSON, no markdown code blocks, no explanations
- If the input already contains clear structured information, extract it faithfully
- If the input does not provide explicit steps, infer a practical workflow from the goal and constraints
- Workflow steps must be task-specific and actionable; avoid generic steps like "analyze", "process", or "return result" without concrete criteria
- Do not invent tools, dependencies, files, or capabilities that are not stated or strongly implied by the requirements
- If an optional field cannot be determined from the input, omit it
- Keep extracted text in the same natural language as the user's requirements
- Keep each field concise and focused`;

/**
 * 生成 requirements 结构化提取的 user prompt。
 */
const getSkillGuidanceUserPrompt = ({
  name,
  description,
  requirements
}: {
  name: string;
  description: string;
  requirements: string;
}) => {
  return [
    `Please analyze the following skill requirements and extract structured design information:

## Skill Name
${name}`,
    description
      ? `## Skill Description
${description}`
      : '',
    `## Requirements Text
${requirements}`
  ]
    .filter(Boolean)
    .join('\n\n');
};

/**
 * 使用 LLM 将自由文本 requirements 解析成结构化 skill 设计信息。
 *
 * 如果模型返回无法解析的 JSON，会保守回退到 description/requirements/name，
 * 让创建流程可以继续生成一个基本可用的 SKILL.md。
 */
export async function getSkillGuidance({
  name,
  description,
  requirements,
  model
}: GenerateSkillParam): Promise<{
  guidance: SkillGuidance;
  usage: SkillMdGenerationUsage;
}> {
  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: getSkillGuidanceSystemPrompt()
    },
    {
      role: 'user',
      content: getSkillGuidanceUserPrompt({
        name,
        description,
        requirements
      })
    }
  ];

  const { answerText, usage } = await createLLMResponse({
    body: {
      model,
      messages,
      max_tokens: 1000,
      stream: true
    }
  });

  try {
    const parsed = json5.parse(sliceJsonStr(answerText));
    return {
      guidance: {
        goal: parsed.goal || description || name,
        workflow: parsed.workflow || undefined,
        requirements: parsed.requirements || undefined,
        examples: parsed.examples || undefined
      },
      usage
    };
  } catch {
    return {
      guidance: {
        goal: description || requirements || name,
        requirements
      },
      usage
    };
  }
}

/**
 * 根据创建参数生成完整 SKILL.md。
 *
 * 流程包含两次非流式模型调用：先把 requirements 整理成结构化 guidance，
 * 再生成最终 SKILL.md；返回值会合并两次调用的 token 用量。
 */
export async function generateSkillMd(
  params: GenerateSkillParam
): Promise<[string, SkillMdGenerationUsage]> {
  const model = params.model;

  const { guidance, usage: guidanceUsage } = await getSkillGuidance({
    name: params.name,
    description: params.description,
    requirements: params.requirements,
    model
  });

  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: getSkillMdGeneratorSystemPrompt()
    },
    {
      role: 'user',
      content: getSkillMdGeneratorUserPrompt({
        goal: guidance.goal.trim(),
        workflow: guidance.workflow?.trim(),
        requirements: guidance.requirements?.trim(),
        examples: guidance.examples?.trim()
      })
    }
  ];

  const { answerText, usage: generateUsage } = await createLLMResponse({
    body: {
      model,
      messages,
      stream: true
    }
  });

  return [
    answerText,
    {
      inputTokens: guidanceUsage.inputTokens + generateUsage.inputTokens,
      outputTokens: guidanceUsage.outputTokens + generateUsage.outputTokens,
      usedUserOpenAIKey: guidanceUsage.usedUserOpenAIKey && generateUsage.usedUserOpenAIKey
    }
  ];
}
