import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Input_Template_SelectAIModel } from '@fastgpt/global/core/workflow/template/input';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

const mocks = vi.hoisted(() => ({
  effects: [] as (() => void)[],
  nodeInputs: [] as { key: string; value?: unknown }[],
  updateNode: vi.fn(),
  setValue: vi.fn(),
  remember: vi.fn()
}));
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useCallback: (fn: unknown) => fn,
  useMemo: (fn: () => unknown) => fn(),
  useContext: () => undefined,
  useEffect: (fn: () => void) => {
    mocks.effects.push(fn);
  }
}));
vi.mock('ahooks', () => ({ useLocalStorageState: () => ['remembered-id', mocks.remember] }));
vi.mock('@fastgpt/web/hooks/useMemoEnhance', () => ({
  useMemoEnhance: (fn: () => unknown) => fn()
}));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('use-context-selector', async (importOriginal) => ({
  ...(await importOriginal<typeof import('use-context-selector')>()),
  useContextSelector: (_: unknown, select: (data: unknown) => unknown) => select({ appDetail: {} })
}));
vi.mock('@/web/core/workflow/editor/react/useNode', () => ({
  useNode: () => ({
    data: { inputs: mocks.nodeInputs, flowNodeType: 'answerNode' },
    updateNode: mocks.updateNode
  }),
  useNodeActions: () => ({ updateNode: mocks.updateNode })
}));
vi.mock('@/web/core/workflow/editor/react/useField', () => ({
  useField: () => ({ data: {}, reference: [], setValue: mocks.setValue })
}));
vi.mock(
  '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/useWorkflowDocument',
  () => ({
    useNodeWorkflowDocument: () => ({
      workflow: undefined,
      getNodeById: () => undefined,
      graph: undefined
    })
  })
);
vi.mock('@/pageComponents/app/detail/context', () => ({ AppContext: {} }));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/utils', () => ({
  getEditorVariables: () => []
}));
vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => ({ feConfigs: {} })
}));
vi.mock('@/components/core/app/formRender', () => ({ default: 'input-render' }));
vi.mock('@/components/common/PromptEditor/OptimizerPopover', () => ({ default: () => null }));
import CommonInputForm from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/RenderInput/templates/CommonInputForm';

/** 组件外层是 data-workflow-history 包裹层，InputRender 元素挂在 children 上。 */
const renderInputProps = (element: any) => element.props.children.props.children.props;

describe('CommonInputForm model selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.effects = [];
    mocks.nodeInputs = [];
  });
  it.each([undefined, null, '', 'configured-id'])(
    'does not initialize or remember a model when mounted (%s)',
    (value) => {
      const element = (CommonInputForm as any).type({
        nodeId: 'node',
        item: { ...Input_Template_SelectAIModel, value }
      });
      expect(renderInputProps(element).value).toBe(value);
      mocks.effects.forEach((effect) => effect());
      expect(mocks.setValue).not.toHaveBeenCalled();
      expect(mocks.updateNode).not.toHaveBeenCalled();
      expect(mocks.remember).not.toHaveBeenCalled();
    }
  );
  it('writes and remembers only an explicit model selection', () => {
    const element = (CommonInputForm as any).type({
      nodeId: 'node',
      item: { ...Input_Template_SelectAIModel }
    });
    renderInputProps(element).onChange('chosen-id');
    expect(mocks.remember).toHaveBeenCalledWith('chosen-id');
    // 字段值写入只走字段句柄，不整份提交 inputs。
    expect(mocks.setValue).toHaveBeenCalledWith('chosen-id');
    expect(mocks.updateNode).not.toHaveBeenCalled();
  });
  it('renames a legacy model field by submitting the whole inputs array', () => {
    mocks.nodeInputs = [
      { key: NodeInputKeyEnum.aiModel, value: 'old' },
      { key: 'keep', value: 1 }
    ];
    const element = (CommonInputForm as any).type({
      nodeId: 'node',
      item: {
        key: NodeInputKeyEnum.aiModel,
        renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel],
        value: 'old'
      }
    });
    renderInputProps(element).onChange('chosen-id');
    // 记录级改名：以派发瞬间的 inputs 为基线，只改命中的那条，整份一次提交。
    expect(mocks.updateNode.mock.calls[0][0]({ inputs: mocks.nodeInputs })).toEqual({
      inputs: [
        { key: NodeInputKeyEnum.aiModelId, value: 'chosen-id' },
        { key: 'keep', value: 1 }
      ]
    });
    expect(mocks.setValue).not.toHaveBeenCalled();
  });
});
