import { JSDOM } from 'jsdom';
import React, { act, type MouseEventHandler, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import NodeToolSet from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodeToolSet';

const mocks = vi.hoisted(() => ({
  onChangeNode: vi.fn(),
  toast: vi.fn(),
  getApiSchemaByUrl: vi.fn(),
  requestArgs: [] as unknown[][],
  appDetail: { _id: 'app-http', name: 'HTTP app', nodes: [] }
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
        ref,
        readOnly: !onChange
      })
  );
  const textarea = react.forwardRef<HTMLTextAreaElement, any>(
    ({ name, value, defaultValue, onChange, onBlur }, ref) =>
      react.createElement('textarea', {
        name,
        value,
        defaultValue,
        onChange,
        onBlur,
        ref,
        readOnly: !onChange
      })
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
        reloadApp: vi.fn()
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

const setFieldValue = async (field: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  await act(async () => {
    field.value = value;
    Simulate.change(field);
  });
};

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

  const getSavedHttpToolSet = () => mocks.onChangeNode.mock.calls[0]?.[0]?.value?.httpToolSet;
  const getOperations = (toolList: any[]) =>
    toolList.map((tool) => `${tool.method.toUpperCase()} ${tool.path}`).sort();

  it('imports edited OpenAPI into an empty node and saves parsed operations', async () => {
    await renderHttpNode({ toolList: [] });

    expect(container.textContent).toContain('app:tool_not_configured');
    expect(container.textContent).not.toContain('app:toolset_config');
    await click(container, 'app:click_to_config');
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
});
