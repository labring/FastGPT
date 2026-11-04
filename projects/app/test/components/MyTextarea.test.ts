import { JSDOM } from 'jsdom';
import React, { act, type TextareaHTMLAttributes } from 'react';
import type { Root } from 'react-dom/client';
import { useForm } from 'react-hook-form';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MyTextarea from '@/components/common/Textarea/MyTextarea';

vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@chakra-ui/react', async () => {
  const React = await import('react');
  type TextareaMockProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
    as?: unknown;
    maxH?: unknown;
    maxW?: unknown;
    minH?: unknown;
    resize?: unknown;
    sx?: unknown;
  };
  const Div = React.forwardRef<HTMLDivElement, { children?: React.ReactNode }>(
    ({ children }, ref) => React.createElement('div', { ref }, children)
  );
  Div.displayName = 'MockDiv';
  const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaMockProps>((inputProps, ref) => {
    const domProps = Object.fromEntries(
      Object.entries(inputProps).filter(
        ([key]) => !['as', 'maxH', 'maxW', 'minH', 'resize', 'sx'].includes(key)
      )
    );
    return React.createElement('textarea', { ...domProps, ref });
  });
  Textarea.displayName = 'MockTextarea';
  const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
    (props, ref) => React.createElement('button', { ...props, ref })
  );
  Button.displayName = 'MockButton';

  return {
    Box: Div,
    Button,
    ModalBody: Div,
    ModalFooter: Div,
    Textarea,
    useDisclosure: () => ({ isOpen: false, onOpen: () => {}, onClose: () => {} })
  };
});
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyModal', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyTooltip', () => ({
  default: ({ children }: { children?: React.ReactNode }) => children
}));

describe('MyTextarea', () => {
  let dom: JSDOM;
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(async () => {
    dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://fastgpt.example.com'
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('navigator', dom.window.navigator);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    const { createRoot } = await import('react-dom/client');
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    dom.window.close();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not restore selection during IME composition or its trailing input', async () => {
    const onChange = vi.fn();
    const onCompositionStart = vi.fn();
    const onCompositionEnd = vi.fn();
    const Harness = () => {
      const [value, setValue] = React.useState('');
      return React.createElement(MyTextarea, {
        value,
        onCompositionStart,
        onCompositionEnd,
        onChange: (event) => {
          onChange(event);
          setValue(event.currentTarget.value);
        }
      });
    };

    await act(async () => root.render(React.createElement(Harness)));

    const textarea = container.querySelector('textarea');
    expect(textarea).not.toBeNull();
    const restoreSelection = vi.spyOn(window.HTMLTextAreaElement.prototype, 'setSelectionRange');
    const setValue = (value: string) => {
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set?.call(
        textarea,
        value
      );
    };
    const dispatchInput = () =>
      textarea?.dispatchEvent(new window.Event('input', { bubbles: true }));

    await act(async () => {
      textarea?.dispatchEvent(new window.Event('compositionstart', { bubbles: true }));
      setValue('n');
      dispatchInput();
    });

    expect(onCompositionStart).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(restoreSelection).not.toHaveBeenCalled();

    await act(async () => {
      setValue('你');
      textarea?.dispatchEvent(new window.Event('compositionend', { bubbles: true }));
      dispatchInput();
    });

    expect(onCompositionEnd).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(restoreSelection).not.toHaveBeenCalled();

    await act(async () => dispatchInput());
    expect(onChange).toHaveBeenCalledTimes(2);

    await act(async () => {
      setValue('你好');
      dispatchInput();
    });

    expect(onChange).toHaveBeenCalledTimes(3);
    expect(restoreSelection).toHaveBeenCalledOnce();
  });

  it('accepts the same value after the parent resets the textarea', async () => {
    const changes: string[] = [];
    let resetValue = () => {};
    const Harness = () => {
      const [value, setValue] = React.useState('');
      resetValue = () => setValue('');
      return React.createElement(MyTextarea, {
        value,
        onChange: (event) => {
          changes.push(event.currentTarget.value);
          setValue(event.currentTarget.value);
        }
      });
    };

    await act(async () => root.render(React.createElement(Harness)));

    const textarea = container.querySelector('textarea')!;
    const setValue = (value: string) => {
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set?.call(
        textarea,
        value
      );
    };
    const dispatchInput = () =>
      textarea.dispatchEvent(new window.Event('input', { bubbles: true }));

    await act(async () => {
      textarea.dispatchEvent(new window.Event('compositionstart', { bubbles: true }));
      setValue('n');
      dispatchInput();
      setValue('你');
      textarea.dispatchEvent(new window.Event('compositionend', { bubbles: true }));
      dispatchInput();
    });
    expect(changes).toEqual(['n', '你']);

    await act(async () => resetValue());
    expect(textarea.value).toBe('');

    await act(async () => {
      setValue('你');
      dispatchInput();
    });
    expect(changes).toEqual(['n', '你', '你']);
    expect(textarea.value).toBe('你');
  });

  it.each(['before', 'after'])(
    'updates an uncontrolled form after reset when final input is %s compositionend',
    async (finalInputOrder) => {
      const changes: string[] = [];
      let resetValue = () => {};
      let getFormValue = () => '';
      const Harness = () => {
        const { register, reset, getValues } = useForm<{ text: string }>({
          defaultValues: { text: '' }
        });
        resetValue = () => reset({ text: '' });
        getFormValue = () => getValues('text');
        const field = register('text');
        return React.createElement(MyTextarea, {
          ...field,
          onChange: (event) => {
            changes.push(event.currentTarget.value);
            void field.onChange(event);
          }
        });
      };

      await act(async () => root.render(React.createElement(Harness)));

      const textarea = container.querySelector('textarea')!;
      const setValue = (value: string) => {
        Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set?.call(
          textarea,
          value
        );
      };
      const dispatchInput = () =>
        textarea.dispatchEvent(new window.Event('input', { bubbles: true }));

      await act(async () => {
        textarea.dispatchEvent(new window.Event('compositionstart', { bubbles: true }));
        setValue('n');
        dispatchInput();
        setValue('你');
        if (finalInputOrder === 'before') dispatchInput();
        textarea.dispatchEvent(new window.Event('compositionend', { bubbles: true }));
        if (finalInputOrder === 'after') dispatchInput();
      });
      expect(changes).toEqual(['n', '你']);
      expect(getFormValue()).toBe('你');

      await act(async () => resetValue());
      expect(textarea.value).toBe('');
      expect(getFormValue()).toBe('');

      await act(async () => {
        setValue('你');
        dispatchInput();
      });
      expect(changes).toEqual(['n', '你', '你']);
      expect(textarea.value).toBe('你');
      expect(getFormValue()).toBe('你');
    }
  );
});
