import { JSDOM } from 'jsdom';
import React, { act, type MouseEventHandler, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { str2OpenApiSchema } from '@fastgpt/global/core/app/jsonschema';
import type { McpToolSetRuntimeConfigType } from '@fastgpt/global/core/workflow/type/node';
import type { StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import NodeToolSet from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodeToolSet';

const mocks = vi.hoisted(() => ({
  onChangeNode: vi.fn(),
  toast: vi.fn(),
  getApiSchemaByUrl: vi.fn(),
  getMCPTools: vi.fn(),
  requestArgs: [] as unknown[][],
  requestErrors: [] as unknown[],
  appDetail: { _id: 'app-http', name: 'HTTP app', nodes: [] },
  reloadApp: vi.fn()
}));

const httpApiSchema = {
  openapi: '3.0.0',
  info: { title: 'Example API', version: '1.0.0' },
  servers: [{ url: 'https://api.example.com' }],
  paths: {
    '/search': {
      get: {
        operationId: 'search',
        parameters: [{ in: 'query', name: 'query', schema: { type: 'string' } }],
        responses: { '200': { description: 'OK' } }
      }
    },
    '/items': {
      post: {
        operationId: 'createItem',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { name: { type: 'string' } },
                required: ['name']
              }
            }
          }
        },
        responses: { '201': { description: 'Created' } }
      }
    }
  }
};
const httpApiSchemaStr = JSON.stringify(httpApiSchema, null, 2);

vi.mock('@chakra-ui/react', async () => {
  const react = await import('react');
  const wrapper = ({
    children,
    onClick,
    ...props
  }: { children?: ReactNode; onClick?: MouseEventHandler<HTMLDivElement> } & Record<string, any>) =>
    react.createElement(
      'div',
      {
        onClick,
        ...Object.fromEntries(Object.entries(props).filter(([key]) => key.startsWith('data-')))
      },
      children
    );
  const input = react.forwardRef<HTMLInputElement, any>(
    ({ name, value, defaultValue, placeholder, type, onChange, onBlur }, ref) =>
      react.createElement('input', {
        name,
        value,
        defaultValue,
        placeholder,
        type,
        onChange,
        onBlur,
        ref
      })
  );
  const textarea = react.forwardRef<HTMLTextAreaElement, any>(
    ({ name, value, defaultValue, onChange, onBlur }, ref) =>
      react.createElement('textarea', { name, value, defaultValue, onChange, onBlur, ref })
  );

  return {
    Button: ({
      children,
      onClick,
      isDisabled,
      type,
      leftIcon
    }: {
      children?: ReactNode;
      onClick?: MouseEventHandler<HTMLButtonElement>;
      isDisabled?: boolean;
      type?: string;
      leftIcon?: ReactNode;
    }) =>
      react.createElement(
        'button',
        { onClick, disabled: isDisabled, type: type || 'button' },
        leftIcon && react.createElement('span', { 'data-button-icon': true }),
        children
      ),
    Box: wrapper,
    Center: wrapper,
    Flex: wrapper,
    Input: input,
    ModalBody: wrapper,
    ModalFooter: wrapper,
    Switch: ({ isChecked, onChange }: any) =>
      react.createElement('input', { type: 'checkbox', checked: isChecked, onChange }),
    Table: wrapper,
    Tbody: wrapper,
    Td: wrapper,
    Textarea: textarea,
    Th: wrapper,
    Thead: wrapper,
    Tr: wrapper,
    useDisclosure: () => ({ onOpen: () => {}, isOpen: false, onClose: () => {} })
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
        appDetail: mocks.appDetail,
        reloadApp: mocks.reloadApp
      })
  };
});
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: (request: (...args: any[]) => unknown, options: any = {}) => ({
    loading: false,
    runAsync: async (...args: any[]) => {
      mocks.requestArgs.push(args);
      try {
        const result = await request(...args);
        await options.onSuccess?.(result, args);
        return result;
      } catch (error) {
        mocks.requestErrors.push(error);
        if (options.errorToast) mocks.toast({ status: 'error', title: options.errorToast });
        return undefined;
      }
    }
  })
}));
vi.mock('@/web/core/app/api/httpTools', () => ({
  getApiSchemaByUrl: mocks.getApiSchemaByUrl,
  putUpdateHttpTool: vi.fn()
}));
vi.mock('@/web/core/app/api/mcpTools', () => ({
  getMCPTools: mocks.getMCPTools
}));
vi.mock('@/components/common/secret/HeaderAuthConfig', async () => {
  const react = await import('react');
  return {
    default: ({
      onUpdate,
      buttonProps
    }: {
      onUpdate: (value: StoreSecretValueType) => void;
      buttonProps?: { size?: string; variant?: string };
    }) =>
      react.createElement(
        'button',
        {
          onClick: () => onUpdate({ Authorization: { value: 'Bearer test-token' } }),
          'data-size': buttonProps?.size,
          'data-variant': buttonProps?.variant
        },
        'common:auth_config'
      ),
    storeHeader2HeaderValue: (value: StoreSecretValueType) => value,
    headerValue2StoreHeader: (value: StoreSecretValueType) => value
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
  return {
    default: ({ text }: { text: string }) => react.createElement('span', null, text)
  };
});
vi.mock('@fastgpt/web/components/common/Icon/button', async () => {
  const react = await import('react');
  return {
    default: ({
      onClick,
      tip,
      icon
    }: {
      onClick?: MouseEventHandler<HTMLButtonElement>;
      tip: string;
      icon: string;
    }) => react.createElement('button', { onClick, 'data-tip': tip, 'data-icon': icon }, tip)
  };
});
vi.mock('@fastgpt/web/components/common/MyModal', async () => {
  const react = await import('react');
  return {
    default: ({
      children,
      footer,
      iconSrc,
      title
    }: {
      children?: ReactNode;
      footer?: ReactNode;
      iconSrc?: string;
      title?: string;
    }) => react.createElement('div', { 'data-modal-icon': iconSrc ?? '' }, title, children, footer)
  };
});
vi.mock('@fastgpt/web/components/v2/common/MyModal', async () => {
  const react = await import('react');
  return {
    default: ({ children, footer }: { children?: ReactNode; footer?: ReactNode }) =>
      react.createElement('div', null, children, footer)
  };
});
vi.mock('@fastgpt/web/components/common/FixedTable', async () => {
  const react = await import('react');
  return {
    FixedTableContainer: ({ children }: { children?: ReactNode }) =>
      react.createElement('div', null, children)
  };
});
vi.mock('@fastgpt/web/components/common/MyTooltip', async () => {
  const react = await import('react');
  return {
    default: ({ children }: { children?: ReactNode }) => react.createElement('div', null, children)
  };
});
vi.mock('@fastgpt/web/components/common/MyTooltip/QuestionTip', async () => {
  const react = await import('react');
  return { default: () => react.createElement('span') };
});
vi.mock('@fastgpt/web/components/common/Icon', async () => {
  const react = await import('react');
  return { default: () => react.createElement('span') };
});
vi.mock('@fastgpt/web/components/common/Input/HttpInput', async () => {
  const react = await import('react');
  return {
    default: ({ value, onBlur }: { value: string; onBlur?: (value: string) => void }) =>
      react.createElement('input', {
        value,
        onBlur: (event: any) => onBlur?.(event.target.value)
      })
  };
});
vi.mock('@/components/common/secret/HeaderAuthForm', async () => {
  const react = await import('react');
  return { default: () => react.createElement('div') };
});
vi.mock('@fastgpt/web/components/common/Avatar', async () => {
  const react = await import('react');
  return { default: () => react.createElement('div') };
});
vi.mock('@fastgpt/web/components/common/MyBox', async () => {
  const react = await import('react');
  return {
    default: ({ children }: { children?: ReactNode }) => react.createElement('div', null, children)
  };
});
vi.mock('@fastgpt/web/components/common/MyBox/FormLabel', async () => {
  const react = await import('react');
  return {
    default: ({ children }: { children?: ReactNode }) =>
      react.createElement('label', null, children)
  };
});
vi.mock('@/pageComponents/app/detail/Edit/HTTPTools/ManualToolModal', async () => {
  const react = await import('react');
  return { default: () => react.createElement('div') };
});

const toolSet: McpToolSetRuntimeConfigType = {
  url: 'https://mcp.example.com',
  headerSecret: {},
  toolList: [
    {
      name: 'search',
      description: 'Search',
      inputSchema: { type: 'object', properties: {} }
    }
  ]
};

const searchTool = {
  name: 'search',
  description: 'Search documents',
  path: '/search',
  method: 'get',
  inputSchema: {
    type: 'object',
    properties: { query: { type: 'string', isToolParam: true, 'x-tool-description': '' } },
    required: ['query']
  },
  requestSchema: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query']
  },
  headerSecret: { Authorization: { value: 'child-secret', secret: '' } }
};

const click = async (container: HTMLElement, label: string) => {
  const button = Array.from(container.querySelectorAll('button')).find(
    (item) => item.textContent === label
  );
  if (!button) throw new Error(`Missing button: ${label}`);
  await act(async () => {
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

const clickIcon = async (container: HTMLElement, tip: string, icon: string) => {
  const button = container.querySelector<HTMLButtonElement>(
    `button[data-tip="${tip}"][data-icon="${icon}"]`
  );
  if (!button) throw new Error(`Missing icon button: ${tip} (${icon})`);
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

describe('NodeToolSet MCP configuration', () => {
  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    mocks.onChangeNode.mockReset();
    mocks.toast.mockReset();
    mocks.getMCPTools.mockReset().mockResolvedValue([
      {
        name: 'new-tool',
        description: 'New MCP tool',
        inputSchema: { type: 'object', properties: {} }
      }
    ]);
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

  it('shows the empty MCP list state and parses URL, auth, and tools in one update', async () => {
    const data = {
      nodeId: 'node-1',
      toolConfig: { mcpToolSet: { ...toolSet, toolList: [] } }
    };
    await act(async () => {
      root.render(React.createElement(NodeToolSet, { data, selected: false } as any));
    });

    expect(container.querySelector('[data-empty-state]')).not.toBeNull();
    expect(mocks.onChangeNode).not.toHaveBeenCalled();
    expect(container.querySelector('button[data-variant="primary"]')).not.toBeNull();

    const urlInput = container.querySelector<HTMLInputElement>(
      'input[placeholder="app:MCP_tools_url_placeholder"]'
    );
    if (!urlInput) throw new Error('Missing MCP URL input');
    await setFieldValue(urlInput, 'https://new-mcp.example.com');
    await click(container, 'common:auth_config');
    await click(container, 'common:Parse');

    expect(mocks.getMCPTools).toHaveBeenCalledExactlyOnceWith({
      url: 'https://new-mcp.example.com',
      headerSecret: { Authorization: { value: 'Bearer test-token' } }
    });

    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.onChangeNode).toHaveBeenCalledExactlyOnceWith({
      nodeId: 'node-1',
      type: 'attr',
      key: 'toolConfig',
      value: {
        mcpToolSet: {
          url: 'https://new-mcp.example.com',
          headerSecret: { Authorization: { value: 'Bearer test-token' } },
          toolList: [
            {
              name: 'new-tool',
              description: 'New MCP tool',
              inputSchema: { type: 'object', properties: {} }
            }
          ]
        }
      }
    });
  });

  it('opens MCP tool details from the title and has no detail or delete actions', async () => {
    const data = {
      nodeId: 'node-1',
      toolConfig: { mcpToolSet: toolSet }
    };
    await act(async () => {
      root.render(React.createElement(NodeToolSet, { data, selected: false } as any));
    });

    expect(container.querySelector('button[data-icon="delete"]')).toBeNull();
    expect(container.querySelector('button[data-icon="common/detail"]')).toBeNull();
    const title = Array.from(container.querySelectorAll('div')).find(
      (item) => item.textContent === 'search' && item.children.length === 0
    ) as HTMLElement | undefined;
    if (!title) throw new Error('Missing MCP tool title');
    await act(async () => {
      title.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain('app:tool_detail');
    expect(container.querySelector('[data-modal-icon=""]')).not.toBeNull();
  });
});

describe('NodeToolSet HTTP configuration', () => {
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
    mocks.getApiSchemaByUrl.mockReset().mockResolvedValue(httpApiSchema);
    mocks.requestArgs.length = 0;
    mocks.requestErrors.length = 0;
    mocks.reloadApp.mockReset();
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

  const renderHttpNode = async (httpToolSet: any) => {
    await act(async () => {
      root.render(
        React.createElement(NodeToolSet, {
          data: { nodeId: 'node-http', toolConfig: { httpToolSet } },
          selected: false
        } as any)
      );
    });
  };

  const openConfig = async () => {
    await click(container, 'app:toolset_config');
  };

  const getSavedHttpToolSet = () => mocks.onChangeNode.mock.calls[0]?.[0]?.value?.httpToolSet;
  const getOperations = (toolList: any[]) =>
    toolList.map((tool) => `${tool.method.toUpperCase()} ${tool.path}`).sort();

  it('imports edited OpenAPI into an empty node and saves parsed operations', async () => {
    await renderHttpNode({ toolList: [] });

    expect(
      Array.from(container.querySelectorAll('button'))
        .find((button) => button.textContent === 'app:toolset_config')
        ?.querySelector('[data-button-icon]')
    ).not.toBeNull();
    await openConfig();
    const schemaInput = container.querySelector('textarea');
    if (!schemaInput) throw new Error('Missing OpenAPI editor');
    await setFieldValue(schemaInput, httpApiSchemaStr);
    expect(schemaInput.value).toBe(httpApiSchemaStr);
    await click(container, 'common:Save');

    expect(mocks.onChangeNode).toHaveBeenCalledTimes(1);
    expect(getSavedHttpToolSet().apiSchemaStr).toBe(httpApiSchemaStr);
    expect(getOperations(getSavedHttpToolSet().toolList)).toEqual(['GET /search', 'POST /items']);
    expect(getSavedHttpToolSet().toolList.every((tool: any) => !tool.headerSecret)).toBe(true);
  });

  it('keeps a deleted operation when saving unchanged OpenAPI config', async () => {
    await expect(str2OpenApiSchema(httpApiSchemaStr)).resolves.toBeTruthy();
    const httpToolSet = {
      baseUrl: 'https://api.example.com',
      apiSchemaStr: httpApiSchemaStr,
      customHeaders: '{}',
      headerSecret: {},
      toolList: [searchTool]
    };
    await renderHttpNode(httpToolSet);

    await openConfig();
    expect(container.querySelector('textarea')?.value).toBe(httpApiSchemaStr);
    await click(container, 'common:Save');

    expect(mocks.requestArgs[0]?.[0]).toMatchObject({ apiSchemaStr: httpApiSchemaStr });
    expect(mocks.requestErrors).toEqual([]);
    expect(mocks.onChangeNode).toHaveBeenCalledTimes(1);
    expect(getSavedHttpToolSet().toolList).toEqual([{ ...searchTool, headerSecret: undefined }]);
  });

  it('reimports the full operation list after URL import, even when schema text is unchanged', async () => {
    const httpToolSet = {
      baseUrl: 'https://api.example.com',
      apiSchemaStr: httpApiSchemaStr,
      customHeaders: '{}',
      headerSecret: {},
      toolList: [searchTool]
    };
    await renderHttpNode(httpToolSet);

    await openConfig();
    const schemaUrl = Array.from(container.querySelectorAll('input')).find(
      (input) => input.placeholder === 'common:plugin.Import from URL'
    );
    if (!schemaUrl) throw new Error('Missing OpenAPI URL input');
    await setFieldValue(schemaUrl, 'https://example.com/openapi.json');
    await act(async () => {
      schemaUrl.dispatchEvent(new dom.window.FocusEvent('focusout', { bubbles: true }));
    });
    await click(container, 'common:Import');
    await click(container, 'common:Save');

    expect(mocks.getApiSchemaByUrl).toHaveBeenCalledExactlyOnceWith(
      'https://example.com/openapi.json'
    );
    expect(getOperations(getSavedHttpToolSet().toolList)).toEqual(['GET /search', 'POST /items']);
  });

  it('syncs toolList when OpenAPI text changes and blocks invalid changes', async () => {
    const httpToolSet = {
      baseUrl: 'https://api.example.com',
      apiSchemaStr: httpApiSchemaStr,
      customHeaders: '{}',
      headerSecret: {},
      toolList: [searchTool]
    };
    const changedSchema = {
      ...httpApiSchema,
      paths: {
        ...httpApiSchema.paths,
        '/lookup': {
          get: {
            operationId: 'lookup',
            responses: { '200': { description: 'OK' } }
          }
        }
      }
    };
    await renderHttpNode(httpToolSet);

    await openConfig();
    const schemaInput = container.querySelector('textarea');
    if (!schemaInput) throw new Error('Missing OpenAPI editor');
    await setFieldValue(schemaInput, JSON.stringify(changedSchema, null, 2));
    await click(container, 'common:Save');

    expect(getOperations(getSavedHttpToolSet().toolList)).toEqual([
      'GET /lookup',
      'GET /search',
      'POST /items'
    ]);

    mocks.onChangeNode.mockReset();
    await renderHttpNode(httpToolSet);
    await openConfig();
    const invalidSchemaInput = container.querySelector('textarea');
    if (!invalidSchemaInput) throw new Error('Missing OpenAPI editor');
    await setFieldValue(invalidSchemaInput, '{invalid');
    await click(container, 'common:Save');

    expect(mocks.onChangeNode).not.toHaveBeenCalled();
    expect(mocks.requestErrors).toHaveLength(1);
  });

  it('uses all HTTP params by default without header or switches in a custom toolset', async () => {
    const httpToolSet = {
      baseUrl: 'https://api.example.com',
      apiSchemaStr: httpApiSchemaStr,
      customHeaders: '{}',
      headerSecret: {},
      toolList: [searchTool]
    };
    await renderHttpNode(httpToolSet);

    const title = Array.from(container.querySelectorAll('div')).find(
      (item) => item.textContent === 'search' && item.children.length === 0
    ) as HTMLElement | undefined;
    if (!title) throw new Error('Missing HTTP tool title');
    await act(async () => {
      title.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(container.querySelector('[data-modal-icon=""]')).not.toBeNull();
    expect(container.textContent).not.toContain('workflow:field_used_as_tool_input');
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    await click(container, 'common:Confirm');

    expect(mocks.onChangeNode).toHaveBeenCalledExactlyOnceWith({
      nodeId: 'node-http',
      type: 'attr',
      key: 'toolConfig',
      value: {
        httpToolSet: {
          ...httpToolSet,
          toolList: [
            {
              ...searchTool,
              headerSecret: undefined,
              inputSchema: {
                ...searchTool.inputSchema,
                properties: {
                  query: { type: 'string', isToolParam: true, 'x-tool-description': 'query' }
                }
              }
            }
          ]
        }
      }
    });
  });

  it('shows only the description action for each local HTTP tool', async () => {
    const httpToolSet = {
      baseUrl: 'https://api.example.com',
      apiSchemaStr: httpApiSchemaStr,
      customHeaders: '{"X-Trace":"enabled"}',
      headerSecret: { Authorization: { value: '', secret: 'encrypted-token' } },
      toolList: [
        {
          name: 'search',
          description: 'Search',
          path: '/search',
          method: 'get',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'create',
          description: 'Create',
          path: '/items',
          method: 'post',
          inputSchema: { type: 'object', properties: {} }
        }
      ]
    };
    await renderHttpNode(httpToolSet);

    expect(container.querySelector('button[data-icon="delete"]')).toBeNull();
    expect(container.querySelector('button[data-icon="common/detail"]')).toBeNull();
    expect(container.querySelectorAll('button[data-icon="edit"]')).toHaveLength(2);
  });
});
