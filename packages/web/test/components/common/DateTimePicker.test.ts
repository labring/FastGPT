// @vitest-environment jsdom

import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const reactGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
reactGlobals.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@chakra-ui/react', () => ({
  Box: React.forwardRef<HTMLDivElement, React.PropsWithChildren<Record<string, unknown>>>(
    function MockBox({ children, ...props }, ref) {
      return React.createElement('div', { ...props, ref }, children);
    }
  ),
  Flex: React.forwardRef<HTMLDivElement, React.PropsWithChildren<Record<string, unknown>>>(
    function MockFlex({ children, ...props }, ref) {
      return React.createElement('div', { ...props, ref }, children);
    }
  ),
  Card: React.forwardRef<HTMLDivElement, React.PropsWithChildren<Record<string, unknown>>>(
    function MockCard({ children, ...props }, ref) {
      return React.createElement('div', { ...props, ref }, children);
    }
  ),
  Portal: ({ children }: React.PropsWithChildren) =>
    React.createElement(React.Fragment, null, children)
}));

vi.mock('../../../components/common/Icon', () => ({
  default: () => React.createElement('span', { 'data-testid': 'mock-icon' })
}));

vi.mock('react-day-picker', () => ({
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
