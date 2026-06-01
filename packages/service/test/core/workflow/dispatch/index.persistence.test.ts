import { describe, expect, it, vi } from 'vitest';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type { RuntimeEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { LoopRunModeEnum } from '@fastgpt/global/core/workflow/template/system/loopRun/loopRun';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { runWorkflow } from '@fastgpt/service/core/workflow/dispatch';
import { callbackMap } from '@fastgpt/service/core/workflow/dispatch/constants';
import { WorkflowVariableState } from '@fastgpt/service/core/workflow/dispatch/utils/variables';
import { getChatItemResponseData } from '@fastgpt/service/core/chat/nodeResponseStorage';
import { MongoChatItemResponse } from '@fastgpt/service/core/chat/chatItemResponseSchema';

const makeInput = ({
  key,
  value,
  valueType = WorkflowIOValueTypeEnum.any,
  renderTypeList = [FlowNodeInputTypeEnum.input],
  canEdit
}: {
  key: string;
  value?: unknown;
  valueType?: WorkflowIOValueTypeEnum;
  renderTypeList?: FlowNodeInputTypeEnum[];
  canEdit?: boolean;
}) =>
  ({
    key,
    label: key,
    value,
    valueType,
    renderTypeList,
    canEdit
  }) as RuntimeNodeItemType['inputs'][number];

const makeOutput = ({
  key,
  valueType = WorkflowIOValueTypeEnum.any,
  type = FlowNodeOutputTypeEnum.static
}: {
  key: string;
  valueType?: WorkflowIOValueTypeEnum;
  type?: FlowNodeOutputTypeEnum;
}) =>
  ({
    id: key,
    key,
    label: key,
    valueType,
    type
  }) as RuntimeNodeItemType['outputs'][number];

const makeNode = (
  nodeId: string,
  flowNodeType: FlowNodeTypeEnum,
  overrides: Partial<RuntimeNodeItemType> = {}
): RuntimeNodeItemType => ({
  nodeId,
  name: nodeId,
  avatar: '',
  flowNodeType,
  showStatus: false,
  isEntry: false,
  catchError: false,
  inputs: [],
  outputs: [],
  ...overrides
});

const makeEdge = (source: string, target: string): RuntimeEdgeItemType => ({
  source,
  target,
  sourceHandle: `${source}-source-right`,
  targetHandle: `${target}-target-left`,
  status: 'waiting'
});

const createLoopRunWorkflow = (loopItems = ['alpha', 'beta']) => {
  const runtimeNodes: RuntimeNodeItemType[] = [
    makeNode('loop', FlowNodeTypeEnum.loopRun, {
      isEntry: true,
      inputs: [
        makeInput({
          key: NodeInputKeyEnum.loopRunMode,
          value: LoopRunModeEnum.array,
          valueType: WorkflowIOValueTypeEnum.string
        }),
        makeInput({
          key: NodeInputKeyEnum.loopRunInputArray,
          value: loopItems,
          valueType: WorkflowIOValueTypeEnum.arrayString
        }),
        makeInput({
          key: NodeInputKeyEnum.childrenNodeIdList,
          value: ['start', 'concat', 'end'],
          valueType: WorkflowIOValueTypeEnum.arrayString
        }),
        makeInput({
          key: 'answer',
          value: ['concat', NodeOutputKeyEnum.text],
          valueType: WorkflowIOValueTypeEnum.string,
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          canEdit: true
        })
      ],
      outputs: [
        makeOutput({
          key: 'answer',
          valueType: WorkflowIOValueTypeEnum.string,
          type: FlowNodeOutputTypeEnum.dynamic
        })
      ]
    }),
    makeNode('start', FlowNodeTypeEnum.loopRunStart, {
      inputs: [
        makeInput({
          key: NodeInputKeyEnum.loopRunMode,
          value: LoopRunModeEnum.array,
          valueType: WorkflowIOValueTypeEnum.string
        }),
        makeInput({
          key: NodeInputKeyEnum.nestedStartInput
        }),
        makeInput({
          key: NodeInputKeyEnum.nestedStartIndex,
          valueType: WorkflowIOValueTypeEnum.number
        })
      ],
      outputs: [
        makeOutput({ key: NodeOutputKeyEnum.currentItem }),
        makeOutput({
          key: NodeOutputKeyEnum.currentIndex,
          valueType: WorkflowIOValueTypeEnum.number
        })
      ]
    }),
    makeNode('concat', FlowNodeTypeEnum.textEditor, {
      inputs: [
        makeInput({
          key: NodeInputKeyEnum.textareaInput,
          value: 'item={{$start.currentItem$}}',
          valueType: WorkflowIOValueTypeEnum.string,
          renderTypeList: [FlowNodeInputTypeEnum.textarea]
        }),
        makeInput({
          key: NodeInputKeyEnum.addInputParam,
          value: {},
          valueType: WorkflowIOValueTypeEnum.dynamic,
          renderTypeList: [FlowNodeInputTypeEnum.addInputParam]
        })
      ],
      outputs: [
        makeOutput({ key: NodeOutputKeyEnum.text, valueType: WorkflowIOValueTypeEnum.string })
      ]
    }),
    makeNode('end', FlowNodeTypeEnum.nestedEnd, {
      inputs: [
        makeInput({
          key: NodeInputKeyEnum.nestedEndInput,
          value: ['concat', NodeOutputKeyEnum.text],
          valueType: WorkflowIOValueTypeEnum.string,
          renderTypeList: [FlowNodeInputTypeEnum.reference]
        })
      ]
    })
  ];

  const runtimeEdges = [makeEdge('start', 'concat'), makeEdge('concat', 'end')];

  return { runtimeNodes, runtimeEdges };
};

describe('runWorkflow node response persistence', () => {
  const mockTextEditorWithModuleChildResponses = () => {
    const originalTextEditorDispatch = callbackMap[FlowNodeTypeEnum.textEditor];
    callbackMap[FlowNodeTypeEnum.textEditor] = vi.fn(async () => ({
      data: {
        [NodeOutputKeyEnum.text]: 'parent output'
      },
      [DispatchNodeResponseKeyEnum.nodeResponses]: [
        {
          id: 'module-child-response',
          nodeId: 'module-child-node',
          moduleName: 'Module Child',
          moduleType: FlowNodeTypeEnum.agent,
          runningTime: 1,
          totalPoints: 2
        }
      ],
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        textOutput: 'parent output'
      }
    }));

    return () => {
      callbackMap[FlowNodeTypeEnum.textEditor] = originalTextEditorDispatch;
    };
  };

  const runTextEditorWorkflowWithModuleChild = async ({
    apiVersion,
    chatId,
    responseChatItemId
  }: {
    apiVersion: 'v1' | 'v2';
    chatId: string;
    responseChatItemId: string;
  }) => {
    const appId = '67e0d5535c02d1d5cdede721';
    const runtimeNodes: RuntimeNodeItemType[] = [
      makeNode('parent_text_editor', FlowNodeTypeEnum.textEditor, {
        isEntry: true,
        inputs: [],
        outputs: [
          makeOutput({
            key: NodeOutputKeyEnum.text,
            valueType: WorkflowIOValueTypeEnum.string
          })
        ]
      })
    ];

    const result = await runWorkflow({
      apiVersion,
      mode: 'chat',
      chatId,
      responseChatItemId,
      runningAppInfo: {
        id: appId,
        name: 'Workflow Module Child App',
        teamId: '654a4107c32f3bf5f998452f',
        tmbId: '65ab7007462ada7dbb899948'
      },
      runningUserInfo: {
        teamId: '654a4107c32f3bf5f998452f',
        tmbId: '65ab7007462ada7dbb899948',
        teamName: 'team',
        memberName: 'member',
        contact: '',
        username: 'user'
      },
      uid: 'test-user',
      lang: 'zh-CN',
      histories: [],
      query: [{ type: 'text', text: { content: 'run module child' } }],
      variables: {},
      chatConfig: {},
      runtimeNodes,
      runtimeEdges: [],
      variableState: await WorkflowVariableState.create({
        timezone: 'Asia/Shanghai',
        runningAppInfo: {
          id: appId,
          name: 'Workflow Module Child App',
          teamId: '654a4107c32f3bf5f998452f',
          tmbId: '65ab7007462ada7dbb899948'
        },
        uid: 'test-user',
        chatId,
        responseChatItemId,
        histories: [],
        variablesConfig: [],
        inputVariables: {},
        externalVariables: {}
      }),
      externalProvider: {},
      workflowDispatchDeep: 0,
      maxRunTimes: 20,
      stream: false,
      responseAllData: true,
      responseDetail: true,
      checkIsStopping: () => false
    } as any);

    return { appId, result };
  };

  it('attaches module child nodeResponses to the current node response when writer is enabled', async () => {
    const restoreTextEditorDispatch = mockTextEditorWithModuleChildResponses();

    try {
      const chatId = 'workflow-module-child-chat';
      const responseChatItemId = 'workflow-module-child-ai-item';
      const { appId, result } = await runTextEditorWorkflowWithModuleChild({
        apiVersion: 'v2',
        chatId,
        responseChatItemId
      });

      expect(result.flowResponses).toEqual([]);

      const detail = await getChatItemResponseData({
        appId,
        chatId,
        chatItemDataId: responseChatItemId
      });

      expect(detail).toHaveLength(1);
      expect(detail[0]).toMatchObject({
        nodeId: 'parent_text_editor',
        childResponseCount: 1,
        childTotalPoints: 2
      });
      expect(detail[0].childrenResponses).toEqual([
        expect.objectContaining({
          id: 'module-child-response',
          parentId: detail[0].id,
          moduleName: 'Module Child'
        })
      ]);
    } finally {
      restoreTextEditorDispatch();
    }
  });

  it('keeps root flowResponses for v1 while also writing flat rows', async () => {
    const restoreTextEditorDispatch = mockTextEditorWithModuleChildResponses();

    try {
      const chatId = 'workflow-v1-module-child-chat';
      const responseChatItemId = 'workflow-v1-module-child-ai-item';
      const { appId, result } = await runTextEditorWorkflowWithModuleChild({
        apiVersion: 'v1',
        chatId,
        responseChatItemId
      });

      expect(result.flowResponses.map((item) => item.id)).toEqual([
        expect.any(String),
        'module-child-response'
      ]);

      const detail = await getChatItemResponseData({
        appId,
        chatId,
        chatItemDataId: responseChatItemId
      });

      expect(detail).toHaveLength(1);
      expect(detail[0].childrenResponses?.map((item) => item.id)).toEqual([
        'module-child-response'
      ]);
    } finally {
      restoreTextEditorDispatch();
    }
  });

  it('streams batched node responses into v2 flat rows and composes childrenResponses on detail read', async () => {
    const loopItems = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta'];
    const { runtimeNodes, runtimeEdges } = createLoopRunWorkflow(loopItems);
    const responseEvents: unknown[] = [];

    const result = await runWorkflow({
      apiVersion: 'v2',
      mode: 'chat',
      chatId: 'workflow-persistence-chat',
      responseChatItemId: 'workflow-persistence-ai-item',
      runningAppInfo: {
        id: '67e0d5535c02d1d5cdede71f',
        name: 'Workflow Persistence App',
        teamId: '654a4107c32f3bf5f998452f',
        tmbId: '65ab7007462ada7dbb899948'
      },
      runningUserInfo: {
        teamId: '654a4107c32f3bf5f998452f',
        tmbId: '65ab7007462ada7dbb899948',
        teamName: 'team',
        memberName: 'member',
        contact: '',
        username: 'user'
      },
      uid: 'test-user',
      lang: 'zh-CN',
      histories: [],
      query: [{ type: 'text', text: { content: 'run loop' } }],
      variables: {},
      chatConfig: {},
      runtimeNodes,
      runtimeEdges,
      variableState: await WorkflowVariableState.create({
        timezone: 'Asia/Shanghai',
        runningAppInfo: {
          id: '67e0d5535c02d1d5cdede71f',
          name: 'Workflow Persistence App',
          teamId: '654a4107c32f3bf5f998452f',
          tmbId: '65ab7007462ada7dbb899948'
        },
        uid: 'test-user',
        chatId: 'workflow-persistence-chat',
        responseChatItemId: 'workflow-persistence-ai-item',
        histories: [],
        variablesConfig: [],
        inputVariables: {},
        externalVariables: {}
      }),
      externalProvider: {},
      workflowDispatchDeep: 0,
      maxRunTimes: 20,
      stream: true,
      responseAllData: true,
      responseDetail: true,
      checkIsStopping: () => false,
      workflowStreamResponse: (event) => {
        if (event.data && event.event) {
          responseEvents.push(event.data);
        }
      }
    } as any);

    expect(result.flowResponses).toEqual([]);
    expect(result.nodeResponseSummary).toMatchObject({
      citeCollectionIds: [],
      errorCount: 0,
      totalPoints: 0
    });

    const rows = await MongoChatItemResponse.find({
      appId: '67e0d5535c02d1d5cdede71f',
      chatId: 'workflow-persistence-chat',
      chatItemDataId: 'workflow-persistence-ai-item'
    })
      .sort({ _id: 1 })
      .lean();
    expect(rows).toHaveLength(1 + loopItems.length * 4);
    const moduleTypeCounts = rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.data.moduleType] = (acc[row.data.moduleType] || 0) + 1;
      return acc;
    }, {});
    expect(moduleTypeCounts).toMatchObject({
      [FlowNodeTypeEnum.loopRun]: 1 + loopItems.length,
      [FlowNodeTypeEnum.loopRunStart]: loopItems.length,
      [FlowNodeTypeEnum.textEditor]: loopItems.length,
      [FlowNodeTypeEnum.nestedEnd]: loopItems.length
    });

    const rootRow = rows.find((row) => !row.data.parentId)!;
    expect(rootRow.data.parentId).toBeUndefined();
    expect(rootRow.data.childrenResponses).toBeUndefined();
    expect(rootRow.data.childResponseCount).toBe(loopItems.length * 4);

    const detail = await getChatItemResponseData({
      appId: '67e0d5535c02d1d5cdede71f',
      chatId: 'workflow-persistence-chat',
      chatItemDataId: 'workflow-persistence-ai-item'
    });

    expect(detail).toHaveLength(1);
    expect(detail[0]).toMatchObject({
      moduleType: FlowNodeTypeEnum.loopRun,
      loopRunIterations: loopItems.length,
      childResponseCount: loopItems.length * 4
    });
    expect(detail[0].childrenResponses).toHaveLength(loopItems.length);
    expect(detail[0].childrenResponses?.map((item) => item.moduleType)).toEqual(
      Array(loopItems.length).fill(FlowNodeTypeEnum.loopRun)
    );
    detail[0].childrenResponses?.forEach((iterationResponse, index) => {
      const iterationChildren = iterationResponse.childrenResponses || [];
      expect(iterationResponse.childResponseCount).toBe(3);
      expect(iterationChildren.map((item) => item.moduleType)).toEqual([
        FlowNodeTypeEnum.loopRunStart,
        FlowNodeTypeEnum.textEditor,
        FlowNodeTypeEnum.nestedEnd
      ]);
      expect(iterationResponse.loopOutputValue).toEqual({
        answer: `item=${loopItems[index]}`
      });
    });

    const streamedNodeResponses = responseEvents.filter(
      (item: any) => item?.id && item?.moduleType
    ) as Array<{ id: string; parentId?: string; moduleType: FlowNodeTypeEnum }>;
    expect(streamedNodeResponses.some((item) => item.moduleType === FlowNodeTypeEnum.loopRun)).toBe(
      true
    );
    expect(streamedNodeResponses.every((item) => item.id)).toBe(true);
  });
});
