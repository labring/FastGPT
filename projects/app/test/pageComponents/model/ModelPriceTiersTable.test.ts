import { ModelPricingSchema } from '@fastgpt/global/core/ai/model/schema';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AIModelDocumentDataType,
  ModelPriceTierType
} from '@fastgpt/global/core/ai/model/schema';

vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

let dom: JSDOM;
let container: HTMLDivElement;
let root: import('react-dom/client').Root;
let createRoot: typeof import('react-dom/client').createRoot;
let ChakraProvider: typeof import('@chakra-ui/react').ChakraProvider;
let ModelPriceTiersTable: typeof import('@/pageComponents/model/ModelPriceTiersTable').default;
let form: UseFormReturn<AIModelDocumentDataType>;
const save = vi.fn();

const Fixture = ({ tiers }: { tiers: ModelPriceTierType[] }) => {
  const fixtureForm = useForm<AIModelDocumentDataType>({
    defaultValues: { pricing: { tiers } }
  });
  React.useEffect(() => {
    form = fixtureForm;
  }, [fixtureForm]);
  return React.createElement(
    ChakraProvider,
    null,
    React.createElement(
      'form',
      { onSubmit: fixtureForm.handleSubmit(save) },
      React.createElement(ModelPriceTiersTable, fixtureForm),
      React.createElement('button', { type: 'submit' }, 'save')
    )
  );
};

beforeAll(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
  for (const key of [
    'window',
    'document',
    'Element',
    'Node',
    'HTMLElement',
    'HTMLInputElement',
    'FileList',
    'Blob',
    'Event',
    'FocusEvent',
    'getComputedStyle',
    'requestAnimationFrame',
    'cancelAnimationFrame'
  ] as const) {
    vi.stubGlobal(key, key === 'window' ? dom.window : dom.window[key]);
  }
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }));
  // DOM 建立后再加载 ReactDOM，保留真实的输入、失焦和补档焦点行为。
  ({ createRoot } = await import('react-dom/client'));
  ({ ChakraProvider } = await import('@chakra-ui/react'));
  ({ default: ModelPriceTiersTable } = await import('@/pageComponents/model/ModelPriceTiersTable'));
});

beforeEach(() => {
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
afterAll(() => {
  dom.window.close();
  vi.unstubAllGlobals();
});

const render = async (tiers: ModelPriceTierType[] = [{ inputPrice: 2, outputPrice: 4 }]) => {
  await act(async () => root.render(React.createElement(Fixture, { tiers })));
};
const input = (key: string, row = 0) =>
  container.querySelectorAll<HTMLInputElement>(`input[name="pricing.tiers.${row}.${key}"]`)[0];

/** 使用原生输入事件验证 react-hook-form 的数字转换，避免仅测试 setValue。 */
const fill = async (key: string, value: string) => {
  const field = input(key);
  await act(async () => {
    field.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => field.blur());
};

describe('ModelPriceTiersTable', () => {
  it('rounds visible input and output prices while preserving precise tier boundaries', async () => {
    await render([{ maxInputTokens: 0.000125, inputPrice: 2, outputPrice: 4 }]);
    await fill('inputPrice', '0.125');
    await fill('outputPrice', '1.005');
    expect(input('inputPrice').value).toBe('0.13');
    expect(input('outputPrice').value).toBe('1.01');
    await act(async () => container.querySelector('form')!.requestSubmit());
    expect(ModelPricingSchema.parse(save.mock.calls[0][0].pricing).tiers![0]).toMatchObject({
      maxInputTokens: 0.000125,
      inputPrice: 0.13,
      outputPrice: 1.01
    });

    // 单档清空保留空行；重新填写上限后补一档，再清空原档应只留下新的空行。
    const clear = () => container.querySelector<HTMLButtonElement>('tbody button')!;
    await act(async () => clear().click());
    expect(form.getValues('pricing.tiers')).toEqual([
      { maxInputTokens: undefined, inputPrice: undefined, outputPrice: undefined }
    ]);
    await fill('maxInputTokens', '0.0041');
    await act(async () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    expect(form.getValues('pricing.tiers')).toHaveLength(2);
    expect(input('maxInputTokens').value).toBe('0.0041');
    await act(async () => clear().click());
    expect(form.getValues('pricing.tiers')).toEqual([
      { maxInputTokens: undefined, inputPrice: undefined, outputPrice: undefined }
    ]);
  });

  it('keeps cleared prices optional and explicit zero prices numeric', async () => {
    await render();
    await fill('inputPrice', '');
    await fill('outputPrice', '0');
    expect(form.getValues('pricing.tiers.0.inputPrice')).toBeUndefined();
    expect(form.getValues('pricing.tiers.0.outputPrice')).toBe(0);
  });
});
