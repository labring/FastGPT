import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { Input_Template_SettingAiModel } from '@fastgpt/global/core/workflow/template/input';

const mocks = vi.hoisted(() => ({
  effects: [] as (() => void)[],
  change: vi.fn(),
  remember: vi.fn(),
  remembered: 'remembered',
  models: [] as { modelId: string; model: string; isActive: boolean }[]
}));
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useCallback: (fn: unknown) => fn,
  useEffect: (fn: () => void) => {
    mocks.effects.push(fn);
  }
}));
vi.mock('@fastgpt/web/hooks/useMemoEnhance', () => ({
  useMemoEnhance: (fn: () => unknown) => fn()
}));
vi.mock('ahooks', () => ({ useLocalStorageState: () => [mocks.remembered, mocks.remember] }));
vi.mock('use-context-selector', () => ({
  useContextSelector: (_: unknown, select: (value: unknown) => unknown) =>
    select({ onChangeNode: mocks.change })
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/context/workflowActionsContext', () => ({
  WorkflowActionsContext: {}
}));
vi.mock('@/components/core/ai/SettingLLMModel', () => ({ default: 'model-settings' }));
import Wrapper from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/RenderInput/templates/SettingLLMModel';

describe('workflow model initialization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.effects = [];
    mocks.remembered = 'remembered';
    mocks.models = [
      { modelId: 'system-default', model: 'system-name', isActive: true },
      { modelId: 'remembered', model: 'remembered-name', isActive: true }
    ];
  });
  const render = (inputs: unknown[]) => {
    mocks.effects = [];
    return (Wrapper as any).type({ nodeId: 'node', inputs }).props;
  };
  it.each([undefined, '', null])(
    'does not initialize a model or change remembered selection on mount (%s)',
    (value) => {
      const input = { ...Input_Template_SettingAiModel, value };
      const props = render([input]);
      expect(props.defaultData.modelId).toBe(value);
      expect(props).not.toHaveProperty('autoInitializeModel');
      expect(mocks.change).not.toHaveBeenCalled();
      mocks.effects.forEach((effect) => effect());
      expect(mocks.change).not.toHaveBeenCalled();
      expect(mocks.remember).not.toHaveBeenCalled();
      props.onChange({ modelId: 'remembered' });
      const update = mocks.change.mock.calls[0][0][0];
      expect(update).toMatchObject({
        type: 'updateInput',
        key: NodeInputKeyEnum.aiModelId,
        value: { value: 'remembered' }
      });
      expect(render([update.value]).defaultData.modelId).toBe('remembered');
    }
  );
  it('creates a missing model input only when the user selects a model', () => {
    const props = render([]);
    expect(props.defaultData.modelId).toBeUndefined();
    mocks.effects.forEach((effect) => effect());
    expect(mocks.change).not.toHaveBeenCalled();
    props.onChange({ modelId: 'remembered' });
    const update = mocks.change.mock.calls[0][0];
    expect(update).toMatchObject({
      type: 'addInput',
      value: { key: NodeInputKeyEnum.aiModelId, value: 'remembered' }
    });
    expect(render([update.value]).defaultData.modelId).toBe('remembered');
  });
  it('preserves invalid values and leaves empty choices unchanged when no model is available', () => {
    expect(
      render([{ ...Input_Template_SettingAiModel, value: 'deleted' }]).defaultData.modelId
    ).toBe('deleted');
    mocks.effects.forEach((effect) => effect());
    expect(mocks.change).not.toHaveBeenCalled();
    mocks.models = [];
    expect(render([]).defaultData.modelId).toBeUndefined();
    mocks.effects.forEach((effect) => effect());
    expect(mocks.change).not.toHaveBeenCalled();
  });
  it('updates legacy inputs only after an explicit selection', () => {
    const props = render([
      { ...Input_Template_SettingAiModel, key: NodeInputKeyEnum.aiModel, value: 'system-name' }
    ]);
    expect(
      render([
        { ...Input_Template_SettingAiModel, key: NodeInputKeyEnum.aiModel, value: 'system-name' }
      ]).defaultData.modelId
    ).toBe('system-name');
    mocks.effects.forEach((effect) => effect());
    expect(mocks.change).not.toHaveBeenCalled();
    props.onChange({ modelId: 'system-default' });
    expect(mocks.change).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'replaceInput',
        value: expect.objectContaining({ key: NodeInputKeyEnum.aiModelId, value: 'system-default' })
      })
    );
  });
  it('never replaces missing or configured values from remembered storage during rendering', () => {
    mocks.remembered = 'deleted';
    render([]);
    mocks.effects.forEach((effect) => effect());
    expect(mocks.change).not.toHaveBeenCalled();
    mocks.change.mockClear();
    render([{ ...Input_Template_SettingAiModel, value: 'remembered' }]);
    mocks.effects.forEach((effect) => effect());
    expect(mocks.change).not.toHaveBeenCalled();
  });
});
