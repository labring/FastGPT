// @vitest-environment jsdom

import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CronSelector from '../../../../components/common/MySelect/CronSelector';
import { cronParser2Fields } from '@fastgpt/global/common/string/time';

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

  const ControlledSelector = ({ initialValue }: { initialValue: string }) => {
    const [value, setValue] = useState(initialValue);
    return React.createElement(CronSelector, {
      cronString: value,
      onChange: (next) => {
        onChange(next);
        setValue(next);
      }
    });
  };

  const render = async (cronString: string, revision = 0) => {
    await act(async () => {
      root.render(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(ControlledSelector, {
            initialValue: cronString,
            key: `${cronString}-${revision}`
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

  it.each([
    [30, 'app:cron.every_day', ['09:00'], '0 9 * * *'],
    [1, 'app:cron.every_day', ['01:00'], '0 1 * * *'],
    [10, 'app:cron.every_week', ['app:week.Monday', '00:00'], '0 0 * * 1'],
    [5, 'app:cron.every_week', ['app:week.Friday', '00:00'], '0 0 * * 5'],
    [15, 'app:cron.every_month', ['20app:month.unit', '00:00'], '0 0 20 * *'],
    [20, 'app:cron.interval', ['app:interval.2_hours'], '0 */2 * * *']
  ])(
    'saves a complete target path from every-%i-minute to %s',
    async (minutes, group, options, expected) => {
      const original = `*/${minutes} * * * *`;
      await render(original);
      await act(async () => container.querySelector<HTMLButtonElement>('button')!.click());
      await clickOption(group as string);
      expect(onChange).not.toHaveBeenCalled();

      // 关闭并重新加载时应仍保留原配置；再完成目标分组的叶子选择。
      await act(async () => container.querySelector<HTMLButtonElement>('button')!.click());
      await render(original, 1);
      expect(container.querySelector('button')?.textContent).toContain(`Every ${minutes} minutes`);
      await act(async () => container.querySelector<HTMLButtonElement>('button')!.click());
      await clickOption(group as string);
      for (const [index, option] of (options as string[]).entries()) {
        await clickOption(option);
        if (index < options.length - 1) expect(onChange).not.toHaveBeenCalled();
      }
      expect(onChange).toHaveBeenCalledExactlyOnceWith(expected);
      expect(cronParser2Fields(expected as string)).not.toBeNull();
      await render(expected as string, 2);
      expect(container.querySelector('button')?.textContent).not.toContain(
        `Every ${minutes} minutes`
      );
      expect(onChange.mock.calls.every(([value]) => cronParser2Fields(value) !== null)).toBe(true);
    }
  );
});
