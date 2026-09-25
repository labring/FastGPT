import { describe, expect, it } from 'vitest';
import {
  buildDefaultAgentSystemPrompt,
  resolveAgentLoopSystemPrompt
} from '@fastgpt/service/core/ai/llm/agentLoop/interface';

describe('buildDefaultAgentSystemPrompt', () => {
  it('uses the fixed prompt without capability-specific rules', () => {
    const prompt = buildDefaultAgentSystemPrompt();

    expect(prompt).toContain('你是一个 Work Agent');
    expect(prompt).toContain('不要调用不存在的工具');
    expect(prompt).not.toContain('set_plan');
    expect(prompt).not.toContain('update_plan');
    expect(prompt).not.toContain('ask_user');
    expect(prompt).not.toContain('可用工具');
  });

  it('injects the user-configured system prompt as a separate section', () => {
    const prompt = buildDefaultAgentSystemPrompt({
      userSystemPrompt: '优先使用 generate_config 完成配置生成。'
    });

    expect(prompt).toContain(
      '<user_system_prompt>\n优先使用 generate_config 完成配置生成。\n</user_system_prompt>'
    );
  });

  it('keeps platform extensions outside the user system prompt section', () => {
    const prompt = buildDefaultAgentSystemPrompt({
      systemPromptExtension: '平台辅助生成规则',
      userSystemPrompt: '用户配置规则'
    });
    const userPromptContent = prompt.match(
      /<user_system_prompt>\n([\s\S]*?)\n<\/user_system_prompt>/
    )?.[1];

    expect(prompt).toContain('平台辅助生成规则');
    expect(userPromptContent).toBe('用户配置规则');
  });

  it('ignores an empty caller system prompt', () => {
    expect(buildDefaultAgentSystemPrompt({ userSystemPrompt: '  ' })).not.toContain(
      '<user_system_prompt>'
    );
  });

  it('injects sandbox capability as a default prompt section without mixing it into user prompt', () => {
    const userSystemPrompt = '只处理用户配置的要求。';
    const prompt = buildDefaultAgentSystemPrompt({
      userSystemPrompt,
      sandboxEnabled: true
    });
    const userPromptSection = `<user_system_prompt>\n${userSystemPrompt}\n</user_system_prompt>`;
    const userPromptContent = prompt.match(
      /<user_system_prompt>\n([\s\S]*?)\n<\/user_system_prompt>/
    )?.[1];

    expect(prompt).toContain('<sandbox_capability>');
    expect(prompt).toContain('</sandbox_capability>');
    expect(prompt.indexOf('<sandbox_capability>')).toBeLessThan(prompt.indexOf(userPromptSection));
    expect(userPromptContent).toBe(userSystemPrompt);
  });

  it('omits sandbox capability when disabled', () => {
    expect(buildDefaultAgentSystemPrompt({ sandboxEnabled: false })).not.toContain(
      '<sandbox_capability>'
    );
  });

  it('uses an injected prompt builder without applying the default Work Agent prompt', () => {
    const prompt = resolveAgentLoopSystemPrompt({
      systemPrompt: 'runtime context',
      hasExecutableTools: true,
      systemPromptBuilder: ({ systemPrompt, hasExecutableTools }) =>
        `Workflow Builder\n${systemPrompt}\ntools=${hasExecutableTools}`
    });

    expect(prompt).toBe('Workflow Builder\nruntime context\ntools=true');
    expect(prompt).not.toContain('你是一个 Work Agent');
  });

  it('preserves the caller prompt when no builder is injected', () => {
    expect(
      resolveAgentLoopSystemPrompt({
        systemPrompt: 'prepared prompt',
        hasExecutableTools: false
      })
    ).toBe('prepared prompt');
  });
});
