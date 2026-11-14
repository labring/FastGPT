import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EditForm from '@/pageComponents/app/detail/Edit/MCPTools/EditForm';
import type { McpToolConfigType } from '@fastgpt/global/core/app/tool/mcpTool/type';

const mocks = vi.hoisted(() => ({
  onParsed: undefined as undefined | ((tools: unknown[], params: [{ url: string }]) => void),
  onChange: undefined as undefined | ((event: { target: { value: string } }) => void)
}));

vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/pageComponents/app/detail/context', () => ({ AppContext: {} }));
vi.mock('use-context-selector', () => ({
  useContextSelector: () => ({ avatar: '' })
}));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: (_request: unknown, options: { onSuccess: typeof mocks.onParsed }) => {
    mocks.onParsed = options.onSuccess;
    return { runAsync: vi.fn(), loading: false };
  }
}));
vi.mock('@/web/core/app/api/mcpTools', () => ({ getMCPTools: vi.fn() }));
vi.mock('@/components/common/secret/HeaderAuthConfig', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Avatar', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyBox/FormLabel', () => ({
  default: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('@fastgpt/web/components/common/MyBox', () => ({
  default: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('@fastgpt/web/components/common/MyModal', () => ({
  default: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('@fastgpt/web/components/common/Icon/button', () => ({
  default: ({ onClick }: { onClick: React.MouseEventHandler }) =>
    React.createElement('button', { onClick }, 'details')
}));
vi.mock('@chakra-ui/react', () => {
  const childrenOnly = ({ children }: { children: React.ReactNode }) => children;
  return {
    Box: childrenOnly,
    Flex: childrenOnly,
    ModalBody: childrenOnly,
    ModalFooter: childrenOnly,
    FormControl: childrenOnly,
    FormErrorMessage: childrenOnly,
    Input: () => null,
    Button: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) =>
      React.createElement('button', { onClick }, children),
    Textarea: ({ onChange }: { onChange: typeof mocks.onChange }) => {
      mocks.onChange = onChange;
      return null;
    }
  };
});

describe('MCP per-tool request metadata configuration', () => {
  let root: Root;
  let container: HTMLDivElement;
  const setToolList = vi.fn();
  const setCurrentTool = vi.fn();
  const setToolSourceUrl = vi.fn();
  const requestMeta = { 'example/context': { locale: 'zh-CN' } };
  const tool = { name: 'search', description: 'Search', requestMeta };
  const render = async (
    url = 'https://example.com/mcp',
    tools: McpToolConfigType[] = [tool],
    toolSourceUrl = 'https://example.com/mcp'
  ) => {
    await act(async () => {
      root.render(
        React.createElement(EditForm, {
          url,
          setUrl: vi.fn(),
          toolSourceUrl,
          setToolSourceUrl,
          toolList: tools,
          setToolList,
          currentTool: tools[0],
          setCurrentTool,
          headerSecret: {},
          setHeaderSecret: vi.fn()
        })
      );
    });
  };
  const click = async (text: string) => {
    const button = [...container.querySelectorAll('button')].find(
      (item) => item.textContent === text
    );
    expect(button).toBeDefined();
    await act(async () => button!.click());
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await render();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    window.close();
    vi.unstubAllGlobals();
  });

  it('rejects invalid JSON and non-object values, then saves valid metadata', async () => {
    await click('details');
    for (const value of ['{', '[]', 'null', '1']) {
      await act(async () => mocks.onChange!({ target: { value } }));
      await click('common:Confirm');
      expect(setToolList).not.toHaveBeenCalled();
    }
    const updated = { 'example/context': { locale: 'en', enabled: false } };
    await act(async () => mocks.onChange!({ target: { value: JSON.stringify(updated) } }));
    await click('common:Confirm');
    expect(setToolList).toHaveBeenCalledWith([{ ...tool, requestMeta: updated }]);
    expect(setCurrentTool).toHaveBeenCalledWith({ ...tool, requestMeta: updated });
  });

  it('clears metadata when the input is empty', async () => {
    await click('details');
    await act(async () => mocks.onChange!({ target: { value: ' ' } }));
    await click('common:Confirm');
    expect(setToolList).toHaveBeenCalledWith([{ ...tool, requestMeta: undefined }]);
  });

  it('preserves locally configured metadata by tool name when parsing remote tools again', async () => {
    const freshTool = { name: 'search', description: 'New description' };
    const otherTool = { name: 'other', description: 'Other' };
    await act(async () =>
      mocks.onParsed!([freshTool, otherTool], [{ url: 'https://example.com/mcp' }])
    );
    expect(setToolList).toHaveBeenCalledWith([{ ...freshTool, requestMeta }, otherTool]);
    expect(setCurrentTool).toHaveBeenCalledWith({ ...freshTool, requestMeta });
  });

  it('drops stale responses and does not reuse metadata for a different server', async () => {
    const freshTool = { name: 'search', description: 'Other server' };
    await render('https://other.example.com/mcp');
    await act(async () => mocks.onParsed!([freshTool], [{ url: 'https://example.com/mcp' }]));
    expect(setToolList).not.toHaveBeenCalled();
    await act(async () => mocks.onParsed!([freshTool], [{ url: 'https://other.example.com/mcp' }]));
    expect(setToolList).toHaveBeenCalledWith([freshTool]);
    expect(setCurrentTool).toHaveBeenCalledWith(freshTool);
  });

  it('invalidates an open details dialog when refreshed definitions arrive', async () => {
    await click('details');
    const freshTool = {
      name: 'search',
      description: 'Fresh definition',
      inputSchema: {
        type: 'object' as const,
        properties: { newParam: { type: 'string' as const } }
      }
    };
    await act(async () => mocks.onParsed!([freshTool], [{ url: 'https://example.com/mcp' }]));
    const parsedTools = setToolList.mock.calls.at(-1)![0];
    await render('https://example.com/mcp', parsedTools);
    expect(container.textContent).not.toContain('common:Confirm');
    expect(parsedTools[0]).toEqual({ ...freshTool, requestMeta });
    await click('details');
    await act(async () => mocks.onChange!({ target: { value: '{}' } }));
    await click('common:Confirm');
    expect(setToolList).toHaveBeenLastCalledWith([{ ...freshTool, requestMeta: {} }]);
  });

  it('merges only metadata into the current definition if the parent updates the tool list', async () => {
    await click('details');
    const freshTool = {
      name: 'search',
      description: 'Latest parent definition',
      inputSchema: {
        type: 'object' as const,
        properties: { newParam: { type: 'string' as const } }
      }
    };
    await render('https://example.com/mcp', [freshTool]);
    await act(async () => mocks.onChange!({ target: { value: '{}' } }));
    await click('common:Confirm');
    expect(setToolList).toHaveBeenLastCalledWith([{ ...freshTool, requestMeta: {} }]);
    expect(setCurrentTool).toHaveBeenLastCalledWith({ ...freshTool, requestMeta: {} });
  });

  it('does not let a dialog opened on the old list restore metadata after a server switch', async () => {
    await render('https://other.example.com/mcp');
    await click('details');
    expect(container.textContent).not.toContain('common:Confirm');
    const freshTool = { name: 'search', description: 'Other server definition' };
    await act(async () => mocks.onParsed!([freshTool], [{ url: 'https://other.example.com/mcp' }]));
    const parsedTools = setToolList.mock.calls.at(-1)![0];
    await render('https://other.example.com/mcp', parsedTools, 'https://other.example.com/mcp');
    expect(container.textContent).not.toContain('common:Confirm');
    expect(parsedTools).toEqual([freshTool]);
    await click('details');
    await click('common:Confirm');
    expect(setToolList).toHaveBeenLastCalledWith([{ ...freshTool, requestMeta: undefined }]);
  });

  it('hides an existing dialog immediately when the service URL changes', async () => {
    await click('details');
    expect(container.textContent).toContain('common:Confirm');
    await render('https://other.example.com/mcp');
    expect(container.textContent).not.toContain('common:Confirm');
    expect(setToolList).not.toHaveBeenCalled();
  });
});
