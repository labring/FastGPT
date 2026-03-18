/**
 * SKILL.md Builder
 *
 * This module provides utilities for building and manipulating SKILL.md files
 * following the Agent Skills specification.
 */

import { createLLMResponse } from '../ai/llm/request';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';
import { sliceJsonStr } from '@fastgpt/global/common/string/tools';
import json5 from 'json5';

export type BuildSkillMdParams = {
  name: string;
  description: string;
};

// Params for AI-assisted SKILL.md generation
export type GenerateSkillParam = {
  name: string;
  description: string;
  requirements: string;
  model: string;
};

/**
 * Generate system prompt for SKILL.md generation
 * Instructs the LLM to create a complete SKILL.md file following the Agent Skills specification
 */
const getSkillMdGeneratorSystemPrompt = () => {
  return `# Role
Agent Skill Designer

## Skills
- Deep understanding of Agent Skills specification and SKILL.md format
- Expertise in designing clear, actionable skill definitions
- Ability to create well-structured YAML frontmatter with appropriate metadata
- Proficiency in writing comprehensive skill documentation with examples
- Strong capability in analyzing requirements and translating them into skill specifications

## Goals
- Generate a complete, valid SKILL.md file that follows the Agent Skills specification
- Create a skill definition that accurately captures the user's requirements
- Ensure the skill is practical, well-documented, and ready for deployment
- Provide clear instructions and examples for skill usage

## Constraints
- Output must be a complete SKILL.md file with valid YAML frontmatter
- Frontmatter must include 'name' (kebab-case, 1-64 chars, lowercase/numbers/hyphens only) and 'description' fields
- The 'name' field must not start or end with hyphens, and must not contain consecutive hyphens
- The 'description' field should be concise (1-200 chars) and describe when/why the skill is triggered
- Body content must include Overview, Instructions, and Examples sections
- All content must be practical and directly usable
- Do not include any explanatory text outside the SKILL.md file
- Do not wrap the output in code blocks or markdown formatting

## Workflow
1. Analyze the user's goal, workflow, requirements, and examples
2. Design an appropriate skill name in kebab-case format
3. Create a concise, action-oriented description
4. Structure the skill documentation with clear sections
5. Generate the complete SKILL.md with frontmatter and body
6. Ensure all content is practical and implementation-ready

## Output Format
Output ONLY the complete SKILL.md file content, starting with the frontmatter (---) and including the full body. No additional text, explanations, or code block markers.`;
};

/**
 * Generate user prompt for SKILL.md generation
 * Assembles user input into a structured prompt for the LLM
 */
const getSkillMdGeneratorUserPrompt = (params: {
  goal: string;
  workflow?: string;
  requirements?: string;
  examples?: string;
}) => {
  const { goal, workflow, requirements, examples } = params;

  let prompt = `Please generate a complete SKILL.md file based on the following skill requirements:

## Skill Goal
${goal}`;

  if (workflow) {
    prompt += `

## Workflow/Process
${workflow}`;
  }

  if (requirements) {
    prompt += `

## Additional Requirements
${requirements}`;
  }

  if (examples) {
    prompt += `

## Usage Examples
${examples}`;
  }

  prompt += `

## Important Notes
- Generate the complete SKILL.md file with valid YAML frontmatter
- The 'name' field must be in kebab-case format (lowercase letters, numbers, and hyphens only)
- The 'name' must be 1-64 characters long
- The 'description' should be concise and action-oriented (1-200 characters)
- Include Overview, Instructions, and Examples sections in the body
- Output ONLY the SKILL.md content, no explanations or code blocks
- Ensure the skill is practical and ready for immediate use`;

  return prompt;
};

/**
 * System prompt for skill guidance extraction.
 * Instructs the LLM to parse free-form requirements text into structured fields.
 */
const getSkillGuidanceSystemPrompt = () =>
  `You are a skill design analyst. Your task is to analyze the user's skill requirements text and extract structured design information.

Output a JSON object with the following fields:
- "goal" (required, string): A concise statement of what the skill should accomplish
- "workflow" (optional, string): Step-by-step process or workflow, use numbered list format
- "requirements" (optional, string): Specific constraints, technical requirements, or rules
- "examples" (optional, string): Concrete usage examples or sample scenarios

Rules:
- Output ONLY valid JSON, no markdown code blocks, no explanations
- If the input already contains clear structured information, extract it faithfully
- If a field cannot be determined from the input, omit it
- Keep each field concise and focused`;

/**
 * User prompt for skill guidance extraction.
 */
const getSkillGuidanceUserPrompt = (name: string, description: string, requirements: string) => {
  let prompt = `Please analyze the following skill requirements and extract structured design information:

## Skill Name
${name}`;

  if (description) {
    prompt += `

## Skill Description
${description}`;
  }

  prompt += `

## Requirements Text
${requirements}`;

  return prompt;
};

/**
 * Parse free-form skill requirements into structured guidance using LLM.
 * Extracts goal, workflow, requirements, and examples from the user's input.
 */
export async function getSkillGuidance(
  name: string,
  description: string,
  requirements: string,
  model: string
): Promise<{
  guidance: { goal: string; workflow?: string; requirements?: string; examples?: string };
  usage: { inputTokens: number; outputTokens: number };
}> {
  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: getSkillGuidanceSystemPrompt()
    },
    {
      role: 'user',
      content: getSkillGuidanceUserPrompt(name, description, requirements)
    }
  ];

  const { answerText, usage } = await createLLMResponse({
    body: {
      model,
      messages,
      temperature: 0,
      max_tokens: 1000,
      stream: false
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
    // Fallback: treat the entire requirements text as the goal
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
 * Generate complete SKILL.md content using LLM guidance.
 * Makes two LLM calls: one to parse requirements, one to generate SKILL.md.
 * Returns merged token usage from both calls.
 */
export async function generateSkillMd(
  params: GenerateSkillParam
): Promise<[string, { inputTokens: number; outputTokens: number }]> {
  const model = params.model;

  // Step 1: Parse requirements into structured guidance
  const { guidance, usage: guidanceUsage } = await getSkillGuidance(
    params.name,
    params.description,
    params.requirements,
    model
  );

  // Build messages for LLM
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

  // Step 2: Call LLM to generate SKILL.md (non-streaming)
  const { answerText, usage: generateUsage } = await createLLMResponse({
    body: {
      model,
      messages,
      temperature: 0.1,
      max_tokens: 4000,
      stream: false
    }
  });

  // Merge token usage from both LLM calls
  const mergedUsage = {
    inputTokens: guidanceUsage.inputTokens + generateUsage.inputTokens,
    outputTokens: guidanceUsage.outputTokens + generateUsage.outputTokens
  };

  return [answerText, mergedUsage];
}

/**
 * Build a complete SKILL.md content with frontmatter only
 */
export function buildSkillMd(params: BuildSkillMdParams): string {
  return generateFrontmatter(params.name, params.description);
}

/**
 * Generate YAML frontmatter for SKILL.md
 */
export function generateFrontmatter(name: string, description: string): string {
  const escapedName = escapeYaml(name);
  const escapedDescription = escapeYaml(description);

  return `---\nname: ${escapedName}\ndescription: ${escapedDescription}\n---`;
}

/**
 * Parse frontmatter from SKILL.md content
 */
export function parseFrontmatter(content: string): {
  name: string;
  description: string;
  body: string;
} {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);

  if (!frontmatterMatch) {
    throw new Error('Invalid SKILL.md format: missing frontmatter');
  }

  const frontmatterText = frontmatterMatch[1];
  const body = frontmatterMatch[2];

  // Parse name
  const nameMatch = frontmatterText.match(/^name:\s*(.+)$/m);
  const name = nameMatch ? unescapeYaml(nameMatch[1].trim()) : '';

  // Parse description
  const descMatch = frontmatterText.match(/^description:\s*(.+)$/m);
  const description = descMatch ? unescapeYaml(descMatch[1].trim()) : '';

  return { name, description, body };
}

/**
 * Escape a string for use in YAML
 */
export function escapeYaml(value: string): string {
  if (value === '') {
    return '""';
  }

  // Check if value needs quoting
  const needsQuoting =
    /[:#{}\[\],&*?|<>!=~`@]/.test(value) ||
    /^[-?]/.test(value) ||
    value.includes('\n') ||
    value.includes('"') ||
    /^true$|^false$|^null$|^~$/i.test(value);

  if (!needsQuoting) {
    return value;
  }

  // Handle multi-line strings
  if (value.includes('\n')) {
    // Use literal block scalar for multi-line strings
    const lines = value.split('\n');
    return '|\n' + lines.map((line) => '  ' + line).join('\n');
  }

  // Escape double quotes
  const escaped = value.replace(/"/g, '\\"');
  return `"${escaped}"`;
}

/**
 * Unescape a YAML string value
 */
export function unescapeYaml(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\"/g, '"');
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/\\'/g, "'");
  }
  return value;
}

/**
 * Validate skill name according to Agent Skills spec
 */
export function validateSkillName(name: string): boolean {
  // Must be 1-64 characters
  if (name.length === 0 || name.length > 64) {
    return false;
  }

  // Must only contain lowercase letters, numbers, and hyphens
  if (!/^[a-z0-9-]+$/.test(name)) {
    return false;
  }

  // Must not start or end with hyphen
  if (name.startsWith('-') || name.endsWith('-')) {
    return false;
  }

  // Must not contain consecutive hyphens
  if (name.includes('--')) {
    return false;
  }

  return true;
}

/**
 * Sanitize a skill name for use as a file/directory name
 */
export function sanitizeSkillNameForFile(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/_/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}

/**
 * Extract skill name from SKILL.md content
 */
export function extractSkillNameFromSkillMd(content: string): string {
  try {
    const { name } = parseFrontmatter(content);
    return name;
  } catch {
    // Fallback: try to extract from first header
    const headerMatch = content.match(/^#\s+(.+)$/m);
    return headerMatch ? sanitizeSkillNameForFile(headerMatch[1]) : 'unnamed-skill';
  }
}

/**
 * Extract description from SKILL.md content
 */
export function extractDescriptionFromSkillMd(content: string): string {
  try {
    const { description } = parseFrontmatter(content);
    return description;
  } catch {
    return '';
  }
}
