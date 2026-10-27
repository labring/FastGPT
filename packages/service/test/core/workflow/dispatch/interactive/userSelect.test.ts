import { describe, expect, it } from 'vitest';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { dispatchUserSelect } from '@fastgpt/service/core/workflow/dispatch/interactive/userSelect';

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

  it('resolves dynamic reference options into userSelect interactive params', async () => {
    const runtimeNodesMap = new Map([
      [
        'upstream',
        {
          nodeId: 'upstream',
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
      params: {
        [NodeInputKeyEnum.description]: 'Choose one',
        [NodeInputKeyEnum.userSelectOptions]: [['upstream', 'opts']]
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

  it('throws an error when reference mode resolves to an empty option list', async () => {
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
    ).rejects.toThrow('workflow:user_select_no_available_options');
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

  it('expands array values item-by-item and formats non-array values as single options', async () => {
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
            { id: 'anyArr', valueType: 'any', value: ['raw1', 'raw2'] }
          ]
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
          ['upstream', 'anyArr']
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

  it('supports literal option values injected by single-node debug without deduplicating', async () => {
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
      runtimeNodesMap: new Map(),
      params: {
        [NodeInputKeyEnum.description]: 'Choose one',
        [NodeInputKeyEnum.userSelectOptions]: ['Option A', 'Option A']
      },
      query: []
    } as any);

    expect(res[DispatchNodeResponseKeyEnum.interactive]).toEqual({
      type: 'userSelect',
      params: {
        description: 'Choose one',
        userSelectOptions: [
          { key: 'option_1', value: 'Option A' },
          { key: 'option_2', value: 'Option A' }
        ]
      }
    });
  });
});
