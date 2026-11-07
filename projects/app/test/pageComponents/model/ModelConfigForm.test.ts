import { ModelPricingSchema } from '@fastgpt/global/core/ai/model/schema';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { AIModelDocumentDataType } from '@fastgpt/global/core/ai/model/schema';

vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => ({ feConfigs: { isPlus: true } })
}));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: (callback: unknown) => ({ runAsync: callback, loading: false })
}));
// 只隔离无关的选择器、提示和编辑器；价格输入、Chakra、表单与保存规范化均执行真实代码。
vi.mock('@fastgpt/web/components/common/MySelect', () => ({
  default: React.forwardRef(function SelectFixture(_props, _ref) {
    return null;
  })
}));
vi.mock('@fastgpt/web/components/common/MySelect/MultipleSelect', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Textarea/JsonEditor', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyTooltip/QuestionTip', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Avatar', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));

let dom: JSDOM;
let root: import('react-dom/client').Root;
let container: HTMLDivElement;
let createRoot: typeof import('react-dom/client').createRoot;
let ChakraProvider: typeof import('@chakra-ui/react').ChakraProvider;
let ModelConfigForm: typeof import('@/pageComponents/model/ModelConfigForm').default;
const save = vi.fn(async (_data: AIModelDocumentDataType) => undefined);

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
    const value = key === 'window' ? dom.window : dom.window[key];
    vi.stubGlobal(key, value);
  }
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches: false,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {}
  }));
  // 必须在 DOM 建立后加载 ReactDOM，保留浏览器真实 input/change 事件路径。
  ({ createRoot } = await import('react-dom/client'));
  ({ ChakraProvider } = await import('@chakra-ui/react'));
  ({ default: ModelConfigForm } = await import('@/pageComponents/model/ModelConfigForm'));
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  save.mockClear();
});
afterAll(() => {
  dom.window.close();
  vi.unstubAllGlobals();
});

/** 通过完整配置表单验证真实综合价控件，不单独复制控件参数或舍入逻辑。 */
const render = async (type: ModelTypeEnum, unitPrice = 0) => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const config =
    type === ModelTypeEnum.embedding
      ? { batchSize: 64, defaultToken: 512, maxToken: 8192 }
      : type === ModelTypeEnum.rerank
        ? { maxToken: 8192 }
        : type === ModelTypeEnum.tts
          ? { voices: [{ label: 'Default', value: 'default' }] }
          : {};
  await act(async () =>
    root.render(
      React.createElement(
        ChakraProvider,
        null,
        React.createElement(ModelConfigForm, {
          modelData: {
            type,
            provider: 'openai',
            model: 'price-model',
            name: 'Price model',
            scope: ModelScopeEnum.system,
            config,
            pricing: { unitPrice }
          } as AIModelDocumentDataType,
          providers: [],
          formId: 'price-form',
          onSubmit: save
        })
      )
    )
  );
  return container.querySelector<HTMLInputElement>('input[name="pricing.unitPrice"]')!;
};

const fillAndBlur = async (field: HTMLInputElement, value: string) => {
  await act(async () => {
    field.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => field.blur());
};

describe('ModelConfigForm comprehensive price', () => {
  it.each([
    [ModelTypeEnum.embedding, '1.005', 1.01, '/ M Tokens'],
    [ModelTypeEnum.rerank, '1.005', 1.01, '/ M Tokens'],
    [ModelTypeEnum.tts, '2.675', 2.68, '/ 1M common:unit.character'],
    [ModelTypeEnum.stt, '1.005', 1.01, '/ 60 common:unit.seconds']
  ] as const)(
    'keeps %s price display and submission consistent at a decimal midpoint',
    async (type, source, expected, unit) => {
      const field = await render(type);
      await fillAndBlur(field, source);
      expect(field.value).toBe(String(expected));
      expect(field.checkValidity()).toBe(true);
      expect(container.textContent).toContain(unit);
      await act(async () => container.querySelector('form')!.requestSubmit());
      await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());
      expect(ModelPricingSchema.parse(save.mock.calls[0][0].pricing).unitPrice).toBe(expected);
    }
  );

  it('preserves explicit free prices and omitted prices after clearing the input', async () => {
    const field = await render(ModelTypeEnum.stt, 0.125);
    expect(field.value).toBe('0.13');
    expect(field.checkValidity()).toBe(true);
    await fillAndBlur(field, '0');
    await act(async () => container.querySelector('form')!.requestSubmit());
    await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(ModelPricingSchema.parse(save.mock.calls[0][0].pricing).unitPrice).toBe(0);
    save.mockClear();
    await fillAndBlur(field, '');
    expect(field.value).toBe('');
    await act(async () => container.querySelector('form')!.requestSubmit());
    await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0]).not.toHaveProperty('pricing.unitPrice');
  });
});
