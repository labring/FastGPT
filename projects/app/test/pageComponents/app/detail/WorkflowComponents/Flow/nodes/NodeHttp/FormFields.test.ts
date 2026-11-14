import React, { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { storeNodes2RuntimeNodes } from '@fastgpt/global/core/workflow/runtime/utils';
import { HttpNode468 } from '@fastgpt/global/core/workflow/template/system/http468';

const mocks = vi.hoisted(() => ({ onChangeNode: vi.fn() }));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('use-context-selector', () => ({
  useContextSelector: (_context: unknown, select: (state: any) => unknown) =>
    select({ onChangeNode: mocks.onChangeNode })
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/context/workflowActionsContext', () => ({
  WorkflowActionsContext: {}
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/FixedTable', () => ({
  FixedTableContainer: ({ children }: { children: ReactNode }) =>
    React.createElement('div', {}, children)
}));
vi.mock('@chakra-ui/react', () => {
  const element = (tag: string) =>
    function Container({ children }: { children?: ReactNode }) {
      return React.createElement(tag, {}, children);
    };
  return {
    Box: element('div'),
    Flex: element('div'),
    Table: element('table'),
    Thead: element('thead'),
    Tbody: element('tbody'),
    Tr: element('tr'),
    Th: element('th'),
    Td: element('td'),
    IconButton: () => null
  };
});
vi.mock('@fastgpt/web/components/common/MySelect', () => ({
  default: ({ value, list, onChange, isDisabled }: any) =>
    React.createElement(
      'select',
      {
        disabled: isDisabled,
        value,
        onChange: (event: React.ChangeEvent<HTMLSelectElement>) => onChange(event.target.value)
      },
      list.map((item: any) =>
        React.createElement('option', { key: item.value, value: item.value }, item.label)
      )
    )
}));
vi.mock('@fastgpt/web/components/common/Input/HttpInput', () => ({
  default: ({ value, onBlur }: any) =>
    React.createElement('input', {
      defaultValue: value,
      onBlur: (event: React.FocusEvent<HTMLInputElement>) => onBlur(event.currentTarget.value)
    })
}));

import { HttpFormFields } from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodeHttp/FormFields';

describe('HTTP multipart field configuration', () => {
  let dom: JSDOM;
  let root: Root;
  let frames: FrameRequestCallback[];
  const input = {
    key: NodeInputKeyEnum.httpFormBody,
    label: '',
    renderTypeList: [],
    value: [
      { key: 'attachment', value: '{{uploadedFiles}}' },
      { key: 'note', value: 'hello' }
    ]
  } as any;
  const render = async (allowFiles = true, field = input) => {
    await act(async () =>
      root.render(
        React.createElement(HttpFormFields, {
          nodeId: 'http',
          input: field,
          allowFiles,
          variables: [],
          externalProviderWorkflowVariables: []
        })
      )
    );
  };
  const flush = async () => {
    await act(async () => {
      frames.splice(0).forEach((frame) => frame(0));
    });
  };

  beforeEach(() => {
    mocks.onChangeNode.mockReset();
    frames = [];
    dom = new JSDOM('<!doctype html><div id="root"></div>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      frames.push(callback)
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    root = createRoot(document.getElementById('root')!);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it('persists a file type without losing the URL, other fields or legacy text defaults', async () => {
    await render();
    const select = document.querySelector('select')!;
    expect(select.value).toBe('string');
    await act(async () => {
      select.value = 'file';
      select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
    await flush();
    const saved = JSON.parse(JSON.stringify(mocks.onChangeNode.mock.calls[0][0].value));
    expect(saved.value).toEqual([
      { key: 'attachment', value: '{{uploadedFiles}}', type: 'file' },
      { key: 'note', value: 'hello' }
    ]);
    await render(true, saved);
    expect(document.querySelector('select')?.value).toBe('file');
    const node = {
      ...HttpNode468,
      nodeId: 'http',
      inputs: HttpNode468.inputs.map((item) => (item.key === saved.key ? saved : item))
    };
    const runtime = storeNodes2RuntimeNodes([node] as any, [])[0];
    expect(runtime.inputs.find((item) => item.key === saved.key)?.value).toEqual(saved.value);
  });

  it('retains file type and pending value edits in one frame', async () => {
    await render(true, {
      ...input,
      value: [{ key: 'attachment', value: '{{uploadedFiles}}', type: 'file' }]
    });
    const select = document.querySelector('select')!;
    const valueInput = document.querySelectorAll('input')[1];
    await act(async () => {
      valueInput.value = '{{newFile}}';
      valueInput.dispatchEvent(new dom.window.FocusEvent('focusout', { bubbles: true }));
      select.value = 'string';
      select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
    await flush();
    expect(mocks.onChangeNode.mock.lastCall?.[0].value.value).toEqual([
      { key: 'attachment', value: '{{newFile}}', type: 'string' }
    ]);
  });

  it('offers file mode only for multipart and preserves stored fields when hidden', async () => {
    await render(false, {
      ...input,
      value: [{ key: 'attachment', type: 'file', value: '{{uploadedFiles}}' }]
    });
    expect(document.querySelector('select')).toBeNull();
    expect(mocks.onChangeNode).not.toHaveBeenCalled();
  });
});
