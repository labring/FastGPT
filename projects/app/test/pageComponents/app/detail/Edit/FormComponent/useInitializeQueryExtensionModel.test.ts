import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';
import { getDefaultAppForm } from '@fastgpt/global/core/app/utils';

const mocks = vi.hoisted(() => ({
  ready: true,
  defaultModelId: undefined as string | undefined,
  initialized: { current: undefined as string | undefined },
  effect: undefined as (() => void) | undefined
}));
vi.mock('@/web/core/ai/model/useModelDefault', () => ({
  useModelDefault: () => ({
    loaded: mocks.ready,
    model: mocks.defaultModelId ? { modelId: mocks.defaultModelId } : undefined
  })
}));
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useRef: () => mocks.initialized,
  useEffect: (effect: () => void) => {
    mocks.effect = effect;
  }
}));

import { useInitializeQueryExtensionModel } from '@/pageComponents/app/detail/Edit/FormComponent/useInitializeQueryExtensionModel';

describe('useInitializeQueryExtensionModel', () => {
  let form: AppFormEditFormType;
  const setAppForm = vi.fn((update: React.SetStateAction<AppFormEditFormType>) => {
    form = typeof update === 'function' ? update(form) : update;
  });
  const render = (
    overrides: Partial<Parameters<typeof useInitializeQueryExtensionModel>[0]> & {
      ready?: boolean;
      defaultModelId?: string;
    } = {}
  ) => {
    mocks.ready = overrides.ready ?? true;
    mocks.defaultModelId = 'defaultModelId' in overrides ? overrides.defaultModelId : 'default-llm';
    useInitializeQueryExtensionModel({
      appId: 'app',
      appForm: form,
      setAppForm,
      ...overrides
    });
    mocks.effect?.();
  };

  beforeEach(() => {
    mocks.initialized.current = undefined;
    mocks.effect = undefined;
    setAppForm.mockClear();
    form = getDefaultAppForm();
    form.dataset.datasetSearchUsingExtensionQuery = true;
  });

  it.each([undefined, null, '', ' \t '])('fills an enabled empty model once (%s)', (value) => {
    // 模拟旧表单可能携带的 null；生产类型仍只保存字符串 ID。
    form.dataset.datasetSearchExtensionModelId = value as string | undefined;
    const original = form;
    render();
    expect(form.dataset.datasetSearchExtensionModelId).toBe('default-llm');
    expect(form.aiSettings).toBe(original.aiSettings);
    expect(form.chatConfig).toBe(original.chatConfig);
    render();
    expect(setAppForm).toHaveBeenCalledTimes(1);
  });

  it('waits until catalog readiness and reads the latest form state', () => {
    render({ ready: false });
    expect(setAppForm).not.toHaveBeenCalled();
    form.dataset.datasetSearchExtensionModelId = 'user-selection';
    render();
    expect(form.dataset.datasetSearchExtensionModelId).toBe('user-selection');
  });

  it('does not fill a disabled feature, even if the user enables it later', () => {
    form.dataset.datasetSearchUsingExtensionQuery = false;
    const original = form;
    render();
    expect(form).toBe(original);
    form = { ...form, dataset: { ...form.dataset, datasetSearchUsingExtensionQuery: true } };
    render();
    expect(form.dataset.datasetSearchExtensionModelId).toBeUndefined();
    expect(setAppForm).not.toHaveBeenCalled();
  });

  it('does not overwrite an existing or unavailable nonempty ID', () => {
    form.dataset.datasetSearchExtensionModelId = 'deleted-model-id';
    const original = form;
    render();
    expect(form).toBe(original);
  });

  it('does not refill after clearing or after the default model changes', () => {
    render();
    form = { ...form, dataset: { ...form.dataset, datasetSearchExtensionModelId: '' } };
    render({ ready: false });
    render({ defaultModelId: 'another-default' });
    expect(form.dataset.datasetSearchExtensionModelId).toBe('');
    expect(setAppForm).toHaveBeenCalledTimes(1);
  });

  it('leaves the field empty if there is no default at the initial check', () => {
    render({ defaultModelId: undefined });
    render({ defaultModelId: 'later-default' });
    expect(form.dataset.datasetSearchExtensionModelId).toBeUndefined();
    expect(setAppForm).toHaveBeenCalledTimes(1);
  });

  it('initializes a different application independently', () => {
    render({ appId: '' });
    expect(setAppForm).not.toHaveBeenCalled();
    render();
    form = getDefaultAppForm();
    form.dataset.datasetSearchUsingExtensionQuery = true;
    render({ appId: 'another-app', defaultModelId: 'another-default' });
    expect(form.dataset.datasetSearchExtensionModelId).toBe('another-default');
    expect(setAppForm).toHaveBeenCalledTimes(2);
  });
});
