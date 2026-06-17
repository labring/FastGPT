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
import {
  composeNodeResponseDetail,
  createWorkflowNodeResponseWriter,
  getChatItemResponseData
} from '@fastgpt/service/core/chat/nodeResponseStorage';
import { MongoChatItemResponse } from '@fastgpt/service/core/chat/chatItemResponseSchema';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';

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
    responseChatItemId,
    persistToDb = true,
    retainInMemory = false
  }: {
    apiVersion: 'v1' | 'v2';
    chatId: string;
    responseChatItemId: string;
    persistToDb?: boolean;
    retainInMemory?: boolean;
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
    const nodeResponseWriter = await createWorkflowNodeResponseWriter({
      teamId: '654a4107c32f3bf5f998452f',
      appId,
      chatId,
      chatItemDataId: responseChatItemId,
      persistToDb,
      retainInMemory
    });

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
      nodeResponseWriter,
      checkIsStopping: () => false
    } as any);

    await nodeResponseWriter.close();
    return { appId, result, nodeResponseWriter };
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

      expect('flowResponses' in result).toBe(false);

      const detail = await getChatItemResponseData({
        appId,
        chatId,
        chatItemDataId: responseChatItemId
      });

      expect(detail).toHaveLength(1);
      expect(detail[0]).toMatchObject({
        nodeId: 'parent_text_editor',
        childResponseCount: 1
      });
      expect(detail[0].childTotalPoints).toBeUndefined();
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

  it('drops root flowResponses for v1 while also writing flat rows', async () => {
    const restoreTextEditorDispatch = mockTextEditorWithModuleChildResponses();

    try {
      const chatId = 'workflow-v1-module-child-chat';
      const responseChatItemId = 'workflow-v1-module-child-ai-item';
      const { appId, result } = await runTextEditorWorkflowWithModuleChild({
        apiVersion: 'v1',
        chatId,
        responseChatItemId
      });

      expect('flowResponses' in result).toBe(false);

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

  it('allows final responseData callers to collect flat nodeResponses from writer memory', async () => {
    const restoreTextEditorDispatch = mockTextEditorWithModuleChildResponses();

    try {
      const { result, nodeResponseWriter } = await runTextEditorWorkflowWithModuleChild({
        apiVersion: 'v2',
        chatId: 'workflow-listener-chat',
        responseChatItemId: 'workflow-listener-ai-item',
        persistToDb: false,
        retainInMemory: true
      });

      expect('flowResponses' in result).toBe(false);
      const detail = composeNodeResponseDetail(
        nodeResponseWriter.getFlatNodeResponses().map((response) => ({ data: response }))
      );
      expect(detail).toEqual([
        expect.objectContaining({
          nodeId: 'parent_text_editor',
          childResponseCount: 1,
          childrenResponses: [
            expect.objectContaining({
              id: 'module-child-response',
              nodeId: 'module-child-node'
            })
          ]
        })
      ]);
    } finally {
      restoreTextEditorDispatch();
    }
  });

  it('collects debug nodeResponses through a no-op writer without writing chat rows', async () => {
    const restoreTextEditorDispatch = mockTextEditorWithModuleChildResponses();

    try {
      const appId = '67e0d5535c02d1d5cdede722';
      const chatId = 'workflow-debug-no-record-chat';
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
      const runningAppInfo = {
        id: appId,
        name: 'Workflow Debug App',
        teamId: '654a4107c32f3bf5f998452f',
        tmbId: '65ab7007462ada7dbb899948'
      };
      const nodeResponseWriter = await createWorkflowNodeResponseWriter({
        teamId: runningAppInfo.teamId,
        appId,
        chatId,
        chatItemDataId: 'workflow-debug-ai-item',
        persistToDb: false,
        retainInMemory: true
      });

      await runWorkflow({
        apiVersion: 'v2',
        mode: 'debug',
        chatId,
        responseChatItemId: 'workflow-debug-ai-item',
        runningAppInfo,
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
        query: [{ type: 'text', text: { content: 'debug run' } }],
        variables: {},
        chatConfig: {},
        runtimeNodes,
        runtimeEdges: [],
        variableState: await WorkflowVariableState.create({
          timezone: 'Asia/Shanghai',
          runningAppInfo,
          uid: 'test-user',
          chatId,
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
        nodeResponseWriter,
        checkIsStopping: () => false
      } as any);
      await nodeResponseWriter.close();

      const detail = composeNodeResponseDetail(
        nodeResponseWriter.getFlatNodeResponses().map((response) => ({ data: response }))
      );
      const parentResponse = detail[0];
      const childResponse = parentResponse.childrenResponses?.[0];
      expect(parentResponse).toMatchObject({
        nodeId: 'parent_text_editor',
        moduleType: FlowNodeTypeEnum.textEditor,
        childResponseCount: 1,
        childrenResponses: [expect.objectContaining({ nodeId: 'module-child-node' })]
      });
      expect(childResponse).toMatchObject({
        nodeId: 'module-child-node',
        parentId: parentResponse?.id
      });

      const rows = await MongoChatItemResponse.find({
        appId,
        chatId
      }).lean();
      expect(rows).toHaveLength(0);
    } finally {
      restoreTextEditorDispatch();
    }
  });

  it('marks caught node errors so chat bubbles can ignore recovered failures', async () => {
    const originalTextEditorDispatch = callbackMap[FlowNodeTypeEnum.textEditor];
    callbackMap[FlowNodeTypeEnum.textEditor] = vi
      .fn()
      .mockResolvedValueOnce({
        error: {
          [NodeOutputKeyEnum.errorText]: 'upstream timeout'
        },
        [DispatchNodeResponseKeyEnum.nodeResponse]: {
          errorText: 'upstream timeout'
        }
      })
      .mockResolvedValueOnce({
        data: {
          [NodeOutputKeyEnum.text]: 'fallback answer'
        },
        [DispatchNodeResponseKeyEnum.nodeResponse]: {
          textOutput: 'fallback answer'
        }
      });

    try {
      const appId = '67e0d5535c02d1d5cdede725';
      const chatId = 'workflow-caught-error-chat';
      const responseChatItemId = 'workflow-caught-error-ai-item';
      const runningAppInfo = {
        id: appId,
        name: 'Workflow Caught Error App',
        teamId: '654a4107c32f3bf5f998452f',
        tmbId: '65ab7007462ada7dbb899948'
      };
      const runtimeNodes: RuntimeNodeItemType[] = [
        makeNode('error_node', FlowNodeTypeEnum.textEditor, {
          isEntry: true,
          catchError: true,
          outputs: [makeOutput({ key: NodeOutputKeyEnum.text })]
        }),
        makeNode('fallback_node', FlowNodeTypeEnum.textEditor, {
          outputs: [makeOutput({ key: NodeOutputKeyEnum.text })]
        })
      ];
      const runtimeEdges: RuntimeEdgeItemType[] = [
        {
          ...makeEdge('error_node', 'fallback_node'),
          sourceHandle: getHandleId('error_node', 'source_catch', 'right')
        }
      ];
      const nodeResponseWriter = await createWorkflowNodeResponseWriter({
        teamId: runningAppInfo.teamId,
        appId,
        chatId,
        chatItemDataId: responseChatItemId
      });

      await runWorkflow({
        apiVersion: 'v2',
        mode: 'chat',
        chatId,
        responseChatItemId,
        runningAppInfo,
        runningUserInfo: {
          teamId: runningAppInfo.teamId,
          tmbId: runningAppInfo.tmbId,
          teamName: 'team',
          memberName: 'member',
          contact: '',
          username: 'user'
        },
        uid: 'test-user',
        lang: 'zh-CN',
        histories: [],
        query: [{ type: 'text', text: { content: 'recover' } }],
        variables: {},
        chatConfig: {},
        runtimeNodes,
        runtimeEdges,
        variableState: await WorkflowVariableState.create({
          timezone: 'Asia/Shanghai',
          runningAppInfo,
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
        nodeResponseWriter,
        checkIsStopping: () => false
      } as any);
      await nodeResponseWriter.close();

      const detail = await getChatItemResponseData({
        appId,
        chatId,
        chatItemDataId: responseChatItemId
      });

      expect(detail).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            nodeId: 'error_node',
            errorText: 'upstream timeout',
            errorCaptured: true
          }),
          expect.objectContaining({
            nodeId: 'fallback_node',
            textOutput: 'fallback answer'
          })
        ])
      );
    } finally {
      callbackMap[FlowNodeTypeEnum.textEditor] = originalTextEditorDispatch;
    }
  });

  it('returns the runtime node response id when workflow pauses on an interactive node', async () => {
    const appId = '67e0d5535c02d1d5cdede723';
    const chatId = 'workflow-interactive-node-response-chat';
    const responseChatItemId = 'workflow-interactive-node-response-ai-item';
    const runningAppInfo = {
      id: appId,
      name: 'Workflow Interactive App',
      teamId: '654a4107c32f3bf5f998452f',
      tmbId: '65ab7007462ada7dbb899948'
    };
    const runtimeNodes: RuntimeNodeItemType[] = [
      makeNode('select_node', FlowNodeTypeEnum.userSelect, {
        isEntry: true,
        inputs: [
          makeInput({
            key: NodeInputKeyEnum.description,
            value: 'Choose one',
            valueType: WorkflowIOValueTypeEnum.string
          }),
          makeInput({
            key: NodeInputKeyEnum.userSelectOptions,
            value: [
              {
                key: 'a',
                value: 'A'
              }
            ],
            valueType: WorkflowIOValueTypeEnum.arrayObject
          })
        ]
      })
    ];
    const nodeResponseWriter = await createWorkflowNodeResponseWriter({
      teamId: runningAppInfo.teamId,
      appId,
      chatId,
      chatItemDataId: responseChatItemId
    });

    const result = await runWorkflow({
      apiVersion: 'v2',
      mode: 'chat',
      chatId,
      responseChatItemId,
      runningAppInfo,
      runningUserInfo: {
        teamId: runningAppInfo.teamId,
        tmbId: runningAppInfo.tmbId,
        teamName: 'team',
        memberName: 'member',
        contact: '',
        username: 'user'
      },
      uid: 'test-user',
      lang: 'zh-CN',
      histories: [],
      query: [{ type: 'text', text: { content: 'pause' } }],
      variables: {},
      chatConfig: {},
      runtimeNodes,
      runtimeEdges: [],
      variableState: await WorkflowVariableState.create({
        timezone: 'Asia/Shanghai',
        runningAppInfo,
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
      nodeResponseWriter,
      checkIsStopping: () => false
    } as any);
    await nodeResponseWriter.close();

    const interactive = result.workflowInteractiveResponse;
    expect(interactive).toEqual(
      expect.objectContaining({
        type: 'userSelect',
        entryNodeIds: ['select_node'],
        nodeResponseId: expect.any(String)
      })
    );
    const rows = await MongoChatItemResponse.find({
      appId,
      chatId,
      chatItemDataId: responseChatItemId
    }).lean();
    expect(rows).toHaveLength(0);
  });

  it('keeps nested interactive nodeResponseIds scoped to their own layer', async () => {
    const originalToolCallDispatch = callbackMap[FlowNodeTypeEnum.toolCall];
    const childNodeResponseId = 'child_select_response';
    callbackMap[FlowNodeTypeEnum.toolCall] = vi.fn(async () => ({
      [DispatchNodeResponseKeyEnum.interactive]: {
        type: 'toolChildrenInteractive',
        params: {
          childrenResponse: {
            type: 'userSelect',
            nodeResponseId: childNodeResponseId,
            entryNodeIds: ['select_node'],
            memoryEdges: [],
            nodeOutputs: [],
            params: {
              description: 'Choose one',
              userSelectOptions: []
            }
          },
          toolParams: {
            memoryRequestMessages: [],
            toolCallId: 'call_search'
          }
        }
      },
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        totalPoints: 0
      }
    }));

    try {
      const appId = '67e0d5535c02d1d5cdede724';
      const chatId = 'workflow-nested-interactive-node-response-chat';
      const responseChatItemId = 'workflow-nested-interactive-node-response-ai-item';
      const runningAppInfo = {
        id: appId,
        name: 'Workflow Nested Interactive App',
        teamId: '654a4107c32f3bf5f998452f',
        tmbId: '65ab7007462ada7dbb899948'
      };
      const runtimeNodes: RuntimeNodeItemType[] = [
        makeNode('tool_call_node', FlowNodeTypeEnum.toolCall, {
          isEntry: true
        })
      ];
      const nodeResponseWriter = await createWorkflowNodeResponseWriter({
        teamId: runningAppInfo.teamId,
        appId,
        chatId,
        chatItemDataId: responseChatItemId
      });

      const result = await runWorkflow({
        apiVersion: 'v2',
        mode: 'chat',
        chatId,
        responseChatItemId,
        runningAppInfo,
        runningUserInfo: {
          teamId: runningAppInfo.teamId,
          tmbId: runningAppInfo.tmbId,
          teamName: 'team',
          memberName: 'member',
          contact: '',
          username: 'user'
        },
        uid: 'test-user',
        lang: 'zh-CN',
        histories: [],
        query: [{ type: 'text', text: { content: 'pause' } }],
        variables: {},
        chatConfig: {},
        runtimeNodes,
        runtimeEdges: [],
        variableState: await WorkflowVariableState.create({
          timezone: 'Asia/Shanghai',
          runningAppInfo,
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
        nodeResponseWriter,
        checkIsStopping: () => false
      } as any);
      await nodeResponseWriter.close();

      const interactive = result.workflowInteractiveResponse;
      expect(interactive).toEqual(
        expect.objectContaining({
          type: 'toolChildrenInteractive',
          entryNodeIds: ['tool_call_node'],
          nodeResponseId: expect.any(String),
          params: expect.objectContaining({
            childrenResponse: expect.objectContaining({
              nodeResponseId: childNodeResponseId
            })
          })
        })
      );
      expect(interactive?.nodeResponseId).not.toBe(childNodeResponseId);
    } finally {
      callbackMap[FlowNodeTypeEnum.toolCall] = originalToolCallDispatch;
    }
  });

  it('streams batched node responses into v2 flat rows and composes childrenResponses on detail read', async () => {
    const loopItems = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta'];
    const { runtimeNodes, runtimeEdges } = createLoopRunWorkflow(loopItems);
    const responseEvents: unknown[] = [];
    const nodeResponseWriter = await createWorkflowNodeResponseWriter({
      teamId: '654a4107c32f3bf5f998452f',
      appId: '67e0d5535c02d1d5cdede71f',
      chatId: 'workflow-persistence-chat',
      chatItemDataId: 'workflow-persistence-ai-item'
    });

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
      nodeResponseWriter,
      checkIsStopping: () => false,
      workflowStreamResponse: (event) => {
        if (event.data && event.event) {
          responseEvents.push(event.data);
        }
      }
    } as any);
    await nodeResponseWriter.close();

    expect('flowResponses' in result).toBe(false);
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
    expect(rootRow.data.childTotalPoints).toBeUndefined();

    rows
      .filter(
        (row) => row.data.moduleType === FlowNodeTypeEnum.loopRun && row.data.id !== rootRow.data.id
      )
      .forEach((row) => {
        expect(row.data.childTotalPoints).toBeUndefined();
      });

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
    expect(detail[0].childTotalPoints).toBeUndefined();
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
