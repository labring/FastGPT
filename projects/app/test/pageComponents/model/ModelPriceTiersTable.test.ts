import { ModelPricingSchema } from '@fastgpt/global/core/ai/model/schema';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { createRoot, type Root } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AIModelDocumentDataType,
  ModelPriceTierType
} from '@fastgpt/global/core/ai/model/schema';
import ModelPriceTiersTable from '@/pageComponents/model/ModelPriceTiersTable';

vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

// 样式由真实浏览器验证；这里保留原生 DOM 和真实 react-hook-form，专门验证编辑与保存行为。
vi.mock('@chakra-ui/react', () => {
  const element = (tag: string) =>
    React.forwardRef<HTMLElement, Record<string, any>>(function Element(
      { children, ...props },
      ref
    ) {
      return React.createElement(
        tag,
        {
          ref,
          type: props.type ?? (tag === 'button' ? 'button' : undefined),
          name: props.name,
          value: props.value,
          step: props.step,
          min: props.min,
          placeholder: props.placeholder,
          disabled: props.disabled ?? props.isDisabled,
          'aria-label': props['aria-label'],
          onInput: props.onChange,
          onBlur: props.onBlur,
          onClick: props.onClick,
          style: { minWidth: props.minW, width: props.w }
        },
        children
      );
    });
  return {
    ChakraProvider: ({ children }: React.PropsWithChildren) => children,
    ...Object.fromEntries(
      Object.entries({
        Box: 'div',
        Flex: 'div',
        Input: 'input',
        Button: 'button',
        Table: 'table',
        Thead: 'thead',
        Tbody: 'tbody',
        Tr: 'tr',
        Th: 'th',
        Td: 'td'
      }).map(([name, tag]) => [name, element(tag)])
    )
  };
});

let dom: JSDOM;
let container: HTMLDivElement;
let root: Root;
let form: UseFormReturn<AIModelDocumentDataType>;
const save = vi.fn();

const Fixture = ({ tiers }: { tiers: ModelPriceTierType[] }) => {
  const fixtureForm = useForm<AIModelDocumentDataType>({
    defaultValues: { pricing: { tiers: tiers } }
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

beforeEach(() => {
  vi.clearAllMocks();
  dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('FileList', dom.window.FileList);
  vi.stubGlobal('Blob', dom.window.Blob);
  vi.stubGlobal('HTMLInputElement', dom.window.HTMLInputElement);
  vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
  vi.stubGlobal('Event', dom.window.Event);
  vi.stubGlobal('getComputedStyle', dom.window.getComputedStyle);
  vi.stubGlobal('requestAnimationFrame', dom.window.requestAnimationFrame);
  vi.stubGlobal('cancelAnimationFrame', dom.window.cancelAnimationFrame);
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
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
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
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new dom.window.FocusEvent('focusout', { bubbles: true }));
  });
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
  });

  it('keeps cleared prices optional and explicit zero prices numeric', async () => {
    await render();
    await fill('inputPrice', '');
    await fill('outputPrice', '0');
    expect(form.getValues('pricing.tiers.0.inputPrice')).toBeUndefined();
    expect(form.getValues('pricing.tiers.0.outputPrice')).toBe(0);
  });
});
