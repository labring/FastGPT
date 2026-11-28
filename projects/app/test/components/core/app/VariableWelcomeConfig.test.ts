import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { expect, it, vi } from 'vitest';
import VariableWelcomeConfig from '@/components/core/app/VariableWelcomeConfig';
import type { AppWelcomeConfigType } from '@fastgpt/global/core/app/type';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';

vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@chakra-ui/react', () => ({
  Box: 'div',
  Button: 'button',
  Flex: 'div',
  Input: 'input',
  Textarea: 'textarea',
  Select: ({
    placeholder,
    children,
    ...props
  }: React.ComponentProps<'select'> & { placeholder: string }) =>
    React.createElement(
      'select',
      props,
      React.createElement('option', { value: '' }, placeholder),
      children
    )
}));

it('configures, extends and clears welcome rules for an existing variable', async () => {
  const dom = new JSDOM('<main></main>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('React', React);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = dom.window.document.querySelector('main')!;
  const root = createRoot(container);
  const variable = {
    key: 'locale',
    label: 'Language',
    type: VariableInputEnum.input,
    description: ''
  };
  const Harness = () => {
    const [rule, setRule] = useState<AppWelcomeConfigType['byVariable']>();
    return React.createElement(VariableWelcomeConfig, {
      variables: [variable],
      rule,
      onChange: setRule
    });
  };
  try {
    await act(async () => root.render(React.createElement(Harness)));
    const select = container.querySelector('select')!;
    const choose = (key: string) =>
      act(async () => {
        select.value = key;
        select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      });
    await choose('locale');
    expect(container.querySelectorAll('textarea')).toHaveLength(1);
    const add = () =>
      [...container.querySelectorAll('button')].find(
        (button) => button.textContent === 'workflow:add_welcome_case'
      )!;
    await act(async () => add().click());
    expect(container.querySelectorAll('textarea')).toHaveLength(2);
    await act(async () => container.querySelector('button')!.click());
    expect(container.querySelectorAll('textarea')).toHaveLength(1);
    await choose('');
    expect(container.querySelector('textarea')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
    dom.window.close();
  }
});
