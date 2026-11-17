// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { ChakraProvider, Input } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminSettingPage from '@/pageComponents/admin/settings/AdminSettingPage';
import AdminFormItem from '@/pageComponents/admin/settings/AdminFormItem';

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
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: false, addListener() {}, removeListener() {} });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
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
