import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  FlowNodeInputItemType,
  FlowNodeOutputItemType
} from '@fastgpt/global/core/workflow/type/io';
import type { MyLLMModelItemType } from '@fastgpt/global/openapi/core/ai/model/api';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { AiChatModule } from '@fastgpt/global/core/workflow/template/system/aiChat';
import { useNodeOutputValidity } from '@/pageComponents/app/detail/WorkflowComponents/Flow/hooks/useNodeOutputValidity';
import { filterSelectableWorkflowNodeOutputs } from '@/web/core/workflow/utils';

type DocNode = {
  inputs: FlowNodeInputItemType[];
  outputs: FlowNodeOutputItemType[];
};

const mocks = vi.hoisted(() => ({
  doc: undefined as DocNode | undefined,
  effect: undefined as (() => void) | undefined,
  detail: vi.fn(),
  updateCalls: [] as Partial<DocNode>[]
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useEffect: (effect: () => void) => {
    mocks.effect = effect;
  }
}));
vi.mock('@/web/core/workflow/editor/react/useNode', () => ({
  // 模拟 scoped 节点句柄：节点存在时返回文档快照与 updateNode；节点删除后，
  // 旧句柄的写入被 Runtime 拒绝且不产生历史（对齐 adapter 的 not_found 契约）。
  useNode: () =>
    mocks.doc
      ? {
          data: mocks.doc,
          // patch 是函数：对齐 adapter，用派发瞬间的记录求值。
          updateNode: (patch: (node: DocNode) => Partial<DocNode>) => {
            if (!mocks.doc) return;
            const resolved = patch(mocks.doc);
            mocks.updateCalls.push(resolved);
            mocks.doc = { ...mocks.doc, ...resolved };
          }
        }
      : undefined,
  useNodeActions: () =>
    mocks.doc
      ? {
          updateNode: (patch: (node: DocNode) => Partial<DocNode>) => {
            if (!mocks.doc) return;
            const resolved = patch(mocks.doc);
            mocks.updateCalls.push(resolved);
            mocks.doc = { ...mocks.doc, ...resolved };
          }
        }
      : undefined,
  useNodeValue: (_nodeId: string, selector: (node: { data: DocNode } | undefined) => unknown) =>
    selector(mocks.doc ? { data: mocks.doc } : undefined)
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

const createDoc = (): DocNode => ({
  inputs: AiChatModule.inputs.map((input) =>
    input.key === NodeInputKeyEnum.aiModelId ? { ...input, value: model.modelId } : input
  ),
  outputs: AiChatModule.outputs.map((output) => ({ ...output }))
});
const selectable = () =>
  filterSelectableWorkflowNodeOutputs({ outputs: mocks.doc!.outputs }).map((output) => output.key);
const run = () => {
  useNodeOutputValidity('chat');
  mocks.effect?.();
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.doc = createDoc();
  mocks.effect = undefined;
  mocks.updateCalls = [];
  mocks.detail.mockReturnValue({ model, loading: false });
});

describe('useNodeOutputValidity', () => {
  it('clears the invalid mark for a reasoning model without mounting RenderOutput', () => {
    expect(selectable()).not.toContain(NodeOutputKeyEnum.reasoningText);
    run();
    expect(mocks.updateCalls.length).toBe(1);
    expect(selectable()).toContain(NodeOutputKeyEnum.reasoningText);

    // 标记全部相等时不再提交，避免每次重渲染都推一条历史
    run();
    expect(mocks.updateCalls.length).toBe(1);
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
      const writes = mocks.updateCalls.length;
      mocks.detail.mockReturnValue(state);
      run();
      expect(mocks.updateCalls.length).toBe(writes);
      expect(selectable()).toContain(NodeOutputKeyEnum.reasoningText);
    }
  );

  it('invalidates output when the selected model is confirmed missing', () => {
    run();
    mocks.detail.mockReturnValue({ loading: false, model: undefined });
    run();
    expect(selectable()).not.toContain(NodeOutputKeyEnum.reasoningText);
  });

  it('does not write after the node is removed', () => {
    useNodeOutputValidity('chat');
    mocks.doc = undefined;
    mocks.effect?.();
    expect(mocks.updateCalls.length).toBe(0);
  });

  it('recomputes from the fresh snapshot and preserves concurrent output edits', () => {
    run();
    // 字段编辑后快照身份变化：重跑时读文档最新 outputs、只动 invalid 标记，
    // label 等并发修改原样保留。
    mocks.doc = {
      inputs: mocks.doc!.inputs.map((input) => ({ ...input })),
      outputs: mocks.doc!.outputs.map((output) => ({ ...output, label: 'edited' }))
    };
    run();
    expect(mocks.doc!.outputs.every((output) => output.label === 'edited')).toBe(true);
    expect(selectable()).toContain(NodeOutputKeyEnum.reasoningText);
  });

  it('skips absent nodes and nodes without conditional outputs', () => {
    mocks.doc = undefined;
    run();
    expect(mocks.updateCalls.length).toBe(0);

    mocks.doc = { inputs: createDoc().inputs, outputs: [] };
    run();
    expect(mocks.updateCalls.length).toBe(0);
    expect(mocks.detail).toHaveBeenLastCalledWith({
      modelType: ModelTypeEnum.llm,
      modelId: undefined,
      model: undefined
    });
  });
});
