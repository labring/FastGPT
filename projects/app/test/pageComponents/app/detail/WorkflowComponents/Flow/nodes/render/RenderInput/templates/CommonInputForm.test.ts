import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Input_Template_SelectAIModel } from '@fastgpt/global/core/workflow/template/input';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';

const mocks = vi.hoisted(() => ({
  effects: [] as (() => void)[],
  change: vi.fn(),
  remember: vi.fn()
}));
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useCallback: (fn: unknown) => fn,
  useMemo: (fn: () => unknown) => fn(),
  useEffect: (fn: () => void) => {
    mocks.effects.push(fn);
  }
}));
vi.mock('ahooks', () => ({ useLocalStorageState: () => ['remembered-id', mocks.remember] }));
vi.mock('@fastgpt/web/hooks/useMemoEnhance', () => ({
  useMemoEnhance: (fn: () => unknown) => fn()
}));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('use-context-selector', () => ({
  useContextSelector: (_: unknown, select: (data: unknown) => unknown) =>
    select({ onChangeNode: mocks.change, getNodeById: () => undefined, edges: [], appDetail: {} })
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/context/workflowActionsContext', () => ({
  WorkflowActionsContext: {}
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/context/workflowInitContext', () => ({
  WorkflowBufferDataContext: {}
}));
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

describe('CommonInputForm model selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.effects = [];
  });
  it.each([undefined, null, '', 'configured-id'])(
    'does not initialize or remember a model when mounted (%s)',
    (value) => {
      const element = (CommonInputForm as any).type({
        nodeId: 'node',
        item: { ...Input_Template_SelectAIModel, value }
      });
      expect(element.props.value).toBe(value);
      mocks.effects.forEach((effect) => effect());
      expect(mocks.change).not.toHaveBeenCalled();
      expect(mocks.remember).not.toHaveBeenCalled();
    }
  );
  it('writes and remembers only an explicit model selection', () => {
    const element = (CommonInputForm as any).type({
      nodeId: 'node',
      item: { ...Input_Template_SelectAIModel }
    });
    element.props.onChange('chosen-id');
    expect(mocks.remember).toHaveBeenCalledWith('chosen-id');
    expect(mocks.change).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'updateInput',
        key: NodeInputKeyEnum.aiModelId,
        value: expect.objectContaining({ value: 'chosen-id' })
      })
    );
  });
});
