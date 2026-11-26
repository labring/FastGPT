// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ calendar: {} as Record<string, any>, isPc: true }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../../hooks/useSystem', () => ({ useSystem: () => ({ isPc: state.isPc }) }));
vi.mock('../../../components/common/Icon', () => ({ default: () => null }));
vi.mock('../../../components/common/PhoneDrawer', () => ({
  default: ({
    isOpen,
    children,
    onClose
  }: React.PropsWithChildren<{ isOpen: boolean; onClose: () => void }>) =>
    isOpen
      ? React.createElement(
          'div',
          null,
          children,
          React.createElement('button', { onClick: onClose, 'data-dismiss': true }, 'dismiss')
        )
      : null
}));
vi.mock('react-day-picker', () => ({
  DayPicker: (props: Record<string, any>) => {
    state.calendar = props;
    return React.createElement('div', null, props.footer);
  }
}));
vi.mock('@chakra-ui/react', () => {
  const Context = React.createContext({ isOpen: false, onOpen: () => {}, onClose: () => {} });
  const Container = ({ children, onClick }: React.PropsWithChildren<{ onClick?: () => void }>) =>
    React.createElement('div', { onClick, 'data-open': onClick ? true : undefined }, children);
  return {
    Box: Container,
    Flex: Container,
    Portal: Container,
    Button: ({ onClick, children }: React.PropsWithChildren<{ onClick?: () => void }>) =>
      React.createElement('button', { onClick }, children),
    Popover: ({
      children,
      onOpen
    }: {
      children: (props: { onClose: () => void }) => React.ReactNode;
      onOpen: () => void;
    }) => {
      const [isOpen, setOpen] = React.useState(false);
      const onClose = () => setOpen(false);
      return React.createElement(
        Context.Provider,
        {
          value: {
            isOpen,
            onOpen: () => {
              onOpen();
              setOpen(true);
            },
            onClose
          }
        },
        children({ onClose })
      );
    },
    PopoverTrigger: ({ children }: React.PropsWithChildren) => {
      const context = React.useContext(Context);
      return React.createElement(
        'button',
        { onClick: context.onOpen, 'data-open': true },
        children
      );
    },
    PopoverContent: ({ children }: React.PropsWithChildren) =>
      React.useContext(Context).isOpen ? children : null
  };
});

import DateRangePicker from '../../../components/common/DateRangePicker';

let root: Root | undefined;
let host: HTMLDivElement;
const original = { from: new Date(2026, 0, 1), to: new Date(2026, 0, 7, 23, 59, 59, 999) };
const renderPicker = async (props: Record<string, unknown> = {}) => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      React.createElement(DateRangePicker, { defaultDate: original, dateRange: original, ...props })
    )
  );
  await act(async () => host.querySelector<HTMLButtonElement>('[data-open]')!.click());
};
const click = async (text: string) => {
  const button = Array.from(host.querySelectorAll('button')).find(
    (button) => button.textContent === text
  );
  await act(async () => button!.click());
};

describe.each([true, false])('DateRangePicker (desktop=%s)', (isPc) => {
  beforeEach(() => {
    state.isPc = isPc;
  });
  afterEach(async () => {
    if (root) await act(async () => root!.unmount());
    document.body.replaceChildren();
  });

  it('submits a complete local day range only after confirmation', async () => {
    const success = vi.fn();
    await renderPicker({ onSuccess: success, historyLimitDays: null });
    await act(async () =>
      state.calendar.onSelect({ from: new Date(2020, 0, 1), to: new Date(2020, 0, 2) })
    );
    expect(success).not.toHaveBeenCalled();
    await click('common:Confirm');
    expect(success).toHaveBeenCalledExactlyOnceWith({
      from: new Date(2020, 0, 1),
      to: new Date(2020, 0, 2, 23, 59, 59, 999)
    });
  });

  it('does not mutate dates shared with the applied filter while selecting a single day', async () => {
    const success = vi.fn();
    await renderPicker({ onSuccess: success });
    const sharedDate = original.to;
    const before = sharedDate.getTime();
    await act(async () => state.calendar.onSelect({ from: sharedDate, to: sharedDate }));
    expect(sharedDate.getTime()).toBe(before);
    await click('common:Confirm');
    expect(success).toHaveBeenCalledExactlyOnceWith({
      from: new Date(2026, 0, 7),
      to: new Date(2026, 0, 7, 23, 59, 59, 999)
    });
  });

  it('discards an unconfirmed range on close and restores the applied range when reopening', async () => {
    const success = vi.fn();
    await renderPicker({ onSuccess: success });
    await act(async () => state.calendar.onSelect({ from: new Date(2020, 0, 1) }));
    await click('common:Close');
    expect(success).not.toHaveBeenCalled();
    await act(async () => host.querySelector<HTMLButtonElement>('[data-open]')!.click());
    expect(state.calendar.selected).toEqual(original);
    await click('common:Confirm');
    expect(success).toHaveBeenCalledExactlyOnceWith(original);
    if (!isPc) {
      await act(async () => host.querySelector<HTMLElement>('[data-open]')!.click());
      await act(async () => host.querySelector<HTMLElement>('[data-open]')!.click());
      expect(host.querySelector('[data-dismiss]')).toBeNull();
      await act(async () => host.querySelector<HTMLElement>('[data-open]')!.click());
      await act(async () => host.querySelector<HTMLButtonElement>('[data-dismiss]')!.click());
      expect(host.querySelector('[data-dismiss]')).toBeNull();
    }
  });

  it.each([
    { historyLimitDays: null, count: 1 },
    { historyLimitDays: undefined, count: 2 }
  ])(
    'applies the $historyLimitDays history limit and always blocks future dates',
    async ({ historyLimitDays, count }) => {
      await renderPicker({
        historyLimitDays,
        defaultDate: undefined,
        dateRange: undefined,
        formLabel: '日期'
      });
      expect(state.calendar.disabled).toHaveLength(count);
      expect(state.calendar.disabled.at(-1).after).toBeInstanceOf(Date);
      expect(state.calendar.disabled[0].before instanceof Date).toBe(count === 2);
    }
  );
});
