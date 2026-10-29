import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@fastgpt/web/components/common/DateTimePicker', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Input/NumberInput', async () => {
  const { createElement } = await import('react');
  type NumberInputProps = {
    value?: string | number;
    min?: number;
    max?: number;
    onChange?: (value?: number) => void;
    onBlur?: (value?: number) => void;
  };
  const getNumberValue = (inputValue: string) =>
    inputValue === '' ? undefined : Number(inputValue);

  return {
    default: ({ value, min, max, onChange, onBlur }: NumberInputProps) =>
      createElement('input', {
        value: value ?? '',
        'data-min': min,
        'data-max': max,
        onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
          onChange?.(getNumberValue(event.target.value)),
        onBlur: (event: React.FocusEvent<HTMLInputElement>) => {
          const nextValue = getNumberValue(event.currentTarget.value);
          onBlur?.(nextValue);
          onChange?.(nextValue);
        }
      })
  };
});

describe('TimeInput deferred time parts', () => {
  let dom: JSDOM;
  let ChakraProvider: typeof import('@chakra-ui/react').ChakraProvider;
  let createRoot: typeof import('react-dom/client').createRoot;
  let TimeInput: typeof import('@/components/core/app/formRender/TimeInput').default;
  let root: import('react-dom/client').Root;
  let container: HTMLDivElement;
  let onDateTimeChange: ReturnType<typeof vi.fn>;

  const getInputs = () => Array.from(container.querySelectorAll<HTMLInputElement>('input'));
  const getCommittedValue = () => container.querySelector('[data-testid="committed"]')?.textContent;

  const updateInput = async (input: HTMLInputElement, value: string) => {
    await act(async () => {
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  const blurInput = async (input: HTMLInputElement) => {
    await act(async () => input.blur());
  };

  const Harness = () => {
    const [value, setValue] = React.useState(new Date(2024, 0, 2, 10, 20, 30));
    const handleChange = (date?: Date) => {
      onDateTimeChange(date);
      setValue(date);
    };

    return React.createElement(
      React.Fragment,
      null,
      React.createElement(
        'output',
        { 'data-testid': 'committed' },
        value
          ? [value.getHours(), value.getMinutes(), value.getSeconds()]
              .map((part) => String(part).padStart(2, '0'))
              .join(':')
          : 'empty'
      ),
      React.createElement(TimeInput, {
        value,
        onDateTimeChange: handleChange,
        timeGranularity: 'second'
      })
    );
  };

  beforeEach(async () => {
    dom = new JSDOM('<!doctype html><html><body></body></html>', {
      pretendToBeVisual: true,
      url: 'http://localhost'
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('navigator', dom.window.navigator);
    vi.stubGlobal('Element', dom.window.Element);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('HTMLInputElement', dom.window.HTMLInputElement);
    vi.stubGlobal('Node', dom.window.Node);
    vi.stubGlobal('Event', dom.window.Event);
    vi.stubGlobal('MouseEvent', dom.window.MouseEvent);
    vi.stubGlobal('getComputedStyle', dom.window.getComputedStyle.bind(dom.window));
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 0)
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

    ({ ChakraProvider } = await import('@chakra-ui/react'));
    ({ createRoot } = await import('react-dom/client'));
    TimeInput = (await import('@/components/core/app/formRender/TimeInput')).default;

    onDateTimeChange = vi.fn();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps edits local until blur and clamps each time part without overflow', async () => {
    await act(async () => {
      root.render(React.createElement(ChakraProvider, null, React.createElement(Harness)));
    });
    expect(getCommittedValue()).toBe('10:20:30');

    await updateInput(getInputs()[0]!, '24');
    expect(getCommittedValue()).toBe('10:20:30');
    expect(onDateTimeChange).not.toHaveBeenCalled();
    await blurInput(getInputs()[0]!);
    expect(getCommittedValue()).toBe('23:20:30');
    expect(getInputs()[0]!.value).toBe('23');

    await updateInput(getInputs()[0]!, '-1');
    expect(getCommittedValue()).toBe('23:20:30');
    await blurInput(getInputs()[0]!);
    expect(getCommittedValue()).toBe('00:20:30');
    expect(getInputs()[0]!.value).toBe('0');

    await updateInput(getInputs()[1]!, '60');
    expect(getCommittedValue()).toBe('00:20:30');
    await blurInput(getInputs()[1]!);
    expect(getCommittedValue()).toBe('00:59:30');
    expect(getInputs()[1]!.value).toBe('59');

    await updateInput(getInputs()[1]!, '-1');
    expect(getCommittedValue()).toBe('00:59:30');
    await blurInput(getInputs()[1]!);
    expect(getCommittedValue()).toBe('00:00:30');
    expect(getInputs()[1]!.value).toBe('0');

    await updateInput(getInputs()[2]!, '60');
    expect(getCommittedValue()).toBe('00:00:30');
    await blurInput(getInputs()[2]!);
    expect(getCommittedValue()).toBe('00:00:59');
    expect(getInputs()[2]!.value).toBe('59');

    await updateInput(getInputs()[2]!, '-1');
    expect(getCommittedValue()).toBe('00:00:59');
    await blurInput(getInputs()[2]!);
    expect(getCommittedValue()).toBe('00:00:00');
    expect(getInputs()[2]!.value).toBe('0');
    expect(onDateTimeChange).toHaveBeenCalledTimes(6);
  });

  it('shows zero for a NaN draft without committing it', async () => {
    await act(async () => {
      root.render(React.createElement(ChakraProvider, null, React.createElement(Harness)));
    });

    await updateInput(getInputs()[0]!, '-');

    expect(getInputs()[0]!.value).toBe('0');
    expect(getCommittedValue()).toBe('10:20:30');
    expect(onDateTimeChange).not.toHaveBeenCalled();
  });
});
