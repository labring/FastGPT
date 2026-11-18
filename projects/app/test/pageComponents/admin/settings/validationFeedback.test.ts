import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let ChakraProvider: typeof import('@chakra-ui/react').ChakraProvider;
let Input: typeof import('@chakra-ui/react').Input;
let useForm: typeof import('react-hook-form').useForm;
let AdminSettingPage: typeof import('@/pageComponents/admin/settings/AdminSettingPage').default;
let AdminFormItem: typeof import('@/pageComponents/admin/settings/AdminFormItem').default;

vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@/pageComponents/admin/AdminHeader', () => ({
  default: ({ rightContent }: any) => React.createElement('header', null, rightContent)
}));
vi.mock('@/pageComponents/admin/settings/AdminSettingTOC', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyLoading', () => ({ default: () => null }));

/** 使用真实 RHF 与 Chakra 校验上下文，验证红框状态来自表单错误，而不是只检查源码属性。 */
const Form = ({ save }: { save: (values: unknown) => Promise<void> }) => {
  const form = useForm({ defaultValues: { name: '' } });
  return React.createElement(
    AdminSettingPage,
    {
      headerTitle: 'Settings',
      tocItems: [],
      form,
      onSave: form.handleSubmit(save)
    } as React.ComponentProps<typeof AdminSettingPage>,
    React.createElement(
      AdminFormItem,
      { label: 'Name' } as React.ComponentProps<typeof AdminFormItem>,
      React.createElement(Input, { ...form.register('name', { required: 'Required' }) })
    )
  );
};

describe('admin config validation feedback', () => {
  let dom: JSDOM;
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(async () => {
    // 公共 setup 先在 Node 中加载服务端 ENV，再为当前交互用例安装 DOM。
    dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
    // React 在 DOM 安装前加载；补齐旧输入事件接口，保留真实聚焦和编辑行为。
    Object.assign(dom.window.HTMLElement.prototype, {
      attachEvent: vi.fn(),
      detachEvent: vi.fn()
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('HTMLInputElement', dom.window.HTMLInputElement);
    vi.stubGlobal('FileList', dom.window.FileList);
    vi.stubGlobal('requestAnimationFrame', dom.window.requestAnimationFrame.bind(dom.window));
    vi.stubGlobal('cancelAnimationFrame', dom.window.cancelAnimationFrame.bind(dom.window));
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: false, addListener() {}, removeListener() {} });
    // RHF 与 Chakra/Emotion 在模块加载时判断 DOM 能力，安装 window 后再加载以绑定真实输入 ref。
    [
      { ChakraProvider, Input },
      { useForm },
      { default: AdminSettingPage },
      { default: AdminFormItem }
    ] = await Promise.all([
      import('@chakra-ui/react'),
      import('react-hook-form'),
      import('@/pageComponents/admin/settings/AdminSettingPage'),
      import('@/pageComponents/admin/settings/AdminFormItem')
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

  it('marks a client-required field invalid and shows its error without sending a request', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    await act(async () =>
      root.render(React.createElement(ChakraProvider, null, React.createElement(Form, { save })))
    );
    await act(async () => container.querySelector('button')!.click());
    expect(save).not.toHaveBeenCalled();
    expect(container.querySelector('input')?.getAttribute('aria-invalid')).toBe('true');
    expect(container.textContent).toContain('Required');
  });

  it('maps server domain errors back to an input while preserving the draft', async () => {
    const save = vi
      .fn()
      .mockRejectedValue({ zodError: [{ path: ['site', 'name'], message: 'Too long' }] });
    const ExistingForm = () => {
      const form = useForm({ defaultValues: { name: 'Unsaved draft' } });
      return React.createElement(
        AdminSettingPage,
        {
          headerTitle: 'Settings',
          tocItems: [],
          form,
          onSave: form.handleSubmit(save)
        } as React.ComponentProps<typeof AdminSettingPage>,
        React.createElement(
          AdminFormItem,
          { label: 'Name' } as React.ComponentProps<typeof AdminFormItem>,
          React.createElement(Input, form.register('name'))
        )
      );
    };
    await act(async () =>
      root.render(React.createElement(ChakraProvider, null, React.createElement(ExistingForm)))
    );
    await act(async () => container.querySelector('button')!.click());
    expect(save).toHaveBeenCalledOnce();
    expect(container.querySelector('input')?.getAttribute('aria-invalid')).toBe('true');
    expect(container.querySelector('input')?.value).toBe('Unsaved draft');
    expect(container.textContent).toContain('Too long');
    save.mockResolvedValue(undefined);
    await act(async () =>
      Simulate.change(container.querySelector('input')!, {
        target: { name: 'name', value: 'Repaired draft' }
      } as any)
    );
    await act(async () => container.querySelector('button')!.click());
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0]).toMatchObject({ name: 'Repaired draft' });
    expect(container.querySelector('input')?.getAttribute('aria-invalid')).not.toBe('true');
  });
});
