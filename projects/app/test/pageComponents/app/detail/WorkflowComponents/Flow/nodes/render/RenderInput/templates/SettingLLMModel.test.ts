import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { Input_Template_SettingAiModel } from '@fastgpt/global/core/workflow/template/input';

const mocks = vi.hoisted(() => ({
  effects: [] as (() => void)[],
  nodeInputs: [] as Record<string, unknown>[],
  updateNode: vi.fn(),
  remember: vi.fn(),
  remembered: 'remembered'
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
vi.mock('@/web/core/workflow/editor/react/useNode', () => ({
  useNode: () => ({ data: { inputs: mocks.nodeInputs }, updateNode: mocks.updateNode }),
  useNodeActions: () => ({ updateNode: mocks.updateNode })
}));
vi.mock('@/web/core/workflow/editor/react/useField', () => ({
  useField: () => undefined
}));
vi.mock('@/components/core/ai/SettingLLMModel', () => ({ default: 'model-settings' }));
import Wrapper from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/RenderInput/templates/SettingLLMModel';

describe('workflow model initialization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.effects = [];
    mocks.remembered = 'remembered';
    mocks.nodeInputs = [];
  });
  const render = (inputs: Record<string, unknown>[]) => {
    mocks.effects = [];
    mocks.nodeInputs = inputs;
    return (Wrapper as any).type({ nodeId: 'node', inputs }).props;
  };
  /** 写入统一走整份 inputs 提交：patch 是函数，用当前文档记录求值后取数组断言。 */
  const submittedInputs = () =>
    mocks.updateNode.mock.calls[0][0]({ inputs: mocks.nodeInputs }).inputs;
  it.each([undefined, '', null])(
    'does not initialize a model or change remembered selection on mount (%s)',
    (value) => {
      const input = { ...Input_Template_SettingAiModel, value };
      const props = render([input]);
      expect(props.defaultData.modelId).toBe(value);
      expect(props).not.toHaveProperty('autoInitializeModel');
      expect(mocks.updateNode).not.toHaveBeenCalled();
      mocks.effects.forEach((effect) => effect());
      expect(mocks.updateNode).not.toHaveBeenCalled();
      expect(mocks.remember).not.toHaveBeenCalled();

      props.onChange({ modelId: 'remembered' });
      expect(mocks.remember).toHaveBeenCalledWith('remembered');
      expect(submittedInputs()).toEqual([
        { ...Input_Template_SettingAiModel, value: 'remembered' }
      ]);
      expect(render(submittedInputs()).defaultData.modelId).toBe('remembered');
    }
  );
  it('creates a missing model input only when the user selects a model', () => {
    const props = render([]);
    expect(props.defaultData.modelId).toBeUndefined();
    mocks.effects.forEach((effect) => effect());
    expect(mocks.updateNode).not.toHaveBeenCalled();

    props.onChange({ modelId: 'remembered' });
    expect(submittedInputs()).toEqual([{ ...Input_Template_SettingAiModel, value: 'remembered' }]);
    expect(render(submittedInputs()).defaultData.modelId).toBe('remembered');
  });
  it('preserves invalid values and leaves empty choices unchanged', () => {
    expect(
      render([{ ...Input_Template_SettingAiModel, value: 'deleted' }]).defaultData.modelId
    ).toBe('deleted');
    mocks.effects.forEach((effect) => effect());
    expect(mocks.updateNode).not.toHaveBeenCalled();
    expect(render([]).defaultData.modelId).toBeUndefined();
  });
  it('renames a legacy model input in one whole-array submit', () => {
    const legacyInput = {
      ...Input_Template_SettingAiModel,
      key: NodeInputKeyEnum.aiModel,
      value: 'system-name'
    };
    const props = render([legacyInput]);
    expect(props.defaultData.modelId).toBe('system-name');
    mocks.effects.forEach((effect) => effect());
    expect(mocks.updateNode).not.toHaveBeenCalled();

    props.onChange({ modelId: 'system-default' });
    expect(submittedInputs()).toEqual([
      { ...legacyInput, key: NodeInputKeyEnum.aiModelId, value: 'system-default' }
    ]);
  });
  it('never replaces missing or configured values from remembered storage during rendering', () => {
    mocks.remembered = 'deleted';
    render([]);
    mocks.effects.forEach((effect) => effect());
    expect(mocks.updateNode).not.toHaveBeenCalled();
    mocks.updateNode.mockClear();
    render([{ ...Input_Template_SettingAiModel, value: 'remembered' }]);
    mocks.effects.forEach((effect) => effect());
    expect(mocks.updateNode).not.toHaveBeenCalled();
  });
});
