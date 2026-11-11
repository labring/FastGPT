// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CronSelector from '../../../../components/common/MySelect/CronSelector';

vi.mock('next-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { interval?: number }) =>
      values?.interval ? `Every ${values.interval} minutes` : key
  })
}));

describe('CronSelector interaction', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const onChange = vi.fn();

  const render = async (cronString: string) => {
    await act(async () => {
      root.render(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(CronSelector, {
            cronString,
            onChange
          })
        )
      );
    });
    const menu = container.querySelector<HTMLElement>('[role="menu"]');
    if (menu) menu.scrollTo = vi.fn();
  };
  const clickOption = async (label: string) => {
    const option = [...container.querySelectorAll<HTMLElement>('.nowheel > div')].find(
      (element) => element.textContent === label
    );
    expect(option).toBeDefined();
    await act(async () => option!.click());
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it('switches a daily schedule to minutes and restores the saved selection', async () => {
    await render('0 9 * * *');
    await act(async () => container.querySelector<HTMLButtonElement>('button')!.click());
    await clickOption('app:cron.interval (common:minute)');
    expect(onChange).not.toHaveBeenCalled();
    await clickOption('Every 15 minutes');
    expect(onChange).toHaveBeenCalledExactlyOnceWith('*/15 * * * *');
    await render(onChange.mock.lastCall![0]);
    expect(container.querySelector('button')?.textContent).toContain('Every 15 minutes');
    await act(async () => container.querySelector<HTMLButtonElement>('button')!.click());
    const selected = [...container.querySelectorAll<HTMLElement>('.nowheel > div')].find(
      (element) => element.textContent === 'Every 15 minutes'
    );
    expect(selected).toBeDefined();
  });
});
