// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FillRowTabs from '../../../../components/common/Tabs/FillRowTabs';

vi.mock('../../../../components/common/Icon', () => ({ default: () => null }));

describe('FillRowTabs', () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  it('uses native non-submit buttons and reports the selected value without duplicate changes', async () => {
    const change = vi.fn();
    const submit = vi.fn((event: React.FormEvent) => event.preventDefault());
    const Fixture = () => {
      const [value, setValue] = React.useState('app');
      return React.createElement(
        'form',
        { onSubmit: submit },
        React.createElement(FillRowTabs, {
          'aria-label': 'Key type',
          value,
          list: [
            { value: 'app', label: 'App key' },
            { value: 'personal', label: 'Personal key' }
          ],
          onChange: (next: string) => {
            change(next);
            setValue(next);
          }
        })
      );
    };
    await act(async () =>
      root.render(React.createElement(ChakraProvider, null, React.createElement(Fixture)))
    );
    expect(host.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Key type');
    const buttons = host.querySelectorAll('button');
    expect([...buttons].map((button) => button.type)).toEqual(['button', 'button']);
    expect([...buttons].map((button) => button.getAttribute('aria-pressed'))).toEqual([
      'true',
      'false'
    ]);
    buttons[1].focus();
    await act(async () => buttons[1].click());
    expect(change).toHaveBeenCalledExactlyOnceWith('personal');
    expect(document.activeElement).toBe(buttons[1]);
    expect([...buttons].map((button) => button.getAttribute('aria-pressed'))).toEqual([
      'false',
      'true'
    ]);
    await act(async () => buttons[1].click());
    expect(change).toHaveBeenCalledTimes(1);
    expect(submit).not.toHaveBeenCalled();
  });

  it('preserves the forwarded ref and saved horizontal position after a remount', async () => {
    const ref = React.createRef<HTMLDivElement>();
    const render = async (key: string) =>
      act(async () =>
        root.render(
          React.createElement(
            ChakraProvider,
            null,
            React.createElement(FillRowTabs, {
              key,
              ref,
              scrollPositionKey: 'keyboard-regression',
              value: 'app',
              list: [{ value: 'app', label: 'App key' }],
              onChange: () => {}
            })
          )
        )
      );
    await render('first');
    expect(ref.current).toBe(host.querySelector('[role="group"]'));
    ref.current!.scrollLeft = 85;
    await act(async () => ref.current!.dispatchEvent(new Event('scroll')));
    await render('second');
    expect(ref.current!.scrollLeft).toBe(85);
  });
});
