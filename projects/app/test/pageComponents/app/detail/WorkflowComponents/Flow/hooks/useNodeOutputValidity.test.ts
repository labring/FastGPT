import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Node } from 'reactflow';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { MyLLMModelItemType } from '@fastgpt/global/openapi/core/ai/model/api';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { AiChatModule } from '@fastgpt/global/core/workflow/template/system/aiChat';
import { useNodeOutputValidity } from '@/pageComponents/app/detail/WorkflowComponents/Flow/hooks/useNodeOutputValidity';
import { filterSelectableWorkflowNodeOutputs, storeNode2FlowNode } from '@/web/core/workflow/utils';
import type { TFunction } from 'next-i18next';

const mocks = vi.hoisted(() => ({
  nodes: [] as Node<FlowNodeItemType>[],
  effect: undefined as (() => void) | undefined,
  detail: vi.fn(),
  setNodes: vi.fn()
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useEffect: (effect: () => void) => {
    mocks.effect = effect;
  }
}));
vi.mock('use-context-selector', () => ({
  useContextSelector: (_context: unknown, selector: (state: unknown) => unknown) =>
    selector({ nodes: mocks.nodes, setNodes: mocks.setNodes })
}));
vi.mock('@/pageComponents/app/detail/WorkflowComponents/context/workflowInitContext', () => ({
  WorkflowInitContext: {},
  WorkflowBufferDataContext: {}
}));
vi.mock('@/web/core/ai/model/useModelDetail', () => ({ useModelDetail: mocks.detail }));

const model: MyLLMModelItemType = {
  modelId: 'reasoning-model',
  model: 'legacy-model',
  name: 'Reasoning',
  provider: 'test',
  type: ModelTypeEnum.llm,
  scope: 'system',
  isActive: true,
  isCustom: false,
  config: { maxContext: 4096, maxResponse: 1024, quoteMaxToken: 2000, reasoning: true }
};
const selectable = () =>
  filterSelectableWorkflowNodeOutputs({ outputs: mocks.nodes[0].data.outputs }).map(
    (output) => output.key
  );
const run = () => {
  useNodeOutputValidity('chat');
  mocks.effect?.();
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.nodes = [
    storeNode2FlowNode({
      item: {
        ...AiChatModule,
        nodeId: 'chat',
        isFolded: true,
        inputs: AiChatModule.inputs.map((input) =>
          input.key === NodeInputKeyEnum.aiModelId ? { ...input, value: model.modelId } : input
        )
      },
      t: ((value: string) => value) as TFunction
    })
  ];
  mocks.effect = undefined;
  mocks.detail.mockReturnValue({ model, loading: false });
  mocks.setNodes.mockImplementation(
    (update: (nodes: Node<FlowNodeItemType>[]) => Node<FlowNodeItemType>[]) => {
      mocks.nodes = update(mocks.nodes);
    }
  );
});

describe('useNodeOutputValidity', () => {
  it('makes restored folded reasoning output selectable without mounting RenderOutput', () => {
    mocks.nodes.push({ ...mocks.nodes[0], id: 'other' });
    const other = mocks.nodes[1];
    expect(selectable()).not.toContain(NodeOutputKeyEnum.reasoningText);
    run();
    expect(mocks.nodes[1]).toBe(other);
    expect(mocks.nodes[0].data.isFolded).toBe(true);
    expect(selectable()).toContain(NodeOutputKeyEnum.reasoningText);
    const nodes = mocks.nodes;
    run();
    expect(mocks.nodes).toBe(nodes);
  });

  it('removes reasoning output after selecting a non-reasoning model', () => {
    run();
    mocks.detail.mockReturnValue({
      model: { ...model, config: { ...model.config, reasoning: false } },
      loading: false
    });
    run();
    expect(selectable()).not.toContain(NodeOutputKeyEnum.reasoningText);
  });

  it.each([{ loading: true }, { loading: false, error: new Error('offline') }])(
    'preserves output while detail is unavailable: %o',
    (state) => {
      run();
      const nodes = mocks.nodes;
      mocks.detail.mockReturnValue(state);
      run();
      expect(mocks.nodes).toBe(nodes);
      expect(selectable()).toContain(NodeOutputKeyEnum.reasoningText);
    }
  );

  it('invalidates output when the selected model is confirmed missing', () => {
    run();
    mocks.detail.mockReturnValue({ loading: false, model: undefined });
    run();
    expect(selectable()).not.toContain(NodeOutputKeyEnum.reasoningText);
  });

  it('does not write after the node is removed or its inputs change', () => {
    useNodeOutputValidity('chat');
    const removed = (mocks.nodes = []);
    mocks.effect?.();
    expect(mocks.nodes).toBe(removed);
  });

  it('rejects a stale update after input editing and preserves concurrent output edits', () => {
    useNodeOutputValidity('chat');
    mocks.nodes = mocks.nodes.map((node) => ({
      ...node,
      data: { ...node.data, inputs: [...node.data.inputs] }
    }));
    const edited = mocks.nodes;
    mocks.effect?.();
    expect(mocks.nodes).toBe(edited);
    useNodeOutputValidity('chat');
    mocks.nodes = mocks.nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        outputs: node.data.outputs.map((output) => ({ ...output, label: 'edited' }))
      }
    }));
    mocks.effect?.();
    expect(selectable()).toContain(NodeOutputKeyEnum.reasoningText);
    expect(mocks.nodes[0].data.outputs.every((output) => output.label === 'edited')).toBe(true);
  });

  it('skips absent nodes and nodes without conditional outputs', () => {
    mocks.nodes = [];
    run();
    expect(mocks.setNodes).not.toHaveBeenCalled();
    mocks.nodes = [
      {
        id: 'chat',
        position: { x: 0, y: 0 },
        data: { ...AiChatModule, nodeId: 'chat', outputs: [] }
      }
    ];
    run();
    expect(mocks.setNodes).not.toHaveBeenCalled();
    expect(mocks.detail).toHaveBeenLastCalledWith({
      modelType: ModelTypeEnum.llm,
      modelId: undefined,
      model: undefined
    });
  });
});
