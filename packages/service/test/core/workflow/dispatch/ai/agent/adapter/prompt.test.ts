import { describe, expect, it } from 'vitest';
import {
  parseUserSystemPrompt,
  replaceToolReferenceWithName
} from '@fastgpt/service/core/workflow/dispatch/ai/agent/adapter/prompt';

const resolvePromptToolReferenceName = (id: string) => {
  const names: Record<string, string> = {
    dataset_search: '知识库检索',
    agent_sandbox: '虚拟机',
    custom_tool: '自定义工具',
    getTime: '获取当前时间',
    mcp_appsearchTool: 'MCP 搜索',
    http_appcreateOrder: 'HTTP 创建订单',
    personal_tool_app: '个人工具',
    personal_agent_app: '个人 Agent'
  };

  return names[id];
};

describe('workflow agent prompt adapter', () => {
  it('replaces skill references with readable tool names', () => {
    const result = replaceToolReferenceWithName({
      text: '优先使用 {{@dataset_search@}} 和 {{@agent_sandbox@}}。',
      resolvePromptToolReferenceName
    });

    expect(result).toBe('优先使用 {{知识库检索}} 和 {{虚拟机}}。');
  });

  it('keeps unknown skill references unchanged', () => {
    const result = replaceToolReferenceWithName({
      text: '未知工具 {{@missing_tool@}} 保持原样。',
      resolvePromptToolReferenceName
    });

    expect(result).toBe('未知工具 {{@missing_tool@}} 保持原样。');
  });

  it.each([
    {
      label: 'system tool',
      referenceId: 'systemTool-getTime',
      name: '获取当前时间'
    },
    {
      label: 'MCP child tool',
      referenceId: 'mcp-mcp_app/searchTool',
      name: 'MCP 搜索'
    },
    {
      label: 'HTTP child tool',
      referenceId: 'http-http_app/createOrder',
      name: 'HTTP 创建订单'
    },
    {
      label: 'personal tool',
      referenceId: 'personal-personal_tool_app',
      name: '个人工具'
    },
    {
      label: 'personal agent',
      referenceId: 'personal_agent_app',
      name: '个人 Agent'
    }
  ])('replaces $label references with readable tool names', ({ referenceId, name }) => {
    const result = replaceToolReferenceWithName({
      text: `优先使用 {{@${referenceId}@}} 完成任务。`,
      resolvePromptToolReferenceName
    });

    expect(result).toBe(`优先使用 {{${name}}} 完成任务。`);
  });

  it('formats user system prompt after replacing tool references', () => {
    const result = parseUserSystemPrompt({
      userSystemPrompt: '参考 {{@custom_tool@}} 完成任务。',
      resolvePromptToolReferenceName
    });

    expect(result).toContain('参考 {{自定义工具}} 完成任务。');
    expect(result).toContain('如果背景信息中包含工具引用');
  });
});
