import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentTypes } from '@fastgpt/global/core/workflow/constants';

const mocks = vi.hoisted(() => ({
  run: undefined as unknown as (data: Record<string, any>) => Promise<unknown>,
  fields: [] as { fieldName: string; required?: boolean }[],
  postHTTP: vi.fn(),
  postMCP: vi.fn()
}));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('use-context-selector', () => ({
  useContextSelector: (_context: unknown, select: (value: any) => unknown) =>
    select({ appDetail: { _id: 'app-id' } })
}));
vi.mock('@/pageComponents/app/detail/context', () => ({ AppContext: {} }));
vi.mock('@/pageComponents/app/detail/constants', () => ({ cardStyles: {} }));
vi.mock('@/web/core/chat/context/useChatStore', () => ({
  useChatStore: () => ({ chatId: 'debug' })
}));
vi.mock('@/web/core/chat/context/chatItemContext', () => ({
  default: ({ children }: any) => children
}));
vi.mock('@/web/core/chat/context/chatRecordContext', () => ({
  default: ({ children }: any) => children
}));
vi.mock('react-hook-form', () => ({
  useForm: () => ({ handleSubmit: (callback: unknown) => callback, reset: vi.fn() })
}));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: (callback: any) => {
    mocks.run = callback;
    return { runAsync: callback, loading: false };
  }
}));
vi.mock('@/web/core/app/api/httpTools', () => ({ postRunHTTPTool: mocks.postHTTP }));
vi.mock('@/web/core/app/api/mcpTools', () => ({ postRunMCPTool: mocks.postMCP }));
vi.mock('@/components/Markdown', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Tabs/LightRowTabs', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/EmptyTip', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyBox/FormLabel', () => ({
  default: ({ children }: any) => children
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/ValueTypeLabel', () => ({
  default: () => null
}));
vi.mock('@chakra-ui/react', async () => {
  const { createElement } = await import('react');
  const Element = ({ children }: any) => createElement('div', null, children);
  return { Box: Element, Flex: Element, Button: Element, Center: Element, HStack: Element };
});
vi.mock('@/components/core/app/formRender/LabelAndForm', async () => {
  const { createElement } = await import('react');
  return {
    default: (props: any) => {
      mocks.fields.push(props);
      return createElement('input', { name: props.fieldName, required: props.required });
    }
  };
});
import HTTPDebug from '@/pageComponents/app/detail/Edit/HTTPTools/ChatTest';
import MCPDebug from '@/pageComponents/app/detail/Edit/MCPTools/ChatTest';

describe('toolset debug page schema consumers', () => {
  beforeEach(() => {
    mocks.fields = [];
    vi.clearAllMocks();
  });
  const inputSchema = {
    type: 'object',
    properties: { query: { type: 'string' }, count: { type: 'number' } },
    required: ['query']
  };

  it('renders HTTP inputs and submits current draft path, headers and static body', async () => {
    const tool = {
      name: 'search',
      description: 'Search',
      path: '/draft',
      method: 'PUT',
      inputSchema,
      staticHeaders: [{ key: 'X-Draft', value: 'true' }],
      staticParams: [{ key: 'fixed', value: 'query' }],
      staticBody: { type: ContentTypes.json, content: '{"draft":true}' }
    };
    const html = renderToStaticMarkup(
      React.createElement(HTTPDebug, {
        currentTool: tool,
        baseUrl: 'https://example.com',
        headerSecret: { Authorization: { value: 'fake' } },
        customHeaders: { 'X-App': 'app' }
      })
    );
    expect(html).toContain('name="query"');
    expect(html).toContain('name="count"');
    expect(mocks.fields.find((field) => field.fieldName === 'query')?.required).toBe(true);
    await mocks.run({ query: 'debug' });
    expect(mocks.postHTTP).toHaveBeenCalledWith({
      baseUrl: 'https://example.com',
      toolPath: '/draft',
      method: 'PUT',
      params: { query: 'debug' },
      headerSecret: { Authorization: { value: 'fake' } },
      customHeaders: { 'X-App': 'app' },
      staticHeaders: tool.staticHeaders,
      staticParams: tool.staticParams,
      staticBody: tool.staticBody
    });
  });

  it('renders MCP inputs and converts numeric input before submitting current draft', async () => {
    const html = renderToStaticMarkup(
      React.createElement(MCPDebug, {
        currentTool: { name: 'search', description: 'Search', inputSchema },
        url: 'https://example.com/mcp',
        headerSecret: { Authorization: { value: 'fake' } }
      })
    );
    expect(html).toContain('name="query"');
    expect(html).toContain('name="count"');
    await mocks.run({ query: 'debug', count: '3' });
    expect(mocks.postMCP).toHaveBeenCalledWith({
      url: 'https://example.com/mcp',
      toolName: 'search',
      params: { query: 'debug', count: 3 },
      headerSecret: { Authorization: { value: 'fake' } }
    });
  });

  it.each(['mcp', 'http'])(
    'does not submit when the %s editor has no selected tool',
    async (source) => {
      renderToStaticMarkup(
        source === 'mcp'
          ? React.createElement(MCPDebug, { url: 'https://example.com/mcp', headerSecret: {} })
          : React.createElement(HTTPDebug, {
              baseUrl: 'https://example.com',
              headerSecret: {},
              customHeaders: {}
            })
      );
      await mocks.run({});
      expect(mocks.postHTTP).not.toHaveBeenCalled();
      expect(mocks.postMCP).not.toHaveBeenCalled();
    }
  );
});
