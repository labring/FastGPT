// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const uiLanguage = vi.hoisted(() => ({ language: 'zh-CN' }));
vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: uiLanguage })
}));
vi.mock('../../../components/common/Icon', () => ({
  default: ({ name }: { name: string }) => React.createElement('span', { 'data-icon': name })
}));

import DateTimePicker from '../../../components/common/DateTimePicker';
import { SingleDateTimePicker } from '../../../components/common/DateTimePicker/SingleDateTimePicker';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('date picker clear buttons', () => {
  afterEach(() => document.body.replaceChildren());

  it('clears an uncontrolled date without opening the calendar', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const onChange = vi.fn();
    await act(async () => {
      root.render(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(DateTimePicker, {
            defaultDate: new Date(2026, 8, 11),
            onChange
          })
        )
      );
    });
    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[aria-label="common:Clear"]')?.click();
    });
    expect(onChange).toHaveBeenCalledWith(undefined);
    expect(host.textContent).not.toContain('2026/09/11');
    expect(host.querySelector('[data-icon="date"]')).toBeTruthy();
    expect(host.querySelector('.rdp-root')).toBeNull();
    await act(async () => root.unmount());
  });

  it('requests clearing a controlled date and keeps disabled values unchanged', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const onChange = vi.fn();
    const date = new Date(2026, 8, 11);
    const render = (isDisabled: boolean) =>
      React.createElement(
        ChakraProvider,
        null,
        React.createElement(DateTimePicker, { selectedDateTime: date, onChange, isDisabled })
      );
    await act(async () => root.render(render(false)));
    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[aria-label="common:Clear"]')?.click();
    });
    expect(onChange).toHaveBeenCalledWith(undefined);
    expect(host.textContent).toContain('2026/09/11');
    await act(async () => root.render(render(true)));
    const clear = host.querySelector<HTMLButtonElement>('button[aria-label="common:Clear"]');
    expect(clear?.disabled).toBe(true);
    await act(async () => {
      clear?.click();
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });

  it('clears a date-time value without opening the popover', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const onChange = vi.fn();
    const Fixture = () => {
      const [value, setValue] = useState<number | undefined>(new Date(2026, 8, 11).getTime());
      return React.createElement(SingleDateTimePicker, {
        value,
        usePortal: false,
        onChange: (next) => {
          onChange(next);
          setValue(next);
        }
      });
    };
    await act(async () =>
      root.render(React.createElement(ChakraProvider, null, React.createElement(Fixture)))
    );
    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[aria-label="common:Clear"]')?.click();
    });
    expect(onChange).toHaveBeenCalledWith(undefined);
    expect(host.querySelector('[data-icon="common/calendar"]')).toBeTruthy();
    expect(host.querySelector('.rdp-root')).toBeNull();
    await act(async () => root.unmount());
  });
});

it.each(['2026 年', '9 月'])('does not focus year input when opening %s', async (label) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      React.createElement(
        ChakraProvider,
        null,
        React.createElement(SingleDateTimePicker, {
          value: new Date(2026, 8, 11),
          usePortal: false
        })
      )
    )
  );
  await act(async () => {
    host.querySelector<HTMLElement>('[aria-haspopup="dialog"]')?.click();
  });
  const header = Array.from(host.querySelectorAll('button')).find(
    (button) => button.textContent === label
  );
  expect(header).toBeTruthy();
  await act(async () => {
    header?.focus();
    header?.click();
  });
  const input = host.querySelector<HTMLInputElement>('input[aria-label="common:date_picker.year"]');
  expect(input).toBeTruthy();
  expect(document.activeElement).not.toBe(input);
  await act(async () => {
    input?.focus();
  });
  expect(document.activeElement).toBe(input);
  await act(async () => root.unmount());
  host.remove();
});

it.each(['date', 'date-time'])(
  'keeps the clear button available while %s picker is open',
  async (kind) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const date = new Date(2026, 8, 11);
    const picker =
      kind === 'date'
        ? React.createElement(DateTimePicker, { selectedDateTime: date })
        : React.createElement(SingleDateTimePicker, { value: date, usePortal: false });
    await act(async () => root.render(React.createElement(ChakraProvider, null, picker)));
    const clear = host.querySelector<HTMLButtonElement>('button[aria-label="common:Clear"]');
    const trigger = clear?.parentElement;
    expect(trigger?.hasAttribute('data-picker-open')).toBe(false);
    expect(trigger?.querySelector('[data-date-calendar]')).toBeTruthy();
    await act(async () => {
      trigger?.click();
    });
    expect(trigger?.hasAttribute('data-picker-open')).toBe(true);
    expect(document.body.querySelector('.rdp-root')).toBeTruthy();
    await act(async () => root.unmount());
    host.remove();
  }
);

it.each(['date', 'date-time'])(
  'shows the default and custom placeholder for an empty %s picker',
  async (kind) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const picker = (placeholder?: string) =>
      kind === 'date'
        ? React.createElement(DateTimePicker, { placeholder })
        : React.createElement(SingleDateTimePicker, { placeholder, usePortal: false });
    await act(async () => root.render(React.createElement(ChakraProvider, null, picker())));
    expect(host.textContent).toContain('common:date_picker.placeholder');
    await act(async () =>
      root.render(React.createElement(ChakraProvider, null, picker('Custom date')))
    );
    expect(host.textContent).toContain('Custom date');
    await act(async () => root.unmount());
    host.remove();
  }
);

it.each(['date', 'date-time'])(
  'updates %s calendar labels when the UI language changes',
  async (kind) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const date = new Date(2026, 8, 11);
    const picker = () =>
      kind === 'date'
        ? React.createElement(DateTimePicker, { selectedDateTime: date })
        : React.createElement(SingleDateTimePicker, { value: date, usePortal: false });
    uiLanguage.language = 'zh-CN';
    await act(async () => root.render(React.createElement(ChakraProvider, null, picker())));
    const clear = host.querySelector<HTMLButtonElement>('button[aria-label="common:Clear"]');
    await act(async () => {
      clear?.parentElement?.click();
    });
    expect(document.body.textContent).toContain('9 月');
    uiLanguage.language = 'en-US';
    await act(async () => root.render(React.createElement(ChakraProvider, null, picker())));
    expect(document.body.textContent).toContain('September');
    expect(document.body.textContent).toContain('Su');
    await act(async () => {
      Array.from(document.body.querySelectorAll('button'))
        .find((button) => button.textContent === 'September')
        ?.click();
    });
    expect(
      Array.from(document.body.querySelectorAll('button')).some(
        (button) => button.textContent === 'Sep'
      )
    ).toBe(true);
    await act(async () => root.unmount());
    uiLanguage.language = 'zh-CN';
    host.remove();
  }
);
