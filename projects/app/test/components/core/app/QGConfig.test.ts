import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppQGConfigType } from '@fastgpt/global/core/app/type';

const mocks = vi.hoisted(() => ({
  effects: [] as (() => void)[],
  toggle: undefined as ((event: { target: { checked: boolean } }) => void) | undefined,
  select: vi.fn(),
  models: [] as { modelId: string; model: string; isActive: boolean }[]
}));
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useEffect: (fn: () => void) => {
    mocks.effects.push(fn);
  }
}));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/web/core/ai/model/modelData', () => ({
  getModelDefault: vi.fn(async () => mocks.models[0])
}));
vi.mock('@chakra-ui/react', async () => {
  const Element = ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', {}, children);
  return {
    Box: Element,
    Button: Element,
    Flex: Element,
    Switch: ({ onChange }: { onChange: typeof mocks.toggle }) => {
      mocks.toggle = onChange;
      return null;
    },
    useDisclosure: () => ({ isOpen: true, onOpen: vi.fn(), onClose: vi.fn() })
  };
});
vi.mock('@fastgpt/web/components/v2/common/MyModal', () => ({
  default: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('@/components/core/app/AppConfigItem', () => ({
  default: ({ action }: { action: React.ReactNode }) => action,
  AppConfigItemAction: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('@/components/core/app/Tip', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyTooltip/QuestionTip', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Textarea/CustomPromptEditor', () => ({
  default: () => null
}));
vi.mock('@/components/Select/AIModelSelector', () => ({
  default: (props: unknown) => {
    mocks.select(props);
    return null;
  }
}));
import QGConfig from '@/components/core/app/QGConfig';

describe('QGConfig toggle-time model initialization', async () => {
  beforeEach(() => {
    mocks.effects = [];
    mocks.toggle = undefined;
    mocks.select.mockClear();
    mocks.models = [{ modelId: 'default-id', model: 'default-name', isActive: true }];
  });
  const render = (value: AppQGConfigType, onChange = vi.fn()) => {
    renderToStaticMarkup(React.createElement(QGConfig, { value, onChange }));
    mocks.effects.forEach((effect) => effect());
    return onChange;
  };
  it.each([false, true])(
    'does not write a default during initialization, even when open=%s',
    (open) => {
      const onChange = render({ open });
      expect(onChange).not.toHaveBeenCalled();
      if (open)
        expect(mocks.select).toHaveBeenCalledWith(expect.objectContaining({ value: undefined }));
    }
  );
  it('writes the default with the off-to-on toggle and displays the saved value', async () => {
    const onChange = render({ open: false });
    await mocks.toggle?.({ target: { checked: true } });
    expect(onChange).toHaveBeenLastCalledWith({
      open: true,
      modelId: 'default-id',
      model: undefined
    });
    mocks.select.mockClear();
    render(onChange.mock.calls.at(-1)![0]);
    expect(mocks.select).toHaveBeenCalledWith(expect.objectContaining({ value: 'default-id' }));
  });
  it('keeps the selected model when enabling and disabling the feature', async () => {
    const onChange = render({ open: false, modelId: 'saved-id' });
    await mocks.toggle?.({ target: { checked: true } });
    expect(onChange).toHaveBeenLastCalledWith({ open: true, modelId: 'saved-id' });
    const disabled = render({ open: true, modelId: 'saved-id' });
    await mocks.toggle?.({ target: { checked: false } });
    expect(disabled).toHaveBeenLastCalledWith({ open: false, modelId: 'saved-id' });
  });
  it('does not invent a default when no usable model is cached', async () => {
    mocks.models = [];
    const onChange = render({ open: false });
    await mocks.toggle?.({ target: { checked: true } });
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ open: true });
  });
  it('does not initialize an already-on switch again', async () => {
    const onChange = render({ open: true });
    await mocks.toggle?.({ target: { checked: true } });
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ open: true });
  });
});
