// @vitest-environment jsdom

import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const reactGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
reactGlobals.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'zh-CN' } })
}));

vi.mock('@chakra-ui/react', () => ({
  Box: React.forwardRef<HTMLDivElement, React.PropsWithChildren<Record<string, unknown>>>(
    function MockBox({ children, as, ...props }, ref) {
      return React.createElement(typeof as === 'string' ? as : 'div', { ...props, ref }, children);
    }
  ),
  Flex: React.forwardRef<HTMLDivElement, React.PropsWithChildren<Record<string, unknown>>>(
    function MockFlex({ children, as, ...props }, ref) {
      return React.createElement(typeof as === 'string' ? as : 'div', { ...props, ref }, children);
    }
  ),
  Card: React.forwardRef<HTMLDivElement, React.PropsWithChildren<Record<string, unknown>>>(
    function MockCard({ children, ...props }, ref) {
      return React.createElement('div', { ...props, ref }, children);
    }
  ),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) =>
    React.createElement('input', props),
  Portal: ({ children }: React.PropsWithChildren) =>
    React.createElement(React.Fragment, null, children)
}));

vi.mock('../../../components/common/Icon', () => ({
  default: () => React.createElement('span', { 'data-testid': 'mock-icon' })
}));

vi.mock('react-day-picker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-day-picker')>()),
  DayPicker: ({ onSelect }: { onSelect?: (date: Date) => void }) =>
    React.createElement(
      'div',
      { 'data-testid': 'mock-day-picker' },
      React.createElement(
        'button',
        {
          'data-testid': 'mock-select-date-btn',
          onClick: () => onSelect?.(new Date('2026-09-20T00:00:00.000Z'))
        },
        'Pick Date'
      )
    )
}));

import DateTimePicker from '../../../components/common/DateTimePicker';

const createTestRoot = () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  return { host, root: createRoot(host) };
};

describe('DateTimePicker controlled and uncontrolled behavior', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('controlled mode: clears displayed date when selectedDateTime changes to undefined', async () => {
    const { host, root } = createTestRoot();

    // 初始渲染有日期
    await act(async () => {
      root.render(
        React.createElement(DateTimePicker, {
          selectedDateTime: new Date('2026-09-11T00:00:00.000Z')
        })
      );
    });

    expect(host.textContent).toContain('2026/09/11');

    // 受控清空为 undefined
    await act(async () => {
      root.render(
        React.createElement(DateTimePicker, {
          selectedDateTime: undefined
        })
      );
    });

    expect(host.textContent).not.toContain('2026/09/11');
    root.unmount();
  });

  it('controlled mode: updates date when user selects, and properly clears when reset to undefined', async () => {
    const { host, root } = createTestRoot();

    let clearFn: () => void = () => {};

    const ControlledTestComponent = () => {
      const [date, setDate] = useState<Date | undefined>(new Date('2026-09-11T00:00:00.000Z'));
      clearFn = () => setDate(undefined);
      return React.createElement(
        'div',
        null,
        React.createElement(DateTimePicker, {
          selectedDateTime: date,
          onChange: setDate,
          'data-testid': 'datetime-trigger'
        })
      );
    };

    await act(async () => {
      root.render(React.createElement(ControlledTestComponent));
    });

    expect(host.textContent).toContain('2026/09/11');

    // 打开弹窗选择新日期
    const trigger = host.querySelector('[data-testid="datetime-trigger"]') as HTMLElement;
    expect(trigger).toBeTruthy();
    await act(async () => {
      trigger.click();
    });

    const selectBtn = host.querySelector(
      '[data-testid="mock-select-date-btn"]'
    ) as HTMLButtonElement;
    expect(selectBtn).toBeTruthy();

    await act(async () => {
      selectBtn.click();
    });

    expect(host.textContent).toContain('2026/09/20');

    // 外部受控清空为 undefined
    await act(async () => {
      clearFn();
    });

    // 验证回归已修复：清空后展示文本变为空，绝不回退到旧日期
    expect(host.textContent).not.toContain('2026/09/20');
    expect(host.textContent).not.toContain('2026/09/11');

    root.unmount();
  });

  it('uncontrolled mode: initializes with defaultDate and updates on selection', async () => {
    const { host, root } = createTestRoot();
    const onChange = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(DateTimePicker, {
          defaultDate: new Date('2026-09-01T00:00:00.000Z'),
          onChange,
          'data-testid': 'datetime-trigger'
        })
      );
    });

    expect(host.textContent).toContain('2026/09/01');

    // 打开弹窗选择新日期
    const trigger = host.querySelector('[data-testid="datetime-trigger"]') as HTMLElement;
    expect(trigger).toBeTruthy();
    await act(async () => {
      trigger.click();
    });

    const selectBtn = host.querySelector(
      '[data-testid="mock-select-date-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      selectBtn.click();
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain('2026/09/20');

    root.unmount();
  });

  it('uncontrolled mode: starts empty without defaultDate and updates on selection', async () => {
    const { host, root } = createTestRoot();
    const onChange = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(DateTimePicker, {
          onChange,
          'data-testid': 'datetime-trigger'
        })
      );
    });

    // 初始为空
    expect(host.textContent).not.toContain('2026');

    // 打开弹窗选择新日期
    const trigger = host.querySelector('[data-testid="datetime-trigger"]') as HTMLElement;
    await act(async () => {
      trigger.click();
    });

    const selectBtn = host.querySelector(
      '[data-testid="mock-select-date-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      selectBtn.click();
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain('2026/09/20');

    root.unmount();
  });

  it('controlled mode: strictly adheres to selectedDateTime prop even when selection occurs without parent update', async () => {
    const { host, root } = createTestRoot();
    const onChange = vi.fn();

    // 受控传入固定日期，onChange 不更新 state
    await act(async () => {
      root.render(
        React.createElement(DateTimePicker, {
          selectedDateTime: new Date('2026-09-11T00:00:00.000Z'),
          onChange,
          'data-testid': 'datetime-trigger'
        })
      );
    });

    expect(host.textContent).toContain('2026/09/11');

    // 打开弹窗选择新日期
    const trigger = host.querySelector('[data-testid="datetime-trigger"]') as HTMLElement;
    await act(async () => {
      trigger.click();
    });

    const selectBtn = host.querySelector(
      '[data-testid="mock-select-date-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      selectBtn.click();
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    // 因为外部受控 prop 仍是 2026-09-11，组件应遵循单一数据源原则，展示旧受控日期而非私自覆盖
    expect(host.textContent).toContain('2026/09/11');
    expect(host.textContent).not.toContain('2026/09/20');

    root.unmount();
  });
});

it('browses years and months without changing the selected date, respecting disabled years', async () => {
  const { host, root } = createTestRoot();
  const onChange = vi.fn();
  await act(async () => {
    root.render(
      React.createElement(DateTimePicker, {
        defaultDate: new Date(2026, 8, 11),
        disabled: [{ after: new Date(2026, 11, 31) }],
        onChange,
        'data-testid': 'datetime-trigger'
      })
    );
  });
  await act(async () => {
    (host.querySelector('[data-testid="datetime-trigger"]') as HTMLElement).click();
  });
  const button = (label: string) =>
    Array.from(host.querySelectorAll('button')).find((item) => item.textContent === label);
  await act(async () => {
    button('2026 年')?.click();
  });
  expect(button('2027')?.disabled).toBe(true);
  await act(async () => {
    Array.from(host.querySelectorAll('button'))
      .filter((item) => item.textContent === '2026')
      .at(-1)
      ?.click();
  });
  expect(button('1月')).toBeTruthy();
  await act(async () => {
    button('1月')?.click();
  });
  expect(host.textContent).toContain('2026/09/11');
  expect(onChange).not.toHaveBeenCalled();
  await act(async () => {
    root.unmount();
  });
});

it('keeps the selected year and month unchanged while paging', async () => {
  const { host, root } = createTestRoot();
  const onChange = vi.fn();
  await act(async () => {
    root.render(
      React.createElement(DateTimePicker, {
        defaultDate: new Date(2026, 8, 11),
        onChange,
        'data-testid': 'datetime-trigger'
      })
    );
  });
  const button = (label: string) =>
    Array.from(host.querySelectorAll('button')).find((item) => item.textContent === label);
  const arrow = (label: string) =>
    host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  await act(async () => {
    (host.querySelector('[data-testid="datetime-trigger"]') as HTMLElement).click();
  });
  await act(async () => {
    button('2026 年')?.click();
  });
  expect(button('2026')?.getAttribute('bg')).toBe('primary.600');
  await act(async () => {
    arrow('common:date_picker.next')?.click();
  });
  expect(button('2038')?.getAttribute('bg')).not.toBe('primary.600');
  expect(
    host.querySelector<HTMLInputElement>('input[aria-label="common:date_picker.year"]')?.value
  ).toBe('2026');
  await act(async () => {
    arrow('common:date_picker.previous')?.click();
  });
  await act(async () => {
    button('2026')?.click();
  });
  expect(button('9月')?.getAttribute('bg')).toBe('primary.600');
  await act(async () => {
    arrow('common:date_picker.next')?.click();
  });
  expect(button('9月')?.getAttribute('bg')).not.toBe('primary.600');
  expect(host.textContent).toContain('2026/09/11');
  expect(onChange).not.toHaveBeenCalled();
  await act(async () => {
    root.unmount();
  });
});

it('submits the year input and allows it to be edited again', async () => {
  const { host, root } = createTestRoot();
  await act(async () => {
    root.render(
      React.createElement(DateTimePicker, {
        defaultDate: new Date(2026, 8, 11),
        'data-testid': 'datetime-trigger'
      })
    );
  });
  await act(async () => {
    (host.querySelector('[data-testid="datetime-trigger"]') as HTMLElement).click();
  });
  await act(async () => {
    Array.from(host.querySelectorAll('button'))
      .find((item) => item.textContent === '2026 年')
      ?.click();
  });
  const input = host.querySelector<HTMLInputElement>('input[aria-label="common:date_picker.year"]');
  expect(input).toBeTruthy();
  await act(async () => {
    input?.focus();
  });
  await act(async () => {
    input?.form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  expect(host.textContent).toContain('1月');
  expect(document.activeElement).not.toBe(input);
  await act(async () => {
    input?.focus();
  });
  expect(document.activeElement).toBe(input);
  await act(async () => {
    root.unmount();
  });
});

it('disables paging past date bounds in day, month and year views', async () => {
  const { host, root } = createTestRoot();
  await act(async () => {
    root.render(
      React.createElement(DateTimePicker, {
        defaultDate: new Date(2026, 8, 11),
        disabled: [{ before: new Date(2026, 8, 5) }, { after: new Date(2027, 2, 10) }],
        'data-testid': 'datetime-trigger'
      })
    );
  });
  const button = (label: string) =>
    Array.from(host.querySelectorAll('button')).find((item) => item.textContent === label);
  const arrow = (label: string) =>
    host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  await act(async () => {
    (host.querySelector('[data-testid="datetime-trigger"]') as HTMLElement).click();
  });
  expect(arrow('common:date_picker.previous')?.disabled).toBe(true);
  expect(arrow('common:date_picker.next')?.disabled).toBe(false);
  await act(async () => {
    button('2026 年')?.click();
  });
  expect(arrow('common:date_picker.previous')?.disabled).toBe(true);
  expect(arrow('common:date_picker.next')?.disabled).toBe(true);
  await act(async () => {
    button('2026')?.click();
  });
  expect(arrow('common:date_picker.previous')?.disabled).toBe(true);
  expect(arrow('common:date_picker.next')?.disabled).toBe(false);
  await act(async () => {
    arrow('common:date_picker.next')?.click();
  });
  expect(arrow('common:date_picker.previous')?.disabled).toBe(false);
  expect(arrow('common:date_picker.next')?.disabled).toBe(true);
  await act(async () => {
    root.unmount();
  });
});

it('closes and resets the year input after an invalid submission', async () => {
  const { host, root } = createTestRoot();
  await act(async () => {
    root.render(
      React.createElement(DateTimePicker, {
        defaultDate: new Date(2026, 8, 11),
        disabled: [{ after: new Date(2026, 11, 31) }],
        'data-testid': 'datetime-trigger'
      })
    );
  });
  await act(async () => {
    (host.querySelector('[data-testid="datetime-trigger"]') as HTMLElement).click();
  });
  await act(async () => {
    Array.from(host.querySelectorAll('button'))
      .find((item) => item.textContent === '2026 年')
      ?.click();
  });
  const input = host.querySelector<HTMLInputElement>('input[aria-label="common:date_picker.year"]');
  await act(async () => {
    input?.focus();
  });
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, '2027');
    input?.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(input?.value).toBe('2027');
  await act(async () => {
    input?.form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  expect(document.activeElement).not.toBe(input);
  expect(input?.value).toBe('2026');
  expect(host.textContent).toContain('2025');
  await act(async () => {
    root.unmount();
  });
});
