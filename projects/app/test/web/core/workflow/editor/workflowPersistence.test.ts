import { describe, expect, it, vi, beforeEach } from 'vitest';
import { hydrateWorkflowEditor } from '@fastgpt/global/common/workflow/editor/protocol';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  VARIABLE_NODE_ID,
  VariableInputEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { FormInputNode } from '@fastgpt/global/core/workflow/template/system/interactive/formInput';
import { USER_SELECT_REFERENCE_HANDLE_KEY } from '@fastgpt/global/core/workflow/template/system/interactive/userSelect';
import { ensureModelCatalog } from '@/web/core/ai/model/modelData';
import { getWorkflowModelCheckData } from '@/web/core/workflow/modelData';
import {
  dedupeWorkflowIssueMessages,
  serializeWorkflowAndCheckData
} from '@/web/core/workflow/editor/session/workflowPersistence';

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
              required: true,
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

const invalidAnswerReference = {
  nodeId: 'answer',
  level: 'error',
  code: 'invalid_reference',
  inputKey: NodeInputKeyEnum.answerText
} as const;

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

  it.each([true, false])(
    'checks the current output validity after model authorization (reasoning: %s)',
    async (nextReasoning) => {
      let reasoning = !nextReasoning;
      const modelId = 'chat-model';
      const initial = createRuntime();
      const document = initial.getWorkflowData();
      initial.dispose();

      const [start, answer] = document.nodes;
      const reasoningOutput = {
        id: NodeOutputKeyEnum.reasoningText,
        key: NodeOutputKeyEnum.reasoningText,
        type: FlowNodeOutputTypeEnum.static,
        valueType: WorkflowIOValueTypeEnum.string
      };
      Object.assign(answer.inputs[0], {
        renderTypeList: [FlowNodeInputTypeEnum.reference],
        selectedType: FlowNodeInputTypeEnum.reference,
        value: ['chat', reasoningOutput.id]
      });
      document.nodes = [
        start,
        {
          nodeId: 'chat',
          name: 'Chat',
          flowNodeType: FlowNodeTypeEnum.chatNode,
          inputs: [
            {
              key: NodeInputKeyEnum.aiModelId,
              label: 'Model',
              renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel],
              valueType: WorkflowIOValueTypeEnum.string,
              value: modelId
            }
          ],
          outputs: [reasoningOutput]
        },
        answer
      ];
      document.edges = [
        { ...document.edges[0], target: 'chat', targetHandle: 'chat-target-left' },
        { ...document.edges[0], source: 'chat', sourceHandle: 'chat-source-right' }
      ];

      const runtime = hydrateWorkflowEditor(document, {
        getEnvironment: () => ({
          models: [
            {
              modelId,
              type: ModelTypeEnum.llm,
              config: { maxContext: 1, maxResponse: 1, quoteMaxToken: 1, reasoning }
            }
          ],
          sandbox: { configured: true, planSupported: true }
        })
      });
      const gate = createGate(runtime);
      const savepoint = runtime.getSavepoint();
      const authorization =
        Promise.withResolvers<Awaited<ReturnType<typeof getWorkflowModelCheckData>>>();
      vi.mocked(getWorkflowModelCheckData).mockReturnValueOnce(authorization.promise);

      const pending = serializeWorkflowAndCheckData(gate);
      reasoning = nextReasoning;
      runtime.refreshIssues();
      expect(runtime.getSavepoint()).toEqual(savepoint);
      authorization.resolve({
        references: [{ modelId, type: ModelTypeEnum.llm }],
        defaultModelIds: {}
      });

      const saved = await pending;
      if (nextReasoning) {
        expect(saved?.nodes.find(({ nodeId }) => nodeId === 'chat')?.outputs).toContainEqual(
          expect.objectContaining({ ...reasoningOutput, invalid: false })
        );
      } else {
        expect(saved).toBeUndefined();
        expect(gate.pendingSaveRevisionRef.current).toBeUndefined();
      }
      runtime.dispose();
    }
  );

  it('blocks missing start nodes that runtime issues do not cover', async () => {
    const gate = createGate(hydrateWorkflowEditor({ nodes: [], edges: [], chatConfig: {} }));
    expect(gate.runtimeRef.current.getWorkflowIssues().issues).toEqual([]);
    expect(await serializeWorkflowAndCheckData(gate)).toBeUndefined();
    expect(gate.toast).toHaveBeenCalledWith(expect.objectContaining({ status: 'warning' }));
    expect(gate.pendingSaveRevisionRef.current).toBeUndefined();
  });

  it.each([
    {
      required: false,
      renderType: FlowNodeInputTypeEnum.reference,
      value: ['deleted', 'result'],
      canSave: true
    },
    {
      required: true,
      renderType: FlowNodeInputTypeEnum.reference,
      value: ['deleted', 'result'],
      canSave: false
    },
    {
      required: true,
      renderType: FlowNodeInputTypeEnum.textarea,
      value: 'Keep this text {{$deleted.result$}}',
      canSave: true
    }
  ])(
    'validates the remaining input after a stale reference (required: $required, type: $renderType)',
    async ({ required, renderType, value, canSave }) => {
      const initial = createRuntime();
      const document = initial.getWorkflowData();
      initial.dispose();
      const [input] = document.nodes.find(({ nodeId }) => nodeId === 'answer')!.inputs;
      Object.assign(input, {
        required,
        selectedType: renderType,
        renderTypeList: [renderType],
        value
      });
      const runtime = hydrateWorkflowEditor(document);
      const gate = createGate(runtime);
      expect(runtime.getWorkflowIssues().issues).toContainEqual(
        expect.objectContaining(invalidAnswerReference)
      );

      const saved = await serializeWorkflowAndCheckData(gate);
      if (!canSave) {
        expect(saved).toBeUndefined();
      } else {
        expect(saved?.nodes.find(({ nodeId }) => nodeId === 'answer')?.inputs[0]?.value).toEqual(
          value
        );
      }
    }
  );

  it.each([
    { live: false, replacementType: WorkflowIOValueTypeEnum.string },
    { live: true, replacementType: WorkflowIOValueTypeEnum.number }
  ])(
    'checks a required output ID that collides with a key (live: $live)',
    async ({ live, replacementType }) => {
      const initial = createRuntime();
      const snapshot = initial.getWorkflowData();
      initial.dispose();
      const [source, answer] = snapshot.nodes;
      const reference = [source.nodeId, 'stored-id'];
      source.outputs = [
        {
          id: 'replacement-id',
          key: 'stored-id',
          type: FlowNodeOutputTypeEnum.static,
          valueType: replacementType
        }
      ];
      if (live) {
        source.outputs.push({
          id: 'stored-id',
          key: 'live-key',
          type: FlowNodeOutputTypeEnum.static,
          valueType: WorkflowIOValueTypeEnum.string
        });
      }
      Object.assign(answer.inputs[0], {
        renderTypeList: [FlowNodeInputTypeEnum.reference],
        selectedType: FlowNodeInputTypeEnum.reference,
        value: reference
      });
      const runtime = hydrateWorkflowEditor(snapshot);
      const gate = createGate(runtime);

      const saved = await serializeWorkflowAndCheckData(gate);

      if (live) {
        expect(saved?.nodes[1].inputs[0].value).toEqual(reference);
      } else {
        expect(saved).toBeUndefined();
        expect(gate.focusIssueNode).toHaveBeenCalledWith(answer.nodeId);
      }
      runtime.dispose();
    }
  );

  it.each([FlowNodeTypeEnum.userSelect, FlowNodeTypeEnum.formInput])(
    'saves %s with a usable dynamic option source and preserves individual selections',
    async (flowNodeType) => {
      const initial = createRuntime();
      const snapshot = initial.getWorkflowData();
      initial.dispose();
      const isUserSelect = flowNodeType === FlowNodeTypeEnum.userSelect;
      const fieldKey = isUserSelect
        ? NodeInputKeyEnum.userSelectOptions
        : NodeInputKeyEnum.userInputForms;
      const valueFor = (key: 'usable' | 'excluded') => {
        const listReference = [
          [VARIABLE_NODE_ID, 'deleted'],
          [VARIABLE_NODE_ID, key]
        ];
        return isUserSelect
          ? listReference
          : [
              {
                key: 'choice',
                label: 'Choice',
                type: FlowNodeInputTypeEnum.select,
                value: '',
                valueType: WorkflowIOValueTypeEnum.string,
                required: false,
                listInputType: FlowNodeInputTypeEnum.reference,
                listReference
              }
            ];
      };
      const runtime = hydrateWorkflowEditor({
        nodes: [
          ...snapshot.nodes,
          {
            nodeId: 'choices',
            name: 'Choices',
            flowNodeType,
            inputs: [
              ...(isUserSelect
                ? []
                : FormInputNode.inputs.filter((input) => input.key !== fieldKey)),
              {
                key: fieldKey,
                label: 'Options',
                valueType: WorkflowIOValueTypeEnum.any,
                renderTypeList: [
                  isUserSelect ? FlowNodeInputTypeEnum.reference : FlowNodeInputTypeEnum.custom
                ],
                value: null,
                defaultValue: valueFor('usable')
              }
            ],
            outputs: isUserSelect
              ? []
              : [
                  ...FormInputNode.outputs,
                  {
                    id: 'choice',
                    key: 'choice',
                    type: FlowNodeOutputTypeEnum.static,
                    valueType: WorkflowIOValueTypeEnum.string
                  }
                ]
          }
        ],
        edges: [
          { ...snapshot.edges[0], target: 'choices', targetHandle: 'choices-target-left' },
          {
            ...snapshot.edges[0],
            source: 'choices',
            sourceHandle: `choices-source-${isUserSelect ? USER_SELECT_REFERENCE_HANDLE_KEY : 'right'}`
          }
        ],
        chatConfig: {
          variables: (['usable', 'excluded'] as const).map((key) => ({
            key,
            label: key,
            description: '',
            type: VariableInputEnum.input,
            valueType:
              key === 'usable'
                ? WorkflowIOValueTypeEnum.arrayString
                : WorkflowIOValueTypeEnum.arrayBoolean
          }))
        }
      });
      const gate = createGate(runtime);
      if (isUserSelect) {
        expect(runtime.getField({ nodeId: 'choices', fieldKey })?.references).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code: 'invalid_reference',
              reference: [VARIABLE_NODE_ID, 'deleted']
            }),
            expect.objectContaining({ code: 'valid', reference: [VARIABLE_NODE_ID, 'usable'] })
          ])
        );
      } else {
        const options = runtime.getReferenceOptions({
          nodeId: 'choices',
          valueType: WorkflowIOValueTypeEnum.any
        });
        expect(options).toContainEqual(
          expect.objectContaining({ reference: [VARIABLE_NODE_ID, 'usable'] })
        );
        expect(options).not.toContainEqual(
          expect.objectContaining({ reference: [VARIABLE_NODE_ID, 'deleted'] })
        );
      }
      const saved = await serializeWorkflowAndCheckData(gate);
      expect(saved, JSON.stringify(gate.toast.mock.calls)).toBeDefined();
      expect(runtime.getField({ nodeId: 'choices', fieldKey })?.input?.defaultValue).toEqual(
        valueFor('usable')
      );

      expect(
        runtime.dispatch({
          type: 'updateField',
          nodeId: 'choices',
          fieldKey,
          value: valueFor('excluded')
        }).ok
      ).toBe(true);
      expect(
        runtime.getWorkflowIssues().issues.filter((issue) => issue.inputKey === fieldKey)
      ).toEqual([
        expect.objectContaining({
          code: isUserSelect ? 'user_select_empty' : 'required_input_empty'
        })
      ]);
      expect(await serializeWorkflowAndCheckData(gate)).toBeUndefined();
      runtime.dispose();
    }
  );

  it('lets the Core policy decide ordinary references while keeping other runtime errors', async () => {
    const gate = createGate();
    const runtime = gate.runtimeRef.current;
    vi.spyOn(runtime, 'refreshIssues').mockReturnValue({ nodeIds: [] });
    vi.spyOn(runtime, 'getWorkflowIssues').mockReturnValue({
      issues: [
        {
          ...invalidAnswerReference,
          message: 'Answer cites an invalid Variable'
        },
        { ...invalidAnswerReference, code: 'user_select_empty', message: 'Different issue' }
      ],
      chatConfigIssues: []
    });

    expect(await serializeWorkflowAndCheckData(gate)).toBeUndefined();
    const description = gate.toast.mock.calls[0][0].description as string;
    expect(description).toBe('common:core.workflow.check.user_select_empty');
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

  it('validates a text-only workflow when the personal model catalog is offline', async () => {
    vi.mocked(ensureModelCatalog).mockRejectedValueOnce(new Error('offline'));
    const gate = createGate();
    expect(await serializeWorkflowAndCheckData(gate)).toBeDefined();
    expect(gate.toast).not.toHaveBeenCalled();
  });

  it('blocks authorization loading failures for a referenced model', async () => {
    const gate = createGate();
    gate.runtimeRef.current.dispatch({
      type: 'updateChatConfig',
      chatConfig: { questionGuide: { open: true, modelId: 'app-model' } }
    });
    vi.mocked(getWorkflowModelCheckData).mockRejectedValueOnce(new Error('offline'));
    expect(await serializeWorkflowAndCheckData(gate)).toBeUndefined();
    expect(gate.toast).toHaveBeenCalledWith({
      status: 'error',
      title: 'common:model_catalog_load_failed'
    });
  });
});

describe('dedupeWorkflowIssueMessages', () => {
  it('keeps the first message for the same semantic issue across validators', () => {
    expect(
      dedupeWorkflowIssueMessages([
        {
          issue: invalidAnswerReference,
          message: '「Answer」core message'
        },
        {
          issue: {
            ...invalidAnswerReference,
            message: 'runtime message'
          },
          message: 'runtime message'
        }
      ])
    ).toEqual(['「Answer」core message']);
  });

  it('keeps distinct field locations and ignores display-only params', () => {
    expect(
      dedupeWorkflowIssueMessages([
        {
          issue: {
            nodeId: 'answer',
            level: 'error',
            code: 'invalid_reference',
            inputKey: NodeInputKeyEnum.userInputForms,
            params: { fieldKey: 'first', inputName: 'First' }
          },
          message: 'first'
        },
        {
          issue: {
            nodeId: 'answer',
            level: 'error',
            code: 'invalid_reference',
            inputKey: NodeInputKeyEnum.userInputForms,
            params: { fieldKey: 'second', inputName: 'Second' }
          },
          message: 'second'
        },
        {
          issue: {
            nodeId: 'answer',
            level: 'error',
            code: 'user_select_empty',
            inputKey: NodeInputKeyEnum.answerText
          },
          message: 'third'
        }
      ])
    ).toEqual(['first', 'second', 'third']);

    expect(
      dedupeWorkflowIssueMessages([
        {
          issue: {
            ...invalidAnswerReference,
            params: { inputName: 'Answer' }
          },
          message: 'core'
        },
        {
          issue: {
            ...invalidAnswerReference,
            params: { inputNameKey: 'common:Answer' }
          },
          message: 'runtime'
        }
      ])
    ).toEqual(['core']);
  });
});
