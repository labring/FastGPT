// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ calendar: {} as Record<string, any>, isPc: true }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../../hooks/useSystem', () => ({ useSystem: () => ({ isPc: state.isPc }) }));
vi.mock('../../../components/common/Icon', () => ({ default: () => null }));
vi.mock('../../../components/common/PhoneDrawer', () => ({
  default: ({ isOpen, children }: React.PropsWithChildren<{ isOpen: boolean }>) =>
    isOpen ? children : null
}));
vi.mock('react-day-picker', () => ({
  DayPicker: (props: Record<string, any>) => {
    state.calendar = props;
    return React.createElement('div', null, props.footer);
  }
}));
vi.mock('@chakra-ui/react', () => {
  const Context = React.createContext({ isOpen: false, onOpen: () => {}, onClose: () => {} });
  const Container = ({ children }: React.PropsWithChildren) =>
    React.createElement('div', null, children);
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

describe('DateRangePicker confirmation and historical range', () => {
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
  });

  it('removes the historical cutoff for audit while still disabling all future dates', async () => {
    await renderPicker({ historyLimitDays: null });
    expect(state.calendar.disabled).toHaveLength(1);
    expect(state.calendar.disabled[0].after).toBeInstanceOf(Date);
    expect(state.calendar.disabled[0]).not.toHaveProperty('before');
  });

  it('keeps the default history cutoff for other consumers', async () => {
    await renderPicker();
    expect(state.calendar.disabled).toHaveLength(2);
    expect(state.calendar.disabled[0].before).toBeInstanceOf(Date);
  });
});
