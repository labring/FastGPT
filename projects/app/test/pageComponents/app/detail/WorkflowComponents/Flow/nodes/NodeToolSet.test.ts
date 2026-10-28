import { JSDOM } from 'jsdom';
import React, { act, type MouseEventHandler, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NodeToolSet from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodeToolSet';

const mocks = vi.hoisted(() => ({
  onChangeNode: vi.fn(),
  toast: vi.fn(),
  reloadApp: vi.fn(),
  getMCPTools: vi.fn(),
  getApiSchemaByUrl: vi.fn(),
  remoteMcpTools: [
    {
      name: 'search',
      description: 'Remote search',
      inputSchema: { type: 'object', properties: { query: { type: 'string' } } }
    },
    {
      name: 'new-tool',
      description: 'Remote tool',
      inputSchema: { type: 'object', properties: {} }
    }
  ],
  remoteHttpTools: [
    {
      name: 'listItems',
      description: 'List items',
      method: 'GET',
      path: '/items',
      inputSchema: { type: 'object', properties: {} }
    }
  ]
}));

vi.mock('@chakra-ui/react', async () => {
  const react = await import('react');
  const wrapper = ({
    children,
    onClick
  }: {
    children?: ReactNode;
    onClick?: MouseEventHandler<HTMLDivElement>;
  }) => react.createElement('div', { onClick }, children);
  const input = react.forwardRef<HTMLInputElement, any>(
    ({ value, placeholder, onChange, onBlur, name, 'aria-label': ariaLabel }, ref) =>
      react.createElement('input', {
        value,
        placeholder,
        onChange,
        onBlur,
        name,
        'aria-label': ariaLabel,
        ref
      })
  );
  const textarea = react.forwardRef<HTMLTextAreaElement, any>(
    ({ value, placeholder, rows, onChange, onKeyDown, isReadOnly }, ref) =>
      react.createElement('textarea', {
        value,
        placeholder,
        rows,
        onChange,
        onKeyDown,
        readOnly: isReadOnly,
        ref
      })
  );

  return {
    Box: wrapper,
    Flex: wrapper,
    ModalBody: wrapper,
    ModalFooter: wrapper,
    Table: wrapper,
    Tbody: wrapper,
    Td: wrapper,
    Th: wrapper,
    Thead: wrapper,
    Tr: wrapper,
    Button: ({
      children,
      onClick,
      isDisabled,
      type
    }: {
      children?: ReactNode;
      onClick?: MouseEventHandler<HTMLButtonElement>;
      isDisabled?: boolean;
      type?: string;
    }) =>
      react.createElement(
        'button',
        { onClick, disabled: isDisabled, type: type || 'button' },
        children
      ),
    Input: input,
    Textarea: textarea
  };
});

vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('use-context-selector', async (importOriginal) => {
  const actual = await importOriginal<typeof import('use-context-selector')>();
  return {
    ...actual,
    useContextSelector: (_context: unknown, selector: (value: unknown) => unknown) =>
      selector({
        onChangeNode: mocks.onChangeNode,
        appDetail: { _id: 'app-id', name: 'App', nodes: [] },
        reloadApp: mocks.reloadApp
      })
  };
});
vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: (request: (...args: any[]) => unknown, options: any = {}) => ({
    loading: false,
    runAsync: async (...args: any[]) => {
      try {
        const result = await request(...args);
        await options.onSuccess?.(result, args);
        return result;
      } catch (error) {
        if (options.errorToast) mocks.toast({ status: 'error', title: options.errorToast });
        return undefined;
      }
    }
  })
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/web/core/app/api/mcpTools', () => ({ getMCPTools: mocks.getMCPTools }));
vi.mock('@/web/core/app/api/httpTools', () => ({ getApiSchemaByUrl: mocks.getApiSchemaByUrl }));
vi.mock('@fastgpt/web/components/common/FixedTable', async () => {
  const react = await import('react');
  return {
    FixedTableContainer: ({ children }: { children?: ReactNode }) =>
      react.createElement('div', null, children)
  };
});
vi.mock('@fastgpt/web/components/common/Input/HttpInput', async () => {
  const react = await import('react');
  return {
    default: ({
      value,
      placeholder,
      onBlur
    }: {
      value?: string;
      placeholder?: string;
      onBlur?: (value: string) => void;
    }) =>
      react.createElement('input', {
        value,
        placeholder,
        onChange: () => {},
        onBlur: (event: React.FocusEvent<HTMLInputElement>) => onBlur?.(event.target.value)
      })
  };
});
vi.mock('@fastgpt/global/core/app/jsonschema', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/global/core/app/jsonschema')>();
  return { ...actual, str2OpenApiSchema: vi.fn(async () => ({ pathData: [] })) };
});
vi.mock('@fastgpt/global/core/app/tool/httpTool/utils', () => ({
  pathData2ToolList: vi.fn(async () => mocks.remoteHttpTools)
}));
vi.mock('@/components/common/secret/HeaderAuthConfig', async () => {
  const react = await import('react');
  return {
    default: ({ onUpdate }: { onUpdate: (value: unknown) => void }) =>
      react.createElement(
        'button',
        { onClick: () => onUpdate({ Bearer: { value: 'token' } }) },
        'common:auth_config'
      ),
    storeHeader2HeaderValue: (value: unknown) => value,
    headerValue2StoreHeader: (value: unknown) => value
  };
});
vi.mock('@/components/common/secret/HeaderAuthForm', async () => {
  const react = await import('react');
  return { default: () => react.createElement('div') };
});
vi.mock('@fastgpt/web/components/common/Icon', async () => {
  const react = await import('react');
  return { default: () => react.createElement('span') };
});
vi.mock('@fastgpt/web/components/common/Icon/button', async () => {
  const react = await import('react');
  return {
    default: ({ onClick, tip }: { onClick?: MouseEventHandler<HTMLButtonElement>; tip: string }) =>
      react.createElement('button', { onClick }, tip)
  };
});
vi.mock('@fastgpt/web/components/common/MyTooltip', async () => {
  const react = await import('react');
  return {
    default: ({ children }: { children?: ReactNode }) => react.createElement('div', null, children)
  };
});
vi.mock('@fastgpt/web/components/common/MyModal', async () => {
  const react = await import('react');
  return {
    default: ({
      title,
      children,
      footer
    }: {
      title?: string;
      children?: ReactNode;
      footer?: ReactNode;
    }) => react.createElement('div', null, title, children, footer)
  };
});
vi.mock('@fastgpt/web/components/v2/common/MyModal', async () => {
  const react = await import('react');
  return {
    default: ({
      title,
      children,
      footer
    }: {
      title?: string;
      children?: ReactNode;
      footer?: ReactNode;
    }) => react.createElement('div', null, title, children, footer)
  };
});
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/NodeCard', async () => {
  const react = await import('react');
  return {
    default: ({ children }: { children?: ReactNode }) => react.createElement('div', null, children)
  };
});
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/components/Container', async () => {
  const react = await import('react');
  return {
    default: ({ children }: { children?: ReactNode }) => react.createElement('div', null, children)
  };
});
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow/components/IOTitle', async () => {
  const react = await import('react');
  return { default: ({ text }: { text: string }) => react.createElement('span', null, text) };
});

describe('NodeToolSet', () => {
  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('location', dom.window.location);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    mocks.onChangeNode.mockReset();
    mocks.toast.mockReset();
    mocks.reloadApp.mockReset();
    mocks.getMCPTools.mockReset().mockResolvedValue(mocks.remoteMcpTools);
    mocks.getApiSchemaByUrl.mockReset().mockResolvedValue({ openapi: '3.0.0' });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    dom.window.close();
    vi.unstubAllGlobals();
  });

  const renderNode = async (data: Record<string, unknown>) => {
    await act(async () => {
      root.render(React.createElement(NodeToolSet, { data, selected: false } as any));
    });
  };
  const click = async (label: string) => {
    const button = Array.from(container.querySelectorAll('button')).find(
      (item) => item.textContent === label
    );
    if (!button) throw new Error(`Missing button: ${label}`);
    await act(async () => {
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };
  const setFieldValue = async (field: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    await act(async () => {
      field.value = value;
      Simulate.change(field);
    });
  };

  it('refreshes MCP tools from the URL and stores summaries with local descriptions', async () => {
    await renderNode({
      nodeId: 'node-mcp',
      toolConfig: {
        mcpToolSet: {
          url: 'https://old.example/mcp',
          headerSecret: {},
          toolList: [{ name: 'search', description: 'Local wording' }]
        }
      }
    });

    const urlInput = container.querySelector('input');
    if (!urlInput) throw new Error('Missing MCP URL input');
    await setFieldValue(urlInput, 'https://tools.example/mcp');
    await click('common:Parse');

    expect(mocks.getMCPTools).toHaveBeenCalledWith({
      url: 'https://tools.example/mcp',
      headerSecret: {}
    });
    const savedToolSet = mocks.onChangeNode.mock.calls.at(-1)?.[0]?.value?.mcpToolSet;
    expect(savedToolSet).toEqual({
      url: 'https://tools.example/mcp',
      headerSecret: {},
      toolList: [
        { name: 'search', description: 'Local wording' },
        { name: 'new-tool', description: 'Remote tool' }
      ]
    });
    expect(container.textContent).toContain('common:auth_config');
  });

  it('keeps referenced App tools on the description-only edit path', async () => {
    await renderNode({
      nodeId: 'node-reference',
      pluginId: 'app-toolset',
      toolConfig: {
        mcpToolSet: {
          toolId: 'app-toolset',
          toolList: [{ name: 'search', description: 'Search documents' }]
        }
      }
    });

    expect(container.querySelector('input')).toBeNull();
    await click('common:Edit');
    expect(container.textContent).toContain('app:Edit_tool_description');
    expect(container.textContent).not.toContain('app:tool_detail');
  });

  it('refreshes HTTP summaries from apiSchemaUrl and saves no schema body', async () => {
    await renderNode({ nodeId: 'node-http', toolConfig: { httpToolSet: { toolList: [] } } });

    expect(container.textContent).toContain('app:tool_not_configured');
    await click('app:click_to_config');
    const inputs = container.querySelectorAll('input');
    const schemaUrlInput = Array.from(inputs).find(
      (input) => input.placeholder === 'common:plugin.Import from URL'
    );
    if (!schemaUrlInput) throw new Error('Missing HTTP schema URL input');
    expect(container.querySelector('textarea')).toBeNull();
    await setFieldValue(schemaUrlInput, 'https://api.example/openapi.json');
    await click('common:Parse');
    expect(mocks.getApiSchemaByUrl).toHaveBeenCalledWith('https://api.example/openapi.json');
    const schemaDisplay = container.querySelector('textarea');
    expect(schemaDisplay?.readOnly).toBe(true);
    expect(schemaDisplay?.value).toContain('"openapi": "3.0.0"');
    await click('common:Save');

    const savedToolSet = mocks.onChangeNode.mock.calls.at(-1)?.[0]?.value?.httpToolSet;
    expect(savedToolSet).toEqual({
      apiSchemaUrl: 'https://api.example/openapi.json',
      customHeaders: '{}',
      headerSecret: {},
      toolList: [{ name: 'listItems', description: 'List items' }]
    });
    expect(JSON.stringify(savedToolSet)).not.toContain('inputSchema');
    expect(savedToolSet).not.toHaveProperty('baseUrl');
    expect(savedToolSet).not.toHaveProperty('apiSchemaStr');
  });

  it('saves an editable base URL override for an independent HTTP toolset', async () => {
    await renderNode({
      nodeId: 'node-http',
      toolConfig: {
        httpToolSet: {
          apiSchemaUrl: 'https://api.example/openapi.json',
          customHeaders: '{}',
          headerSecret: {},
          toolList: []
        }
      }
    });

    await click('app:click_to_config');
    const baseUrlInput = Array.from(container.querySelectorAll('input')).find(
      (input) => input.getAttribute('aria-label') === 'common:support.openapi.Api baseurl'
    );
    if (!baseUrlInput) throw new Error('Missing HTTP base URL input');
    await setFieldValue(baseUrlInput, 'https://gateway.example/v2');
    await click('common:Save');

    const savedToolSet = mocks.onChangeNode.mock.calls.at(-1)?.[0]?.value?.httpToolSet;
    expect(savedToolSet).toMatchObject({ baseUrl: 'https://gateway.example/v2' });
  });

  it('keeps local HTTP tool descriptions when refreshing remote summaries', async () => {
    await renderNode({
      nodeId: 'node-http',
      toolConfig: {
        httpToolSet: {
          apiSchemaUrl: 'https://api.example/openapi.json',
          customHeaders: '{}',
          headerSecret: {},
          toolList: [{ name: 'listItems', description: 'Local wording' }]
        }
      }
    });

    await click('app:toolset_config');
    await click('common:Parse');
    await click('common:Save');

    const savedToolSet = mocks.onChangeNode.mock.calls.at(-1)?.[0]?.value?.httpToolSet;
    expect(savedToolSet?.toolList).toEqual([{ name: 'listItems', description: 'Local wording' }]);
  });
});
