import { postWorkflowDebug } from '@/web/core/workflow/api';
import {
  adaptCatchError,
  checkWorkflowNodeAndConnection,
  compareSnapshot,
  storeEdge2RenderEdge,
  storeNode2FlowNode
} from '@/web/core/workflow/utils';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { type RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import {
  type FlowNodeItemType,
  type StoreNodeItemType
} from '@fastgpt/global/core/workflow/type/node';
import type { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node';
import {
  type RuntimeEdgeItemType,
  type StoreEdgeItemType
} from '@fastgpt/global/core/workflow/type/edge';
import {
  type FlowNodeOutputItemType,
  type FlowNodeInputItemType
} from '@fastgpt/global/core/workflow/type/io';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useMemoizedFn, useUpdateEffect } from 'ahooks';
import React, {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useMemo,
  useRef,
  useState
} from 'react';
import {
  type Edge,
  type Node,
  type OnConnectStartParams,
  ReactFlowProvider,
  useReactFlow
} from 'reactflow';
import { createContext, useContextSelector } from 'use-context-selector';
import { defaultRunningStatus } from '../constants';
import { checkNodeRunStatus } from '@fastgpt/global/core/workflow/runtime/utils';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';
import { type AppChatConfigType } from '@fastgpt/global/core/app/type';
import { AppContext } from '@/pageComponents/app/detail/context';
import ChatTest from '../Flow/ChatTest';
import { useDisclosure } from '@chakra-ui/react';
import { uiWorkflow2StoreWorkflow } from '../utils';
import { useTranslation } from 'next-i18next';
import { formatTime2YMDHMS, formatTime2YMDHMW } from '@fastgpt/global/common/string/time';
import { cloneDeep } from 'lodash';
import { type AppVersionSchemaType } from '@fastgpt/global/core/app/version';
import WorkflowInitContextProvider, { WorkflowNodeEdgeContext } from './workflowInitContext';
import WorkflowEventContextProvider from './workflowEventContext';
import WorkflowStatusContextProvider from './workflowStatusContext';
import { type ChatItemType, type UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { type WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { FlowNodeOutputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import type { WorkflowDebugResponse } from '@fastgpt/service/core/workflow/dispatch/type';

/* 
  Context
  1. WorkflowInitContext: 带 nodes
  2. WorkflowNodeEdgeContext: 除了 nodes 外的，nodes 操作。以及 edges 和其操作
  3. WorkflowContextProvider: 旧的 context，未拆分
  4. WorkflowEventContextProvider：一些边缘的 event
*/
export const ReactFlowCustomProvider = ({
  templates,
  children
}: {
  templates: FlowNodeTemplateType[];
  children: React.ReactNode;
}) => {
  return (
    <ReactFlowProvider>
      <WorkflowInitContextProvider>
        <WorkflowContextProvider basicNodeTemplates={templates}>
          <WorkflowEventContextProvider>
            <WorkflowStatusContextProvider>{children}</WorkflowStatusContextProvider>
          </WorkflowEventContextProvider>
        </WorkflowContextProvider>
      </WorkflowInitContextProvider>
    </ReactFlowProvider>
  );
};

export type WorkflowStateType = {
  nodes: Node[];
  edges: Edge[];
  chatConfig: AppChatConfigType;
};
export type WorkflowSnapshotsType = WorkflowStateType & {
  title: string;
  isSaved?: boolean;

  // abandon
  state?: WorkflowStateType;
  diff?: any;
};

type FlowNodeChangeProps = { nodeId: string } & (
  | {
      type: 'attr'; // key: attr, value: new value
      key: string;
      value: any;
    }
  | {
      type: 'updateInput'; // key: update input key, value: new input value
      key: string;
      value: FlowNodeInputItemType;
    }
  | {
      type: 'replaceInput'; // key: old input key, value: new input value
      key: string;
      value: FlowNodeInputItemType;
    }
  | {
      type: 'addInput'; // key: null, value: new input value
      value: FlowNodeInputItemType;
      index?: number;
    }
  | {
      type: 'delInput'; // key: delete input key, value: null
      key: string;
    }
  | {
      type: 'updateOutput'; // key: update output key, value: new output value
      key: string;
      value: FlowNodeOutputItemType;
    }
  | {
      type: 'replaceOutput'; // key: old output key, value: new output value
      key: string;
      value: FlowNodeOutputItemType;
    }
  | {
      type: 'addOutput'; // key: null, value: new output value
      value: FlowNodeOutputItemType;
      index?: number;
    }
  | {
      type: 'delOutput'; // key: delete output key, value: null
      key: string;
    }
);

type WorkflowContextType = {
  appId?: string;
  basicNodeTemplates: FlowNodeTemplateType[];
  filterAppIds?: string[];

  // nodes
  nodeList: FlowNodeItemType[];

  onUpdateNodeError: (node: string, isError: Boolean) => void;
  onRemoveError: () => void;
  onResetNode: (e: { id: string; node: FlowNodeTemplateType }) => void;
  onChangeNode: (e: FlowNodeChangeProps) => void;
  getNodeDynamicInputs: (nodeId: string) => FlowNodeInputItemType[];

  // edges
  onDelEdge: (e: {
    nodeId: string;
    sourceHandle?: string | undefined;
    targetHandle?: string | undefined;
  }) => void;

  onSwitchTmpVersion: (data: WorkflowSnapshotsType, customTitle: string) => boolean;
  onSwitchCloudVersion: (appVersion: AppVersionSchemaType) => boolean;
  past: WorkflowSnapshotsType[];
  setPast: Dispatch<SetStateAction<WorkflowSnapshotsType[]>>;
  future: WorkflowSnapshotsType[];
  redo: () => void;
  undo: () => void;
  canRedo: boolean;
  canUndo: boolean;
  pushPastSnapshot: ({
    pastNodes,
    pastEdges,
    customTitle,
    chatConfig,
    isSaved
  }: {
    pastNodes: Node[];
    pastEdges: Edge[];
    customTitle?: string;
    chatConfig: AppChatConfigType;
    isSaved?: boolean;
  }) => boolean;

  // connect
  connectingEdge?: OnConnectStartParams;
  setConnectingEdge: React.Dispatch<React.SetStateAction<OnConnectStartParams | undefined>>;

  // common function
  splitToolInputs: (
    inputs: FlowNodeInputItemType[],
    nodeId: string
  ) => {
    isTool: boolean;
    toolInputs: FlowNodeInputItemType[];
    commonInputs: FlowNodeInputItemType[];
  };
  splitOutput: (outputs: FlowNodeOutputItemType[]) => {
    successOutputs: FlowNodeOutputItemType[];
    hiddenOutputs: FlowNodeOutputItemType[];
    errorOutputs: FlowNodeOutputItemType[];
  };
  initData: (
    e: {
      nodes: StoreNodeItemType[];
      edges: StoreEdgeItemType[];
      chatConfig?: AppChatConfigType;
    },
    isSetInitial?: boolean
  ) => Promise<void>;
  flowData2StoreDataAndCheck: (hideTip?: boolean) =>
    | {
        nodes: StoreNodeItemType[];
        edges: StoreEdgeItemType[];
      }
    | undefined;
  flowData2StoreData: () =>
    | {
        nodes: StoreNodeItemType[];
        edges: StoreEdgeItemType[];
      }
    | undefined;

  // debug
  workflowDebugData?: DebugDataType;
  onNextNodeDebug: (params: DebugDataType) => Promise<void>;
  onStartNodeDebug: ({
    entryNodeId,
    runtimeNodes,
    runtimeEdges,
    variables,
    query,
    history
  }: {
    entryNodeId: string;
    runtimeNodes: RuntimeNodeItemType[];
    runtimeEdges: RuntimeEdgeItemType[];
    variables: Record<string, any>;
    query?: UserChatItemValueItemType[];
    history?: ChatItemType[];
  }) => Promise<void>;
  onStopNodeDebug: () => void;

  // chat test
  setWorkflowTestData: React.Dispatch<
    React.SetStateAction<
      | {
          nodes: StoreNodeItemType[];
          edges: StoreEdgeItemType[];
        }
      | undefined
    >
  >;
};

export type DebugDataType = {
  runtimeNodes: RuntimeNodeItemType[];
  runtimeEdges: RuntimeEdgeItemType[];
  entryNodeIds: string[];
  skipNodeQueue?: WorkflowDebugResponse['skipNodeQueue'];

  variables: Record<string, any>;
  history?: ChatItemType[];
  query?: UserChatItemValueItemType[];
  workflowInteractiveResponse?: WorkflowInteractiveResponseType;
};

export const WorkflowContext = createContext<WorkflowContextType>({
  setConnectingEdge: function (
    value: React.SetStateAction<OnConnectStartParams | undefined>
  ): void {
    throw new Error('Function not implemented.');
  },
  basicNodeTemplates: [],
  nodeList: [],
  onUpdateNodeError: function (node: string, isError: Boolean): void {
    throw new Error('Function not implemented.');
  },
  onResetNode: function (e: { id: string; node: FlowNodeTemplateType }): void {
    throw new Error('Function not implemented.');
  },

  onDelEdge: function (e: {
    nodeId: string;
    sourceHandle?: string | undefined;
    targetHandle?: string | undefined;
  }): void {
    throw new Error('Function not implemented.');
  },
  splitToolInputs: function (
    inputs: FlowNodeInputItemType[],
    nodeId: string
  ): {
    isTool: boolean;
    toolInputs: FlowNodeInputItemType[];
    commonInputs: FlowNodeInputItemType[];
  } {
    throw new Error('Function not implemented.');
  },
  splitOutput: function (outputs: FlowNodeOutputItemType[]): {
    successOutputs: FlowNodeOutputItemType[];
    hiddenOutputs: FlowNodeOutputItemType[];
    errorOutputs: FlowNodeOutputItemType[];
  } {
    throw new Error('Function not implemented.');
  },
  initData: function (e: {
    nodes: StoreNodeItemType[];
    edges: StoreEdgeItemType[];
  }): Promise<void> {
    throw new Error('Function not implemented.');
  },
  workflowDebugData: undefined,
  onNextNodeDebug: function (params?: {
    history?: ChatItemType[];
    query?: UserChatItemValueItemType[];
    debugData?: DebugDataType;
  }): Promise<void> {
    throw new Error('Function not implemented.');
  },
  onStartNodeDebug: function ({
    entryNodeId,
    runtimeNodes,
    runtimeEdges,
    query,
    history
  }: {
    entryNodeId: string;
    runtimeNodes: RuntimeNodeItemType[];
    runtimeEdges: RuntimeEdgeItemType[];
    query?: UserChatItemValueItemType[];
    history?: ChatItemType[];
  }): Promise<void> {
    throw new Error('Function not implemented.');
  },
  onStopNodeDebug: function (): void {
    throw new Error('Function not implemented.');
  },
  onChangeNode: function (e: FlowNodeChangeProps): void {
    throw new Error('Function not implemented.');
  },
  setWorkflowTestData: function (
    value: React.SetStateAction<
      { nodes: StoreNodeItemType[]; edges: StoreEdgeItemType[] } | undefined
    >
  ): void {
    throw new Error('Function not implemented.');
  },
  flowData2StoreDataAndCheck: function ():
    | { nodes: StoreNodeItemType[]; edges: StoreEdgeItemType[] }
    | undefined {
    throw new Error('Function not implemented.');
  },
  flowData2StoreData: function ():
    | { nodes: StoreNodeItemType[]; edges: StoreEdgeItemType[] }
    | undefined {
    throw new Error('Function not implemented.');
  },
  getNodeDynamicInputs: function (nodeId: string): FlowNodeInputItemType[] {
    throw new Error('Function not implemented.');
  },
  past: [],
  setPast: function (): void {
    throw new Error('Function not implemented.');
  },
  future: [],
  redo: function (): void {
    throw new Error('Function not implemented.');
  },
  undo: function (): void {
    throw new Error('Function not implemented.');
  },
  canRedo: false,
  canUndo: false,

  onSwitchTmpVersion: function (data: WorkflowSnapshotsType, customTitle: string): boolean {
    throw new Error('Function not implemented.');
  },
  onSwitchCloudVersion: function (appVersion: AppVersionSchemaType): boolean {
    throw new Error('Function not implemented.');
  },

  pushPastSnapshot: function ({
    pastNodes,
    pastEdges,
    customTitle,
    chatConfig,
    isSaved
  }: {
    pastNodes: Node[];
    pastEdges: Edge[];
    customTitle?: string;
    chatConfig: AppChatConfigType;
    isSaved?: boolean;
  }): boolean {
    throw new Error('Function not implemented.');
  },
  onRemoveError: function (): void {
    throw new Error('Function not implemented.');
  }
});

const WorkflowContextProvider = ({
  children,
  basicNodeTemplates
}: {
  children: React.ReactNode;
  basicNodeTemplates: FlowNodeTemplateType[];
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const { chatId } = useChatStore();

  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const setAppDetail = useContextSelector(AppContext, (v) => v.setAppDetail);
  const appId = appDetail._id;

  /* edge */
  const edges = useContextSelector(WorkflowNodeEdgeContext, (state) => state.edges);
  const setEdges = useContextSelector(WorkflowNodeEdgeContext, (state) => state.setEdges);
  const onDelEdge = useCallback(
    ({
      nodeId,
      sourceHandle,
      targetHandle
    }: {
      nodeId: string;
      sourceHandle?: string | undefined;
      targetHandle?: string | undefined;
    }) => {
      if (!sourceHandle && !targetHandle) return;
      setEdges((state) =>
        state.filter((edge) => {
          if (edge.source === nodeId && edge.sourceHandle === sourceHandle) return false;
          if (edge.target === nodeId && edge.targetHandle === targetHandle) return false;

          return true;
        })
      );
    },
    [setEdges]
  );

  /* connect */
  const [connectingEdge, setConnectingEdge] = useState<OnConnectStartParams>();

  /* node */
  const setNodes = useContextSelector(WorkflowNodeEdgeContext, (state) => state.setNodes);
  const getNodes = useContextSelector(WorkflowNodeEdgeContext, (state) => state.getNodes);
  const nodeListString = useContextSelector(
    WorkflowNodeEdgeContext,
    (state) => state.nodeListString
  );
  const nodeList = useMemo(
    () => JSON.parse(nodeListString) as FlowNodeItemType[],
    [nodeListString]
  );

  const onUpdateNodeError = useMemoizedFn((nodeId: string, isError: Boolean) => {
    setNodes((state) => {
      return state.map((item) => {
        if (item.data?.nodeId === nodeId) {
          item.selected = true;
          //@ts-ignore
          item.data.isError = isError;
        }
        return item;
      });
    });
  });
  const onRemoveError = useMemoizedFn(() => {
    setNodes((state) => {
      return state.map((item) => {
        if (item.data.isError) {
          item.data.isError = false;
          item.selected = false;
        }
        return item;
      });
    });
  });

  // reset a node data. delete edge and replace it
  const onResetNode = useMemoizedFn(({ id, node }: { id: string; node: FlowNodeTemplateType }) => {
    setNodes((state) =>
      state.map((item) => {
        if (item.id === id) {
          return {
            ...item,
            data: {
              ...item.data,
              ...node,
              inputs: node.inputs.map((input) => {
                const value =
                  item.data.inputs.find((i) => i.key === input.key)?.value ?? input.value;
                return {
                  ...input,
                  value
                };
              })
            }
          };
        }
        return item;
      })
    );
  });

  const onChangeNode = useMemoizedFn((props: FlowNodeChangeProps) => {
    const { nodeId, type } = props;
    setNodes((nodes) => {
      return nodes.map((node) => {
        if (node.id !== nodeId) return node;

        const updateObj = cloneDeep(node.data);

        if (type === 'attr') {
          if (props.key) {
            // @ts-ignore
            updateObj[props.key] = props.value;
          }
        } else if (type === 'updateInput') {
          updateObj.inputs = node.data.inputs.map((item) =>
            item.key === props.key ? props.value : item
          );
        } else if (type === 'replaceInput') {
          if (!updateObj.inputs.find((item) => item.key === props.key)) {
            updateObj.inputs.push(props.value);
          } else {
            updateObj.inputs = updateObj.inputs.map((item) =>
              item.key === props.key ? props.value : item
            );
          }
        } else if (type === 'addInput') {
          const input = node.data.inputs.find((input) => input.key === props.value.key);
          if (input) {
            toast({
              status: 'warning',
              title: t('common:key_repetition')
            });
          } else {
            updateObj.inputs.push(props.value);
          }
        } else if (type === 'delInput') {
          updateObj.inputs = node.data.inputs.filter((item) => item.key !== props.key);
        } else if (type === 'updateOutput') {
          updateObj.outputs = node.data.outputs.map((item) =>
            item.key === props.key ? props.value : item
          );
        } else if (type === 'replaceOutput') {
          onDelEdge({ nodeId, sourceHandle: getHandleId(nodeId, 'source', props.key) });
          updateObj.outputs = updateObj.outputs.map((item) =>
            item.key === props.key ? props.value : item
          );
        } else if (type === 'addOutput') {
          const output = node.data.outputs.find((output) => output.key === props.value.key);
          if (output) {
            toast({
              status: 'warning',
              title: t('common:key_repetition')
            });
            updateObj.outputs = node.data.outputs;
          } else {
            if (props.index !== undefined) {
              const outputs = [...node.data.outputs];
              outputs.splice(props.index, 0, props.value);
              updateObj.outputs = outputs;
            } else {
              updateObj.outputs = node.data.outputs.concat(props.value);
            }
          }
        } else if (type === 'delOutput') {
          onDelEdge({ nodeId, sourceHandle: getHandleId(nodeId, 'source', props.key) });
          updateObj.outputs = node.data.outputs.filter((item) => item.key !== props.key);
        }

        return {
          ...node,
          data: updateObj
        };
      });
    });
  });
  const getNodeDynamicInputs = useCallback(
    (nodeId: string) => {
      const node = nodeList.find((node) => node.nodeId === nodeId);
      if (!node) return [];

      const dynamicInputs = node.inputs.filter((input) => input.canEdit);

      return dynamicInputs;
    },
    [nodeList]
  );

  /* If the module is connected by a tool, the tool input and the normal input are separated */
  const splitToolInputs = useCallback(
    (inputs: FlowNodeInputItemType[], nodeId: string) => {
      const isTool = !!edges.find(
        (edge) => edge.targetHandle === NodeOutputKeyEnum.selectedTools && edge.target === nodeId
      );

      return {
        isTool,
        toolInputs: inputs.filter((item) => isTool && item.toolDescription),
        commonInputs: inputs.filter((item) => {
          if (!isTool) return true;
          return !item.toolDescription;
        })
      };
    },
    [edges]
  );
  const splitOutput = useCallback((outputs: FlowNodeOutputItemType[]) => {
    return {
      successOutputs: outputs.filter(
        (item) =>
          item.type === FlowNodeOutputTypeEnum.dynamic ||
          item.type === FlowNodeOutputTypeEnum.static ||
          item.type === FlowNodeOutputTypeEnum.source
      ),
      hiddenOutputs: outputs.filter((item) => item.type === FlowNodeOutputTypeEnum.hidden),
      errorOutputs: outputs.filter((item) => item.type === FlowNodeOutputTypeEnum.error)
    };
  }, []);

  /* ui flow to store data */
  const { fitView } = useReactFlow();
  const flowData2StoreDataAndCheck = useMemoizedFn((hideTip = false) => {
    const nodes = getNodes();
    const checkResults = checkWorkflowNodeAndConnection({ nodes, edges });

    if (!checkResults) {
      onRemoveError();
      const storeWorkflow = uiWorkflow2StoreWorkflow({ nodes, edges });

      return storeWorkflow;
    } else if (!hideTip) {
      checkResults.forEach((nodeId) => onUpdateNodeError(nodeId, true));

      // View move to the node that failed
      fitView({
        nodes: nodes.filter((node) => checkResults.includes(node.data.nodeId))
      });

      toast({
        status: 'warning',
        title: t('common:core.workflow.Check Failed')
      });
    }
  });

  const flowData2StoreData = useMemoizedFn(() => {
    const nodes = getNodes();
    return uiWorkflow2StoreWorkflow({ nodes, edges });
  });

  /* debug */
  const [workflowDebugData, setWorkflowDebugData] = useState<DebugDataType>();
  const onNextNodeDebug = useCallback(
    async (debugData: DebugDataType) => {
      // 1. Cancel node selected status and debugResult.showStatus
      setNodes((state) =>
        state.map((node) => ({
          ...node,
          selected: false,
          data: {
            ...node.data,
            debugResult: node.data.debugResult
              ? {
                  ...node.data.debugResult,
                  showResult: false,
                  isExpired: true
                }
              : undefined
          }
        }))
      );

      // 2. Set isEntry field and get entryNodes, and set running status
      const runtimeNodes = debugData.runtimeNodes.map((item) => ({
        ...item,
        isEntry: debugData.entryNodeIds.some((id) => id === item.nodeId)
      }));
      const entryNodes = runtimeNodes.filter((item) => {
        if (item.isEntry) {
          onChangeNode({
            nodeId: item.nodeId,
            type: 'attr',
            key: 'debugResult',
            value: defaultRunningStatus
          });
          return true;
        }
      });

      try {
        // 3. Run one step
        const {
          memoryEdges,
          memoryNodes,
          entryNodeIds,
          skipNodeQueue,
          nodeResponses,
          newVariables
        } = await postWorkflowDebug({
          nodes: runtimeNodes,
          edges: debugData.runtimeEdges,
          skipNodeQueue: debugData.skipNodeQueue,
          variables: {
            appId,
            cTime: formatTime2YMDHMW(),
            ...debugData.variables
          },
          query: debugData.query, // 添加 query 参数
          history: debugData.history,
          appId,
          chatConfig: appDetail.chatConfig
        });

        // 4. Store debug result
        setWorkflowDebugData({
          runtimeNodes: memoryNodes,
          runtimeEdges: memoryEdges,
          entryNodeIds,
          skipNodeQueue,
          variables: newVariables
        });

        // 5. selected entry node and Update entry node debug result
        setNodes((state) =>
          state.map((node) => {
            const isEntryNode = entryNodes.some((item) => item.nodeId === node.data.nodeId);

            const result = nodeResponses[node.data.nodeId];
            if (!result) return node;
            return {
              ...node,
              selected: result.type === 'run' && isEntryNode,
              data: {
                ...node.data,
                debugResult: {
                  status: result.type === 'run' ? 'success' : 'skipped',
                  response: result.response,
                  showResult: true,
                  isExpired: false,
                  workflowInteractiveResponse: result.interactiveResponse
                }
              }
            };
          })
        );

        // Check for an empty response(Skip node)
        // if (!workflowInteractiveResponse && flowResponses.length === 0 && entryNodeIds.length > 0) {
        //   onNextNodeDebug(debugData);
        // }
      } catch (error) {
        entryNodes.forEach((node) => {
          onChangeNode({
            nodeId: node.nodeId,
            type: 'attr',
            key: 'debugResult',
            value: {
              status: 'failed',
              message: getErrText(error, 'Debug failed'),
              showResult: true
            }
          });
        });
        console.log(error);
      }
    },
    [appId, onChangeNode, setNodes, appDetail.chatConfig]
  );
  const onStopNodeDebug = useMemoizedFn(() => {
    setWorkflowDebugData(undefined);
    setNodes((state) =>
      state.map((node) => ({
        ...node,
        selected: false,
        data: {
          ...node.data,
          debugResult: undefined
        }
      }))
    );
  });
  const onStartNodeDebug = useMemoizedFn(
    async ({
      entryNodeId,
      runtimeNodes,
      runtimeEdges,
      variables,
      query,
      history
    }: {
      entryNodeId: string;
      runtimeNodes: RuntimeNodeItemType[];
      runtimeEdges: RuntimeEdgeItemType[];
      variables: Record<string, any>;
      query?: UserChatItemValueItemType[];
      history?: ChatItemType[];
    }) => {
      const data: DebugDataType = {
        runtimeNodes,
        runtimeEdges,
        entryNodeIds: runtimeNodes
          .filter((node) => node.nodeId === entryNodeId)
          .map((node) => node.nodeId),
        skipNodeQueue: [],
        variables,
        query,
        history
      };
      onStopNodeDebug();
      setWorkflowDebugData(data);

      onNextNodeDebug(data);
    }
  );

  /* chat test */
  const { isOpen: isOpenTest, onOpen: onOpenTest, onClose: onCloseTest } = useDisclosure();
  const [workflowTestData, setWorkflowTestData] = useState<{
    nodes: StoreNodeItemType[];
    edges: StoreEdgeItemType[];
  }>();
  useUpdateEffect(() => {
    onOpenTest();
  }, [workflowTestData]);

  /* snapshots */
  const forbiddenSaveSnapshot = useRef(false);
  const [past, setPast] = useState<WorkflowSnapshotsType[]>([]);
  const [future, setFuture] = useState<WorkflowSnapshotsType[]>([]);

  const resetSnapshot = useMemoizedFn((state: WorkflowStateType) => {
    setNodes(state.nodes);
    setEdges(state.edges);
    setAppDetail((detail) => ({
      ...detail,
      chatConfig: state.chatConfig
    }));
  });

  const pushPastSnapshot = useMemoizedFn(
    ({ pastNodes, pastEdges, chatConfig, customTitle, isSaved }) => {
      if (!pastNodes || !pastEdges || !chatConfig) return false;
      if (forbiddenSaveSnapshot.current) {
        forbiddenSaveSnapshot.current = false;
        return false;
      }

      const isPastEqual = compareSnapshot(
        {
          nodes: pastNodes,
          edges: pastEdges,
          chatConfig: chatConfig
        },
        {
          nodes: past[0]?.nodes,
          edges: past[0]?.edges,
          chatConfig: past[0]?.chatConfig
        }
      );

      if (isPastEqual) return false;

      setFuture([]);
      setPast((past) => [
        {
          nodes: pastNodes,
          edges: pastEdges,
          title: customTitle || formatTime2YMDHMS(new Date()),
          chatConfig,
          isSaved
        },
        ...past.slice(0, 99)
      ]);

      return true;
    }
  );

  const onSwitchTmpVersion = useMemoizedFn((params: WorkflowSnapshotsType, customTitle: string) => {
    // Remove multiple "copy-"
    const copyText = t('app:version_copy');
    const regex = new RegExp(`(${copyText}-)\\1+`, 'g');
    const title = customTitle.replace(regex, `$1`);

    resetSnapshot(params);

    return pushPastSnapshot({
      pastNodes: params.nodes,
      pastEdges: params.edges,
      chatConfig: params.chatConfig,
      customTitle: title
    });
  });
  const onSwitchCloudVersion = useMemoizedFn((appVersion: AppVersionSchemaType) => {
    const nodes = appVersion.nodes.map((item) => storeNode2FlowNode({ item, t }));
    const edges = appVersion.edges.map((item) => storeEdge2RenderEdge({ edge: item }));
    const chatConfig = appVersion.chatConfig;

    resetSnapshot({
      nodes,
      edges,
      chatConfig
    });
    return pushPastSnapshot({
      pastNodes: nodes,
      pastEdges: edges,
      chatConfig,
      customTitle: `${t('app:version_copy')}-${appVersion.versionName}`
    });
  });

  const undo = useMemoizedFn(() => {
    if (past.length > 1) {
      forbiddenSaveSnapshot.current = true;
      // Current version is the first one, so we need to reset the second one
      const firstPast = past[1];
      resetSnapshot(firstPast);

      setFuture((future) => [past[0], ...future]);
      setPast((past) => past.slice(1));
    }
  });
  const redo = useMemoizedFn(() => {
    if (!future[0]) return;

    const futureState = future[0];

    if (futureState) {
      forbiddenSaveSnapshot.current = true;
      setPast((past) => [futureState, ...past]);
      setFuture((future) => future.slice(1));

      resetSnapshot(futureState);
    }
  });

  const initData = useCallback(
    async (
      e: {
        nodes: StoreNodeItemType[];
        edges: StoreEdgeItemType[];
        chatConfig?: AppChatConfigType;
      },
      isInit?: boolean
    ) => {
      adaptCatchError(e.nodes, e.edges);

      const nodes = e.nodes?.map((item) => storeNode2FlowNode({ item, t })) || [];
      const edges = e.edges?.map((item) => storeEdge2RenderEdge({ edge: item })) || [];

      // 有历史记录，直接用历史记录覆盖
      if (isInit && past.length > 0) {
        const firstPast = past[0];
        setNodes(firstPast.nodes);
        setEdges(firstPast.edges);
        setAppDetail((state) => ({ ...state, chatConfig: firstPast.chatConfig }));
        return;
      }
      // 初始化一个历史记录
      if (isInit && past.length === 0) {
        setPast([
          {
            nodes: nodes,
            edges: edges,
            title: t(`app:app.version_initial`),
            isSaved: true,
            chatConfig: e.chatConfig || appDetail.chatConfig
          }
        ]);
      }

      // Init memory data
      setNodes(nodes);
      setEdges(edges);
      if (e.chatConfig) {
        setAppDetail((state) => ({ ...state, chatConfig: e.chatConfig as AppChatConfigType }));
      }
    },
    [appDetail.chatConfig, past, setAppDetail, setEdges, setNodes, t]
  );

  const value = useMemo(
    () => ({
      appId,
      basicNodeTemplates,

      // node
      nodeList,
      onUpdateNodeError,
      onRemoveError,
      onResetNode,
      onChangeNode,
      getNodeDynamicInputs,

      // edge
      connectingEdge,
      setConnectingEdge,
      onDelEdge,

      // snapshots
      past,
      setPast,
      future,
      undo,
      redo,
      canUndo: past.length > 1,
      canRedo: !!future.length,
      onSwitchTmpVersion,
      onSwitchCloudVersion,
      pushPastSnapshot,

      // function
      splitToolInputs,
      splitOutput,
      initData,
      flowData2StoreDataAndCheck,
      flowData2StoreData,

      // debug
      workflowDebugData,
      onNextNodeDebug,
      onStartNodeDebug,
      onStopNodeDebug,

      // chat test
      setWorkflowTestData
    }),
    [
      appId,
      basicNodeTemplates,
      connectingEdge,
      flowData2StoreData,
      flowData2StoreDataAndCheck,
      future,
      getNodeDynamicInputs,
      initData,
      nodeList,
      onChangeNode,
      onDelEdge,
      onNextNodeDebug,
      onRemoveError,
      onResetNode,
      onStartNodeDebug,
      onStopNodeDebug,
      onSwitchCloudVersion,
      onSwitchTmpVersion,
      onUpdateNodeError,
      past,
      pushPastSnapshot,
      redo,
      splitOutput,
      splitToolInputs,
      undo,
      workflowDebugData
    ]
  );

  return (
    <WorkflowContext.Provider value={value}>
      {children}
      <ChatTest isOpen={isOpenTest} {...workflowTestData} onClose={onCloseTest} chatId={chatId} />
    </WorkflowContext.Provider>
  );
};
export default React.memo(WorkflowContextProvider);
