import { describe, expect, it } from 'vitest';
import { getMainAgentSystemPrompt } from '@fastgpt/service/core/ai/llm/agentLoop/domain/mainPrompt';

describe('getMainAgentSystemPrompt', () => {
  it('describes the flat set_plan and update_plan arguments', () => {
    const prompt = getMainAgentSystemPrompt({
      systemPrompt: 'Follow project conventions.',
      hasRuntimeTools: true
    });

    expect(prompt).toContain('<user_background>\nFollow project conventions.\n</user_background>');
    expect(prompt).toContain(
      'set_plan，参数格式为 {"name":"简短计划名","steps":["步骤一","步骤二"]}'
    );
    expect(prompt).toContain(
      'update_plan，参数格式为 {"updates":[{"id":"已有步骤 id","status":"done","note":"简短结果"}]}'
    );
    expect(prompt).toContain('update_plan，参数格式为 {"add_steps":["新增步骤"]}');
    expect(prompt).toContain('不要传 action 或 description');
    expect(prompt).toContain('不要把 updates 写成 steps');
    expect(prompt).toContain('set_plan 必须是第一个工具调用');
    expect(prompt).toContain('已有 active plan 时不要再次调用 set_plan');
  });

  it('adds the runtime tool constraint only when runtime tools are unavailable', () => {
    expect(getMainAgentSystemPrompt({ systemPrompt: undefined, hasRuntimeTools: false })).toContain(
      '<tool_constraint>'
    );
    expect(
      getMainAgentSystemPrompt({ systemPrompt: undefined, hasRuntimeTools: true })
    ).not.toContain('<tool_constraint>');
  });
});
