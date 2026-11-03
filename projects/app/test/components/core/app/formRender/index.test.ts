import React, { act, useState } from 'react';
import { ChakraProvider } from '@chakra-ui/react';
import { JSDOM } from 'jsdom';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import InputRender from '@/components/core/app/formRender';
import { InputTypeEnum } from '@/components/core/app/formRender/constant';
import LabelAndFormRender from '@/components/core/app/formRender/LabelAndForm';
import { useForm } from 'react-hook-form';

vi.mock('@fastgpt/web/components/common/Icon', async () => {
  const React = await import('react');
  const MockIcon = React.forwardRef(() => null);
  MockIcon.displayName = 'MockIcon';
  return { default: MockIcon };
});

vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));

const PasswordInputHarness = () => {
  const [value, setValue] = useState<{ value: string }>({ value: '' });
  return React.createElement(InputRender, {
    inputType: InputTypeEnum.password,
    value,
    onChange: setValue
  });
};

const PasswordFormHarness = ({ value, onSubmit }: { value: unknown; onSubmit: () => void }) => {
  const form = useForm<{ password: unknown }>({ values: { password: value } });
  return React.createElement(
    'form',
    { onSubmit: form.handleSubmit(onSubmit) },
    React.createElement(LabelAndFormRender, {
      form,
      fieldName: 'password',
      label: 'Password',
      inputType: InputTypeEnum.password,
      required: true
    })
  );
};

describe('InputRender password input', () => {
  let dom: JSDOM;
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('HTMLInputElement', dom.window.HTMLInputElement);
    vi.stubGlobal('requestAnimationFrame', dom.window.requestAnimationFrame.bind(dom.window));
    vi.stubGlobal('cancelAnimationFrame', dom.window.cancelAnimationFrame.bind(dom.window));
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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

  it('keeps the input mounted while typing the first password', async () => {
    await act(async () => {
      root.render(
        React.createElement(ChakraProvider, null, React.createElement(PasswordInputHarness))
      );
    });

    const input = container.querySelector<HTMLInputElement>('input[type="password"]');
    expect(input).not.toBeNull();
    if (!input) throw new Error('Password input was not rendered');

    await act(async () => {
      Simulate.focus(input);
      input.value = 'a';
      Simulate.change(input);
    });

    expect(container.querySelector('input[type="password"]')).not.toBeNull();
    expect(container.querySelector<HTMLInputElement>('input[type="password"]')?.value).toBe('a');
  });

  it.each([
    [{ value: 'plain' }, true],
    [{ secret: 'cipher' }, true],
    [{ value: '' }, false],
    [{ value: 'plain', extra: true }, false],
    [{ ref: ['node', 'token'] }, false]
  ])('uses shared credential validity in required static forms: %j', async (value, valid) => {
    const onSubmit = vi.fn();
    await act(async () => {
      root.render(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(PasswordFormHarness, { value, onSubmit })
        )
      );
    });
    await act(async () => {
      container
        .querySelector('form')
        ?.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(onSubmit).toHaveBeenCalledTimes(valid ? 1 : 0);
  });
});
