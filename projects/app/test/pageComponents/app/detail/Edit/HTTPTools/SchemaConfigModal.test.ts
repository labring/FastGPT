import { JSDOM } from 'jsdom';
import React, { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SchemaConfigModal from '@/pageComponents/app/detail/Edit/HTTPTools/SchemaConfigModal';

const mocks = vi.hoisted(() => ({
  getApiSchemaByUrl: vi.fn(),
  onClose: vi.fn(),
  reloadApp: vi.fn(),
  toast: vi.fn(),
  str2OpenApiSchema: vi.fn(),
  pathData2ToolList: vi.fn(),
  remoteTools: [{ name: 'remote-tool', description: 'Remote tool' }]
}));

vi.mock('@chakra-ui/react', async () => {
  const react = await import('react');
  const wrapper = ({ children }: { children?: ReactNode }) =>
    react.createElement('div', null, children);
  const input = react.forwardRef<HTMLInputElement, any>((props, ref) =>
    react.createElement('input', {
      'aria-label': props['aria-label'],
      placeholder: props.placeholder,
      value: props.value,
      onChange: props.onChange,
      onBlur: props.onBlur,
      name: props.name,
      disabled: props.isDisabled ?? props.disabled,
      ref
    })
  );
  const textarea = react.forwardRef<HTMLTextAreaElement, any>((props, ref) =>
    react.createElement('textarea', {
      placeholder: props.placeholder,
      value: props.value,
      onChange: props.onChange,
      onBlur: props.onBlur,
      name: props.name,
      readOnly: props.isReadOnly ?? props.readOnly,
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
      isDisabled
    }: {
      children?: ReactNode;
      onClick?: () => void;
      isDisabled?: boolean;
    }) =>
      react.createElement('button', { onClick, disabled: isDisabled, type: 'button' }, children),
    Input: input,
    Textarea: textarea
  };
});

vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('use-context-selector', () => ({
  useContextSelector: (_context: unknown, selector: (value: unknown) => unknown) =>
    selector({ appDetail: { _id: 'app-id', name: 'App', nodes: [] }, reloadApp: mocks.reloadApp })
}));
vi.mock('@/pageComponents/app/detail/context', () => ({ AppContext: {} }));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: (service: (...args: any[]) => unknown, options: any = {}) => ({
    loading: false,
    runAsync: async (...args: any[]) => {
      try {
        const result = await service(...args);
        options.onSuccess?.(result, args);
        return result;
      } catch (error) {
        options.onError?.(error, args);
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
vi.mock('@fastgpt/web/components/common/FixedTable', async () => {
  const react = await import('react');
  return {
    FixedTableContainer: ({ children }: { children?: ReactNode }) =>
      react.createElement('div', null, children)
  };
});
vi.mock('@fastgpt/web/components/common/MyModal', async () => {
  const react = await import('react');
  return {
    default: ({ children }: { children?: ReactNode }) => react.createElement('div', null, children)
  };
});
vi.mock('@fastgpt/web/components/common/Input/HttpInput', async () => {
  const react = await import('react');
  return {
    default: ({ value, placeholder, onBlur }: any) =>
      react.createElement('input', {
        value,
        placeholder,
        onChange: () => {},
        onBlur: (event: React.FocusEvent<HTMLInputElement>) => onBlur?.(event.target.value)
      })
  };
});
vi.mock('@fastgpt/web/components/common/Icon', async () => {
  const react = await import('react');
  return { default: () => react.createElement('span') };
});
vi.mock('@/components/common/secret/HeaderAuthConfig', () => ({
  headerValue2StoreHeader: (value: unknown) => value,
  storeHeader2HeaderValue: (value: unknown) => value
}));
vi.mock('@/components/common/secret/HeaderAuthForm', async () => {
  const react = await import('react');
  return {
    default: () => react.createElement('div'),
    AuthValueDisplay: () => react.createElement('div')
  };
});
vi.mock('@fastgpt/global/core/app/jsonschema', () => ({
  str2OpenApiSchema: mocks.str2OpenApiSchema
}));
vi.mock('@fastgpt/global/core/app/tool/httpTool/utils', () => ({
  pathData2ToolList: mocks.pathData2ToolList
}));
vi.mock('@fastgpt/global/core/workflow/node/constant', () => ({
  FlowNodeTypeEnum: { toolSet: 'toolSet' }
}));
vi.mock('@fastgpt/global/core/workflow/type/node', () => ({
  HttpToolSetRuntimeConfigSchema: { safeParse: () => ({ data: undefined }) }
}));
vi.mock('@fastgpt/global/common/secret/utils', () => ({
  getSecretPlainValue: () => undefined,
  isSecretValueConfigured: (value: unknown) => Boolean(value)
}));
vi.mock('@/pageComponents/app/detail/Edit/HTTPTools/utils', () => ({
  buildWorkflowCustomHeaders: () => ({ customHeaders: '{}', headerSecret: {} })
}));

describe('SchemaConfigModal OpenAPI parsing', () => {
  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('location', dom.window.location);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    mocks.getApiSchemaByUrl.mockReset();
    mocks.onClose.mockReset();
    mocks.reloadApp.mockReset();
    mocks.toast.mockReset();
    mocks.str2OpenApiSchema.mockReset().mockResolvedValue({ pathData: [] });
    mocks.pathData2ToolList.mockReset().mockResolvedValue(mocks.remoteTools);
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

  const renderModal = async (props: Record<string, unknown> = {}) => {
    await act(async () => {
      root.render(
        React.createElement(SchemaConfigModal, {
          onClose: mocks.onClose,
          ...props
        })
      );
    });
  };

  const inputByPlaceholder = (placeholder: string) => {
    const input = Array.from(container.querySelectorAll('input')).find(
      (item) => item.placeholder === placeholder
    );
    if (!input) throw new Error(`Missing input: ${placeholder}`);
    return input;
  };

  const click = async (label: string) => {
    const button = Array.from(container.querySelectorAll('button')).find(
      (item) => item.textContent === label
    );
    if (!button) throw new Error(`Missing button: ${label}`);
    await act(async () => {
      button.click();
      await Promise.resolve();
    });
  };

  const setInputValue = async (input: HTMLInputElement, value: string) => {
    await act(async () => {
      input.value = value;
      Simulate.change(input);
    });
  };

  it('aborts and ignores a workflow parse after its URL changes', async () => {
    const pending: Array<{
      controller: AbortController;
      resolve: (schema: { openapi: string }) => void;
    }> = [];
    mocks.getApiSchemaByUrl.mockImplementation((_url, controller: AbortController) => {
      return new Promise((resolve) => pending.push({ controller, resolve }));
    });
    const onSaveConfig = vi.fn();
    await renderModal({
      initialConfig: {
        apiSchemaUrl: 'https://old.example/openapi.json',
        customHeaders: '{}',
        headerSecret: {},
        toolList: [{ name: 'saved-tool', description: 'Saved wording' }]
      },
      onSaveConfig
    });

    const urlInput = inputByPlaceholder('common:plugin.Import from URL');
    await setInputValue(urlInput, 'https://first.example/openapi.json');
    await click('common:Parse');
    expect(pending).toHaveLength(1);

    await setInputValue(urlInput, 'https://second.example/openapi.json');
    expect(pending[0].controller.signal.aborted).toBe(true);
    await act(async () => {
      pending[0].resolve({ openapi: '3.0.0' });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('textarea')).toBeNull();
    await click('common:Save');
    expect(onSaveConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        apiSchemaUrl: 'https://second.example/openapi.json',
        toolList: [{ name: 'saved-tool', description: 'Saved wording' }]
      })
    );
  });

  it('aborts a simple-app parse on close without parsing from the URL blur', async () => {
    const pending: Array<{
      controller: AbortController;
      resolve: (schema: { openapi: string }) => void;
    }> = [];
    mocks.getApiSchemaByUrl.mockImplementation((_url, controller: AbortController) => {
      return new Promise((resolve) => pending.push({ controller, resolve }));
    });
    await renderModal();

    const urlInput = inputByPlaceholder('common:plugin.Import from URL');
    await setInputValue(urlInput, 'https://api.example/openapi.json');
    await act(async () => Simulate.blur(urlInput));
    expect(mocks.getApiSchemaByUrl).not.toHaveBeenCalled();

    await click('common:Import');
    expect(mocks.getApiSchemaByUrl).toHaveBeenCalledTimes(1);
    await setInputValue(urlInput, 'https://new-api.example/openapi.json');
    expect(pending[0].controller.signal.aborted).toBe(true);
    await act(async () => {
      pending[0].resolve({ openapi: '3.0.0' });
      await Promise.resolve();
    });
    expect(container.querySelector('textarea')?.value).toBe('');

    await click('common:Import');
    expect(mocks.getApiSchemaByUrl).toHaveBeenCalledTimes(2);
    await act(async () => Simulate.blur(urlInput));
    await click('common:Close');
    expect(pending[1].controller.signal.aborted).toBe(true);
    expect(mocks.onClose).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending[1].resolve({ openapi: '3.0.0' });
      await Promise.resolve();
    });
    expect(container.querySelector('textarea')?.value).toBe('');
    expect(mocks.getApiSchemaByUrl).toHaveBeenCalledTimes(2);
  });
});
