import { describe, expect, it, vi, beforeEach } from 'vitest';
import { hydrateWorkflowEditor } from '@fastgpt/global/common/workflow/editor/protocol';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { ensureModelCatalog } from '@/web/core/ai/model/modelData';
import { getWorkflowModelCheckData } from '@/web/core/workflow/modelData';
import { serializeWorkflowAndCheckData } from '@/web/core/workflow/editor/session/workflowPersistence';

vi.mock('@/web/core/ai/model/modelData', () => ({ ensureModelCatalog: vi.fn() }));
vi.mock('@/web/core/workflow/modelData', () => ({ getWorkflowModelCheckData: vi.fn() }));
vi.mock('@/web/core/workflow/sandbox', () => ({
  getWorkflowSandboxCheckData: () => ({ showSandbox: true, enableSandbox: true })
}));

const createRuntime = (options?: Parameters<typeof hydrateWorkflowEditor>[1]) =>
  hydrateWorkflowEditor(
    {
      nodes: [
        {
          nodeId: 'start',
          name: 'Start',
          flowNodeType: FlowNodeTypeEnum.workflowStart,
          inputs: [],
          outputs: []
        },
        {
          nodeId: 'answer',
          name: 'Answer',
          flowNodeType: FlowNodeTypeEnum.answerNode,
          inputs: [
            {
              key: NodeInputKeyEnum.answerText,
              label: 'Answer',
              renderTypeList: [FlowNodeInputTypeEnum.textarea],
              valueType: WorkflowIOValueTypeEnum.string,
              value: 'Hello'
            }
          ],
          outputs: []
        }
      ],
      edges: [
        {
          source: 'start',
          target: 'answer',
          sourceHandle: 'start-source-right',
          targetHandle: 'answer-target-left'
        }
      ],
      chatConfig: {}
    },
    options
  );

const createGate = (runtime = createRuntime()) => ({
  runtimeRef: { current: runtime },
  pendingSaveRevisionRef: { current: undefined as number | undefined },
  toast: vi.fn(),
  focusIssueNode: vi.fn(),
  t: ((key: string) => key) as never,
  appId: 'app-id'
});

describe('serializeWorkflowAndCheckData', () => {
  beforeEach(() => {
    vi.mocked(ensureModelCatalog).mockResolvedValue({} as never);
    vi.mocked(getWorkflowModelCheckData).mockResolvedValue({ references: [], defaultModelIds: {} });
  });

  it('checks and returns the same revision, passing app identity to model authorization', async () => {
    const gate = createGate();
    const saved = await serializeWorkflowAndCheckData(gate);
    expect(saved?.nodes.map((node) => node.nodeId)).toEqual(['start', 'answer']);
    expect(gate.pendingSaveRevisionRef.current).toBe(
      gate.runtimeRef.current.getSavepoint().contentRevision
    );
    expect(getWorkflowModelCheckData).toHaveBeenLastCalledWith(
      expect.objectContaining({ appId: 'app-id' })
    );
    expect(gate.focusIssueNode).toHaveBeenCalledWith(undefined);
    expect(gate.toast).not.toHaveBeenCalled();
  });

  it('blocks missing start nodes that runtime issues do not cover', async () => {
    const gate = createGate(hydrateWorkflowEditor({ nodes: [], edges: [], chatConfig: {} }));
    expect(gate.runtimeRef.current.getWorkflowIssues().issues).toEqual([]);
    expect(await serializeWorkflowAndCheckData(gate)).toBeUndefined();
    expect(gate.toast).toHaveBeenCalledWith(expect.objectContaining({ status: 'warning' }));
    expect(gate.pendingSaveRevisionRef.current).toBeUndefined();
  });

  it.each(['duplicate-input', 'duplicate-output'])('blocks core IO errors: %s', async (kind) => {
    const gate = createGate();
    const input = gate.runtimeRef.current.getNode('answer')!.inputs[0];
    gate.runtimeRef.current.dispatch({
      type: 'updateNode',
      nodeId: 'answer',
      patch: {
        ...(kind === 'duplicate-input'
          ? { inputs: [{ ...input }, { ...input }] }
          : {
              outputs: [0, 1].map(() => ({
                id: 'result',
                key: 'result',
                type: FlowNodeOutputTypeEnum.static,
                valueType: WorkflowIOValueTypeEnum.string
              }))
            })
      }
    });
    expect(await serializeWorkflowAndCheckData(gate)).toBeUndefined();
    expect(gate.focusIssueNode).toHaveBeenCalledWith('answer');
  });

  it('uses core model permissions even when the runtime personal catalog lacks the model', async () => {
    const gate = createGate(
      createRuntime({
        getEnvironment: () => ({ models: [], sandbox: { configured: true, planSupported: true } })
      })
    );
    gate.runtimeRef.current.dispatch({
      type: 'updateChatConfig',
      chatConfig: { questionGuide: { open: true, modelId: 'app-model' } }
    });
    expect(gate.runtimeRef.current.getWorkflowIssues().chatConfigIssues.length).toBeGreaterThan(0);
    vi.mocked(getWorkflowModelCheckData).mockResolvedValue({
      references: [{ modelId: 'app-model', type: ModelTypeEnum.llm }],
      defaultModelIds: {}
    });
    expect(await serializeWorkflowAndCheckData(gate)).toBeDefined();
  });

  it('blocks unresolved chat configuration models and suppresses tips when requested', async () => {
    const gate = createGate();
    gate.runtimeRef.current.dispatch({
      type: 'updateChatConfig',
      chatConfig: { questionGuide: { open: true, modelId: 'missing-model' } }
    });
    expect(await serializeWorkflowAndCheckData({ ...gate, hideTip: true })).toBeUndefined();
    expect(gate.toast).not.toHaveBeenCalled();
    expect(gate.focusIssueNode).not.toHaveBeenCalled();
  });

  it.each(['edit', 'replace', 'dispose'])(
    'discards stale authorization after %s',
    async (change) => {
      const gate = createGate();
      vi.mocked(getWorkflowModelCheckData).mockImplementationOnce(async () => {
        if (change === 'edit')
          gate.runtimeRef.current.dispatch({
            type: 'updateChatConfig',
            chatConfig: { welcomeText: 'changed' }
          });
        if (change === 'replace') gate.runtimeRef.current = createRuntime();
        if (change === 'dispose') gate.runtimeRef.current.dispose();
        return { references: [], defaultModelIds: {} };
      });
      expect(await serializeWorkflowAndCheckData(gate)).toBeUndefined();
      expect(gate.pendingSaveRevisionRef.current).toBeUndefined();
    }
  );

  it.each(['catalog', 'model'])('blocks %s loading failures', async (source) => {
    const gate = createGate();
    if (source === 'catalog')
      vi.mocked(ensureModelCatalog).mockRejectedValueOnce(new Error('offline'));
    else vi.mocked(getWorkflowModelCheckData).mockRejectedValueOnce(new Error('offline'));
    expect(await serializeWorkflowAndCheckData(gate)).toBeUndefined();
    expect(gate.toast).toHaveBeenCalledWith({
      status: 'error',
      title: 'common:model_catalog_load_failed'
    });
  });
});
