import { describe, expect, it } from 'vitest';
import { migrateWorkflowToCurrent } from '@fastgpt/global/common/workflow/migration';
import { storeNodes2RuntimeNodes } from '@fastgpt/global/common/workflow/runtime';
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
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { createTestVariableContext, createTestWorkflowDispatch } from '../context/fixtures';
import { dispatchUserSelect as dispatchUserSelectWithoutContext } from '@fastgpt/service/core/workflow/dispatch/interactive/userSelect';
import { createEdge, createNode } from '../../utils';

const dispatchUserSelect = createTestWorkflowDispatch(dispatchUserSelectWithoutContext);

describe('dispatchUserSelect', () => {
  it.each([
    ['Option A', ['b']],
    ['Option B', ['a']],
    ['Unknown option', ['a', 'b']]
  ] as const)('only activates a matching manual branch for %s', async (selected, skippedKeys) => {
    const result = await dispatchUserSelect({
      histories: [],
      node: {
        nodeId: 'selectNode',
        isEntry: true,
        inputs: [
          {
            key: NodeInputKeyEnum.userSelectOptions,
            renderTypeList: [FlowNodeInputTypeEnum.custom],
            selectedType: FlowNodeInputTypeEnum.custom
          }
        ]
      },
      runtimeNodesMap: new Map(),
      params: {
        [NodeInputKeyEnum.description]: 'Choose one',
        [NodeInputKeyEnum.userSelectOptions]: [
          { key: 'a', value: 'Option A' },
          { key: 'b', value: 'Option B' }
        ]
      },
      query: [{ text: { content: selected } }],
      lastInteractive: { type: 'userSelect' }
    } as unknown as Parameters<typeof dispatchUserSelect>[0]);

    expect(result.data?.[NodeOutputKeyEnum.selectResult]).toBe(selected);
    expect(result[DispatchNodeResponseKeyEnum.skipHandleId]).toEqual(
      skippedKeys.map((key) => `selectNode-source-${key}`)
    );
  });

  it.each([
    { shape: 'list', reference: [['upstream', 'opts']] },
    {
      shape: 'list from a root node with a legacy empty parent ID',
      reference: [['upstream', 'opts']],
      parentNodeId: ''
    },
    {
      shape: 'legacy single tuple after a manual branch with malformed options',
      reference: ['upstream', 'opts'],
      flowNodeType: FlowNodeTypeEnum.userSelect,
      branchInputKey: NodeInputKeyEnum.userSelectOptions
    },
    {
      shape: 'partly malformed list after a classifier with malformed agents',
      reference: [['stale'], ['upstream', 'opts']],
      flowNodeType: FlowNodeTypeEnum.classifyQuestion,
      branchInputKey: NodeInputKeyEnum.agents
    }
  ])('resolves $shape', async ({ reference, flowNodeType, branchInputKey, parentNodeId }) => {
    const runtimeNodesMap = new Map([
      [
        'upstream',
        {
          nodeId: 'upstream',
          parentNodeId,
          flowNodeType,
          inputs: branchInputKey
            ? [{ key: branchInputKey, value: [null, false, {}, { key: 'branch' }] }]
            : [],
          outputs: [{ id: 'opts', value: ['Option A', 'Option B'] }]
        } as any
      ]
    ]);

    const res = await dispatchUserSelect({
      histories: [],
      node: {
        nodeId: 'selectNode',
        isEntry: false,
        inputs: [
          {
            key: NodeInputKeyEnum.userSelectOptions,
            renderTypeList: [FlowNodeInputTypeEnum.custom, FlowNodeInputTypeEnum.reference],
            selectedType: FlowNodeInputTypeEnum.reference
          }
        ]
      } as any,
      runtimeNodesMap,
      runtimeEdges: [
        { source: 'upstream', target: 'selectNode', sourceHandle: 'upstream-source-branch' }
      ],
      params: {
        [NodeInputKeyEnum.description]: 'Choose one',
        [NodeInputKeyEnum.userSelectOptions]: reference
      },
      query: []
    } as any);

    expect(res[DispatchNodeResponseKeyEnum.interactive]).toEqual({
      type: 'userSelect',
      params: {
        description: 'Choose one',
        userSelectOptions: [
          { key: 'option_1', value: 'Option A' },
          { key: 'option_2', value: 'Option B' }
        ]
      }
    });
  });

  it.each([
    {
      reasoningEffort: 'low',
      produced: 'Reasoning text',
      expected: ['Reasoning text', 'Fallback']
    },
    { reasoningEffort: 'none', produced: 'Reasoning text', expected: ['Fallback'] },
    { reasoningEffort: 'low', produced: '', expected: ['Fallback'] }
  ])(
    'uses available reasoning from a legacy output with effort $reasoningEffort and value $produced',
    async ({ reasoningEffort, produced, expected }) => {
      const optionRefs = [
        ['source', NodeOutputKeyEnum.reasoningText],
        ['source', 'hidden'],
        ['source', NodeOutputKeyEnum.answerText]
      ];
      const { nodes } = migrateWorkflowToCurrent({
        nodes: [
          {
            ...createNode('source', FlowNodeTypeEnum.chatNode),
            inputs: [
              {
                key: NodeInputKeyEnum.aiChatReasoningEffort,
                renderTypeList: [FlowNodeInputTypeEnum.hidden],
                value: reasoningEffort
              }
            ],
            outputs: [NodeOutputKeyEnum.reasoningText, 'hidden', NodeOutputKeyEnum.answerText].map(
              (key) => ({
                id: key,
                key,
                type: FlowNodeOutputTypeEnum.static,
                valueType: WorkflowIOValueTypeEnum.string,
                invalid: key !== NodeOutputKeyEnum.answerText
              })
            )
          },
          {
            ...createNode('selectNode', FlowNodeTypeEnum.userSelect),
            inputs: [
              {
                key: NodeInputKeyEnum.userSelectOptions,
                renderTypeList: [FlowNodeInputTypeEnum.reference],
                value: optionRefs
              }
            ]
          }
        ]
      });
      const [source, selectNode] = storeNodes2RuntimeNodes(nodes, []);
      expect(source.outputs[0].invalid).toBe(true);
      // 调度会把聊天节点本次返回的数据写到输出 value，旧版本的 invalid 仍来自存储。
      source.outputs[0].value = produced;
      source.outputs[1].value = 'Hidden';
      source.outputs[2].value = 'Fallback';
      const result = await dispatchUserSelect({
        mode: 'chat',
        histories: [],
        node: selectNode,
        runtimeNodesMap: new Map([
          [source.nodeId, source],
          [selectNode.nodeId, selectNode]
        ]),
        runtimeEdges: [createEdge('source', 'selectNode', 'active')],
        params: { userSelectOptions: optionRefs },
        query: []
      } as Parameters<typeof dispatchUserSelect>[0]);

      expect(
        result[DispatchNodeResponseKeyEnum.interactive]?.params.userSelectOptions.map(
          ({ value }) => value
        )
      ).toEqual(expected);
    }
  );

  it('returns a business failure without a raw exception when reference options are empty', async () => {
    await expect(
      dispatchUserSelect({
        histories: [],
        node: {
          nodeId: 'selectNode',
          isEntry: false,
          inputs: [
            {
              key: NodeInputKeyEnum.userSelectOptions,
              renderTypeList: [FlowNodeInputTypeEnum.custom, FlowNodeInputTypeEnum.reference],
              selectedType: FlowNodeInputTypeEnum.reference
            }
          ]
        } as any,
        runtimeNodesMap: new Map(),
        params: {
          [NodeInputKeyEnum.description]: 'Choose one',
          [NodeInputKeyEnum.userSelectOptions]: [['missing', 'opts']]
        },
        query: []
      } as any)
    ).resolves.toEqual({
      error: { [NodeOutputKeyEnum.errorText]: 'workflow:user_select_no_available_options' },
      responseData: { errorText: 'workflow:user_select_no_available_options' }
    });
  });

  it('does not skip ref_default handle when user selects an option in reference mode', async () => {
    const res = await dispatchUserSelect({
      histories: [
        { obj: 'Human', value: [] },
        { obj: 'AI', value: [] }
      ],
      node: {
        nodeId: 'selectNode',
        isEntry: true,
        inputs: [
          {
            key: NodeInputKeyEnum.userSelectOptions,
            renderTypeList: [FlowNodeInputTypeEnum.custom, FlowNodeInputTypeEnum.reference],
            selectedType: FlowNodeInputTypeEnum.reference
          }
        ]
      } as any,
      runtimeNodesMap: new Map(),
      params: {
        [NodeInputKeyEnum.description]: 'Choose one',
        [NodeInputKeyEnum.userSelectOptions]: [['upstream', 'opts']]
      },
      query: [{ text: { content: 'Dynamic Option 1' } }],
      lastInteractive: { type: 'userSelect' }
    } as any);

    expect(res.data?.[NodeOutputKeyEnum.selectResult]).toBe('Dynamic Option 1');
    expect(res[DispatchNodeResponseKeyEnum.skipHandleId]).toEqual([]);
  });

  const referenceNode = {
    nodeId: 'selectNode',
    isEntry: false,
    inputs: [
      {
        key: NodeInputKeyEnum.userSelectOptions,
        renderTypeList: [FlowNodeInputTypeEnum.custom, FlowNodeInputTypeEnum.reference],
        selectedType: FlowNodeInputTypeEnum.reference
      }
    ]
  };

  it('expands allowed values and excludes boolean arrays and disconnected outputs', async () => {
    const runtimeNodesMap = new Map([
      [
        'upstream',
        {
          nodeId: 'upstream',
          outputs: [
            { id: 'arrStr', valueType: 'arrayString', value: ['A', 'B'] },
            { id: 'arrNum', valueType: 'arrayNumber', value: [10, 20] },
            { id: 'arrObj', valueType: 'arrayObject', value: [{ id: 1 }, { id: 2 }] },
            { id: 'arrAny', valueType: 'arrayAny', value: ['x', 99, { ok: true }] },
            { id: 'str', valueType: 'string', value: 'single_str' },
            { id: 'num', valueType: 'number', value: 42 },
            { id: 'bool', valueType: 'boolean', value: true },
            { id: 'obj', valueType: 'object', value: { k: 'v' } },
            { id: 'anyArr', valueType: 'any', value: ['raw1', 'raw2'] },
            { id: 'boolArr', valueType: 'arrayBoolean', value: [true, false] }
          ]
        } as any
      ],
      [
        'disconnected',
        { nodeId: 'disconnected', outputs: [{ id: 'opts', value: ['Disconnected'] }] }
      ]
    ]);

    const res = await dispatchUserSelect({
      histories: [],
      node: referenceNode,
      runtimeNodesMap,
      runtimeEdges: [{ source: 'upstream', target: 'selectNode' }],
      params: {
        [NodeInputKeyEnum.description]: 'Choose one',
        [NodeInputKeyEnum.userSelectOptions]: [
          ['upstream', 'arrStr'],
          ['upstream', 'arrNum'],
          ['upstream', 'arrObj'],
          ['upstream', 'arrAny'],
          ['upstream', 'str'],
          ['upstream', 'num'],
          ['upstream', 'bool'],
          ['upstream', 'obj'],
          ['upstream', 'anyArr'],
          ['upstream', 'boolArr'],
          ['disconnected', 'opts']
        ]
      },
      query: []
    } as any);

    expect(res[DispatchNodeResponseKeyEnum.interactive]).toEqual({
      type: 'userSelect',
      params: {
        description: 'Choose one',
        userSelectOptions: [
          { key: 'option_1', value: 'A' },
          { key: 'option_2', value: 'B' },
          { key: 'option_3', value: '10' },
          { key: 'option_4', value: '20' },
          { key: 'option_5', value: '{"id":1}' },
          { key: 'option_6', value: '{"id":2}' },
          { key: 'option_7', value: 'x' },
          { key: 'option_8', value: '99' },
          { key: 'option_9', value: '{"ok":true}' },
          { key: 'option_10', value: 'single_str' },
          { key: 'option_11', value: '42' },
          { key: 'option_12', value: 'true' },
          { key: 'option_13', value: '{"k":"v"}' },
          { key: 'option_14', value: 'raw1' },
          { key: 'option_15', value: 'raw2' }
        ]
      }
    });
  });

  it.each([
    { override: false, values: ['Option A', 'Option A'] },
    { override: true, values: ['upstream', 'opts'] }
  ])('preserves literal debug options (override: $override)', async ({ override, values }) => {
    const res = await dispatchUserSelect({
      mode: 'debug',
      histories: [],
      node: {
        ...referenceNode,
        inputs: [{ ...referenceNode.inputs[0], ...(override && { debugValueOverride: true }) }]
      },
      runtimeNodesMap: new Map([
        ['upstream', { nodeId: 'upstream', outputs: [{ id: 'opts', value: ['Unexpected'] }] }]
      ]),
      params: {
        [NodeInputKeyEnum.description]: 'Choose one',
        [NodeInputKeyEnum.userSelectOptions]: values
      },
      query: []
    } as any);

    expect(res[DispatchNodeResponseKeyEnum.interactive]).toEqual({
      type: 'userSelect',
      params: {
        description: 'Choose one',
        userSelectOptions: values.map((value, index) => ({ key: `option_${index + 1}`, value }))
      }
    });
  });

  it('treats marked saved options as references during debug', async () => {
    const result = await dispatchUserSelect({
      mode: 'debug',
      histories: [],
      node: {
        ...referenceNode,
        inputs: [{ ...referenceNode.inputs[0], debugValueOverride: false }]
      },
      runtimeNodesMap: new Map(),
      runtimeEdges: [],
      params: { [NodeInputKeyEnum.userSelectOptions]: ['removed', 'options'] },
      query: []
    } as Parameters<typeof dispatchUserSelect>[0]);

    expect(result[DispatchNodeResponseKeyEnum.interactive]).toBeUndefined();
    expect(result.error).toEqual({
      [NodeOutputKeyEnum.errorText]: 'workflow:user_select_no_available_options'
    });
  });

  it('truncates dynamic reference options to 200 items and 100 chars', async () => {
    const dynamicRaw = Array.from({ length: 205 }, (_, i) => `dyn_${i}_${'y'.repeat(110)}`);
    const res = await dispatchUserSelect({
      histories: [],
      node: referenceNode,
      runtimeNodesMap: new Map(),
      chatConfig: {
        variables: [
          {
            key: 'choices',
            label: 'Choices',
            description: '',
            type: VariableInputEnum.custom,
            valueType: WorkflowIOValueTypeEnum.arrayString
          }
        ]
      },
      variableContext: createTestVariableContext({ choices: dynamicRaw }),
      params: {
        [NodeInputKeyEnum.description]: 'Choose one',
        [NodeInputKeyEnum.userSelectOptions]: [[VARIABLE_NODE_ID, 'choices']]
      },
      query: []
    } as any);

    const dynamicOptions = res[DispatchNodeResponseKeyEnum.interactive]?.params?.userSelectOptions;
    expect(dynamicOptions).toHaveLength(200);
    expect(dynamicOptions?.[0]).toEqual({
      key: 'option_1',
      value: dynamicRaw[0].slice(0, 100)
    });
  });

  it.each(['removed', 'kept', 'right'])('respects branch handle %s', async (key) => {
    const result = await dispatchUserSelect({
      histories: [],
      node: {
        nodeId: 'selectNode',
        inputs: [
          {
            key: NodeInputKeyEnum.userSelectOptions,
            renderTypeList: [FlowNodeInputTypeEnum.reference]
          }
        ]
      },
      runtimeNodesMap: new Map([
        [
          'upstream',
          {
            nodeId: 'upstream',
            flowNodeType: FlowNodeTypeEnum.userSelect,
            inputs: [
              {
                key: NodeInputKeyEnum.userSelectOptions,
                renderTypeList: [FlowNodeInputTypeEnum.custom],
                value: [{ key: 'kept', value: 'Keep' }]
              }
            ],
            outputs: [{ id: 'opts', value: ['Upstream option'] }]
          }
        ]
      ]),
      runtimeEdges: [
        { source: 'upstream', target: 'selectNode', sourceHandle: `upstream-source-${key}` }
      ],
      params: { userSelectOptions: [['upstream', 'opts']] },
      query: []
    } as unknown as Parameters<typeof dispatchUserSelect>[0]);

    expect(result[DispatchNodeResponseKeyEnum.interactive]?.params?.userSelectOptions).toEqual(
      key === 'removed' ? undefined : [{ key: 'option_1', value: 'Upstream option' }]
    );
  });
});
