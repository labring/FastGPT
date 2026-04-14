// src/skills/atomic/llm_call.ts
// LLM Call Skill

import type { SkillInput, SkillOutput } from '../base';
import { BaseSkill } from '../base';
import type { LLMMessage, LLMCallOptions } from '../../types/message';

/**
 * LLM Call 选项
 */
export interface LLMCallOptionsInput {
  messages: LLMMessage[];
  options?: LLMCallOptions;
  stream?: boolean;
}

/**
 * LLM Call Skill
 */
export class LLMCallSkill extends BaseSkill {
  name = 'llm_call';
  description = 'Call LLM with messages';

  async execute(input: SkillInput): Promise<SkillOutput> {
    const { messages, options = {}, stream = false } = input as unknown as LLMCallOptionsInput;

    if (!this.llm) {
      return this.fail('LLMProvider not initialized');
    }

    try {
      if (stream) {
        // 流式调用
        const asyncStream = await this.llm.chatStream(messages, options);
        const chunks: string[] = [];

        for await (const chunk of asyncStream) {
          chunks.push(chunk.content);
        }

        return this.success({
          content: chunks.join('')
        });
      } else {
        // 同步调用
        const response = await this.llm.chat(messages, options);
        return this.success({
          content: response.content,
          reasoning: response.reasoning,
          toolCalls: response.toolCalls
        });
      }
    } catch (error) {
      return this.fail(`LLM call failed: ${error}`);
    }
  }
}
