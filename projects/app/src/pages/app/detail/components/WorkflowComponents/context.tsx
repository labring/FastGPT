import { postWorkflowDebug } from '@/web/core/workflow/api';
import {
  checkWorkflowNodeAndConnection,
  compareSnapshot,
  storeEdgesRenderEdge,
  storeNode2FlowNode
} from '@/web/core/workflow/utils';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { NodeOutputKeyEnum, RuntimeEdgeStatusEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import { FlowNodeItemType, StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node';
import { RuntimeEdgeItemType, StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import { FlowNodeChangeProps } from '@fastgpt/global/core/workflow/type/fe';
import { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useDebounceEffect, useLocalStorageState, useMemoizedFn, useUpdateEffect } from 'ahooks';
import React, {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import {
  Edge,
  EdgeChange,
  Node,
  NodeChange,
  OnConnectStartParams,
  useEdgesState,
  useNodesState
} from 'reactflow';
import { createContext, useContextSelector } from 'use-context-selector';
import { defaultRunningStatus } from './constants';
import { checkNodeRunStatus } from '@fastgpt/global/core/workflow/runtime/utils';
import { EventNameEnum, eventBus } from '@/web/common/utils/eventbus';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';
import { AppChatConfigType } from '@fastgpt/global/core/app/type';
import { AppContext } from '@/pages/app/detail/components/context';
import ChatTest from './Flow/ChatTest';
import { useDisclosure } from '@chakra-ui/react';
import { uiWorkflow2StoreWorkflow } from './utils';
import { useTranslation } from 'next-i18next';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { formatTime2YMDHMS, formatTime2YMDHMW } from '@fastgpt/global/common/string/time';
import type { InitProps } from '@/pages/app/detail/components/PublishHistoriesSlider';
import { cloneDeep, isEqual } from 'lodash';

type OnChange<ChangesType> = (changes: ChangesType[]) => void;

export type SnapshotsType = {
  nodes: Node[];
  edges: Edge[];
  title: string;
  chatConfig: AppChatConfigType;
  isSaved?: boolean;
};
type WorkflowContextType = {
  appId?: string;
  basicNodeTemplates: FlowNodeTemplateType[];
  filterAppIds?: string[];
  reactFlowWrapper: React.RefObject<HTMLDivElement> | null;

  // nodes
  nodes: Node<FlowNodeItemType, string | undefined>[];
  nodeList: FlowNodeItemType[];
  setNodes: Dispatch<SetStateAction<Node<FlowNodeItemType, string | undefined>[]>>;
  onNodesChange: OnChange<NodeChange>;
  hasToolNode: boolean;
  hoverNodeId?: string;
  setHoverNodeId: React.Dispatch<React.SetStateAction<string | undefined>>;
  onUpdateNodeError: (node: string, isError: Boolean) => void;
  onResetNode: (e: { id: string; node: FlowNodeTemplateType }) => void;
  onChangeNode: (e: FlowNodeChangeProps) => void;
  getNodeDynamicInputs: (nodeId: string) => FlowNodeInputItemType[];

  // edges
  edges: Edge<any>[];
  setEdges: Dispatch<SetStateAction<Edge<any>[]>>;
  onEdgesChange: OnChange<EdgeChange>;
  onDelEdge: (e: {
    nodeId: string;
    sourceHandle?: string | undefined;
    targetHandle?: string | undefined;
  }) => void;
  hoverEdgeId?: string;
  setHoverEdgeId: React.Dispatch<React.SetStateAction<string | undefined>>;

  // snapshots
  saveSnapshot: ({
    pastNodes,
    pastEdges,
    customTitle,
    chatConfig
  }: {
    pastNodes?: Node[];
    pastEdges?: Edge[];
    customTitle?: string;
    chatConfig?: AppChatConfigType;
  }) => Promise<boolean>;
  resetSnapshot: (state: SnapshotsType) => void;
  past: SnapshotsType[];
  setPast: Dispatch<SetStateAction<SnapshotsType[]>>;
  future: SnapshotsType[];
  redo: () => void;
  undo: () => void;
  canRedo: boolean;
  canUndo: boolean;

  // connect
  connectingEdge?: OnConnectStartParams;
  setConnectingEdge: React.Dispatch<React.SetStateAction<OnConnectStartParams | undefined>>;

  // common function
  onFixView: () => void;
  splitToolInputs: (
    inputs: FlowNodeInputItemType[],
    nodeId: string
  ) => {
    isTool: boolean;
    toolInputs: FlowNodeInputItemType[];
    commonInputs: FlowNodeInputItemType[];
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
  onSaveWorkflow: () => Promise<null | undefined>;
  isSaving: boolean;

  // debug
  workflowDebugData:
    | {
        runtimeNodes: RuntimeNodeItemType[];
        runtimeEdges: RuntimeEdgeItemType[];
        nextRunNodes: RuntimeNodeItemType[];
      }
    | undefined;
  onNextNodeDebug: () => Promise<void>;
  onStartNodeDebug: ({
    entryNodeId,
    runtimeNodes,
    runtimeEdges
  }: {
    entryNodeId: string;
    runtimeNodes: RuntimeNodeItemType[];
    runtimeEdges: RuntimeEdgeItemType[];
  }) => Promise<void>;
  onStopNodeDebug: () => void;

  // version history
  historiesDefaultData?: InitProps;
  setHistoriesDefaultData: React.Dispatch<React.SetStateAction<undefined | InitProps>>;

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

type DebugDataType = {
  runtimeNodes: RuntimeNodeItemType[];
  runtimeEdges: RuntimeEdgeItemType[];
  nextRunNodes: RuntimeNodeItemType[];
  variables: Record<string, any>;
};

export const WorkflowContext = createContext<WorkflowContextType>({
  isSaving: false,
  setConnectingEdge: function (
    value: React.SetStateAction<OnConnectStartParams | undefined>
  ): void {
    throw new Error('Function not implemented.');
  },
  onFixView: function (): void {
    throw new Error('Function not implemented.');
  },
  basicNodeTemplates: [],
  reactFlowWrapper: null,
  nodes: [],
  nodeList: [],
  setNodes: function (
    value: React.SetStateAction<Node<FlowNodeItemType, string | undefined>[]>
  ): void {
    throw new Error('Function not implemented.');
  },
  onNodesChange: function (changes: NodeChange[]): void {
    throw new Error('Function not implemented.');
  },
  hasToolNode: false,
  setHoverNodeId: function (value: React.SetStateAction<string | undefined>): void {
    throw new Error('Function not implemented.');
  },
  onUpdateNodeError: function (node: string, isError: Boolean): void {
    throw new Error('Function not implemented.');
  },
  edges: [],
  setEdges: function (value: React.SetStateAction<Edge<any>[]>): void {
    throw new Error('Function not implemented.');
  },
  onEdgesChange: function (changes: EdgeChange[]): void {
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
  initData: function (e: {
    nodes: StoreNodeItemType[];
    edges: StoreEdgeItemType[];
  }): Promise<void> {
    throw new Error('Function not implemented.');
  },
  workflowDebugData: undefined,
  onNextNodeDebug: function (): Promise<void> {
    throw new Error('Function not implemented.');
  },
  onStartNodeDebug: function ({
    entryNodeId,
    runtimeNodes,
    runtimeEdges
  }: {
    entryNodeId: string;
    runtimeNodes: RuntimeNodeItemType[];
    runtimeEdges: RuntimeEdgeItemType[];
  }): Promise<void> {
    throw new Error('Function not implemented.');
  },
  onStopNodeDebug: function (): void {
    throw new Error('Function not implemented.');
  },
  onChangeNode: function (e: FlowNodeChangeProps): void {
    throw new Error('Function not implemented.');
  },
  setHoverEdgeId: function (value: React.SetStateAction<string | undefined>): void {
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
  onSaveWorkflow: function (): Promise<null | undefined> {
    throw new Error('Function not implemented.');
  },
  historiesDefaultData: undefined,
  setHistoriesDefaultData: function (value: React.SetStateAction<InitProps | undefined>): void {
    throw new Error('Function not implemented.');
  },
  getNodeDynamicInputs: function (nodeId: string): FlowNodeInputItemType[] {
    throw new Error('Function not implemented.');
  },
  saveSnapshot: function (): Promise<boolean> {
    throw new Error('Function not implemented.');
  },
  resetSnapshot: function (): void {
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
  canUndo: false
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
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  const { appDetail, setAppDetail, updateAppDetail } = useContextSelector(AppContext, (v) => v);
  const appId = appDetail._id;

  /* edge */
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [hoverEdgeId, setHoverEdgeId] = useState<string>();
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
  const [nodes = [], setNodes, onNodesChange] = useNodesState<FlowNodeItemType>([]);
  const [hoverNodeId, setHoverNodeId] = useState<string>();

  const nodeListString = JSON.stringify(nodes.map((node) => node.data));
  const nodeList = useMemo(
    () => JSON.parse(nodeListString) as FlowNodeItemType[],
    [nodeListString]
  );

  const hasToolNode = useMemo(() => {
    return !!nodes.find((node) => node.data.flowNodeType === FlowNodeTypeEnum.tools);
  }, [nodes]);

  const onUpdateNodeError = useMemoizedFn((nodeId: string, isError: Boolean) => {
    setNodes((nodes) => {
      return nodes.map((item) => {
        if (item.data?.nodeId === nodeId) {
          item.selected = true;
          //@ts-ignore
          item.data.isError = isError;
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
          updateObj.inputs = updateObj.inputs.map((item) =>
            item.key === props.key ? props.value : item
          );
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

  /* function */
  const onFixView = useMemoizedFn(() => {
    const btn = document.querySelector('.custom-workflow-fix_view') as HTMLButtonElement;

    setTimeout(() => {
      btn && btn.click();
    }, 100);
  });

  /* If the module is connected by a tool, the tool input and the normal input are separated */
  const splitToolInputs = (inputs: FlowNodeInputItemType[], nodeId: string) => {
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
  };

  const initData = useMemoizedFn(
    async (e: Parameters<WorkflowContextType['initData']>[0], isInit?: boolean) => {
      /* 
        Refresh web page, load init
      */
      if (isInit && past.length > 0) {
        return resetSnapshot(past[0]);
      }

      setNodes(e.nodes?.map((item) => storeNode2FlowNode({ item, t })) || []);
      setEdges(e.edges?.map((item) => storeEdgesRenderEdge({ edge: item })) || []);

      const chatConfig = e.chatConfig;
      if (chatConfig) {
        setAppDetail((state) => ({
          ...state,
          chatConfig
        }));
      }

      // If it is the initial data, save the initial snapshot
      if (isInit) {
        saveSnapshot({
          pastNodes: e.nodes?.map((item) => storeNode2FlowNode({ item, t })) || [],
          pastEdges: e.edges?.map((item) => storeEdgesRenderEdge({ edge: item })) || [],
          customTitle: t(`app:app.version_initial`),
          chatConfig: appDetail.chatConfig,
          isSaved: true
        });
      }
    }
  );

  /* ui flow to store data */
  const flowData2StoreDataAndCheck = useMemoizedFn((hideTip = false) => {
    const checkResults = checkWorkflowNodeAndConnection({ nodes, edges });

    if (!checkResults) {
      const storeNodes = uiWorkflow2StoreWorkflow({ nodes, edges });

      return storeNodes;
    } else if (!hideTip) {
      checkResults.forEach((nodeId) => onUpdateNodeError(nodeId, true));
      toast({
        status: 'warning',
        title: t('common:core.workflow.Check Failed')
      });
    }
  });

  const flowData2StoreData = useMemoizedFn(() => {
    const storeNodes = uiWorkflow2StoreWorkflow({ nodes, edges });

    return storeNodes;
  });

  /* save workflow */
  const { runAsync: onSaveWorkflow, loading: isSaving } = useRequest2(async () => {
    const { nodes } = await getWorkflowStore();

    // version preview / debug mode, not save
    if (appDetail.version !== 'v2' || historiesDefaultData || isSaving || !!workflowDebugData)
      return;

    const storeWorkflow = uiWorkflow2StoreWorkflow({ nodes, edges });

    // check valid
    if (storeWorkflow.nodes.length === 0 || storeWorkflow.edges.length === 0) {
      return;
    }

    try {
      await updateAppDetail({
        ...storeWorkflow,
        chatConfig: appDetail.chatConfig,
        //@ts-ignore
        version: 'v2'
      });
    } catch (error) {}

    return null;
  });

  /* debug */
  const [workflowDebugData, setWorkflowDebugData] = useState<DebugDataType>();
  const onNextNodeDebug = useCallback(
    async (debugData = workflowDebugData) => {
      if (!debugData) return;
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

      // 2. Set isEntry field and get entryNodes
      const runtimeNodes = debugData.runtimeNodes.map((item) => ({
        ...item,
        isEntry: debugData.nextRunNodes.some((node) => node.nodeId === item.nodeId)
      }));
      const entryNodes = runtimeNodes.filter((item) => item.isEntry);

      const runtimeNodeStatus: Record<string, string> = entryNodes
        .map((node) => {
          const status = checkNodeRunStatus({
            node,
            runtimeEdges: debugData?.runtimeEdges || []
          });

          return {
            nodeId: node.nodeId,
            status
          };
        })
        .reduce(
          (acc, cur) => ({
            ...acc,
            [cur.nodeId]: cur.status
          }),
          {}
        );

      // 3. Set entry node status to running
      entryNodes.forEach((node) => {
        if (runtimeNodeStatus[node.nodeId] !== 'wait') {
          onChangeNode({
            nodeId: node.nodeId,
            type: 'attr',
            key: 'debugResult',
            value: defaultRunningStatus
          });
        }
      });

      try {
        // 4. Run one step
        const { finishedEdges, finishedNodes, nextStepRunNodes, flowResponses, newVariables } =
          await postWorkflowDebug({
            nodes: runtimeNodes,
            edges: debugData.runtimeEdges,
            variables: {
              appId,
              cTime: formatTime2YMDHMW(),
              ...debugData.variables
            },
            appId
          });
        // 5. Store debug result
        const newStoreDebugData = {
          runtimeNodes: finishedNodes,
          // edges need to save status
          runtimeEdges: finishedEdges,
          nextRunNodes: nextStepRunNodes,
          variables: newVariables
        };
        setWorkflowDebugData(newStoreDebugData);

        // 6. selected entry node and Update entry node debug result
        setNodes((state) =>
          state.map((node) => {
            const isEntryNode = entryNodes.some((item) => item.nodeId === node.data.nodeId);

            if (!isEntryNode || runtimeNodeStatus[node.data.nodeId] === 'wait') return node;

            const result = flowResponses.find((item) => item.nodeId === node.data.nodeId);

            if (runtimeNodeStatus[node.data.nodeId] === 'skip') {
              return {
                ...node,
                selected: isEntryNode,
                data: {
                  ...node.data,
                  debugResult: {
                    status: 'skipped',
                    showResult: true,
                    isExpired: false
                  }
                }
              };
            }
            return {
              ...node,
              selected: isEntryNode,
              data: {
                ...node.data,
                debugResult: {
                  status: 'success',
                  response: result,
                  showResult: true,
                  isExpired: false
                }
              }
            };
          })
        );

        // Check for an empty response
        if (flowResponses.length === 0 && nextStepRunNodes.length > 0) {
          onNextNodeDebug(newStoreDebugData);
        }
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
    [appId, onChangeNode, setNodes, workflowDebugData]
  );
  const onStopNodeDebug = useCallback(() => {
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
  }, [setNodes]);
  const onStartNodeDebug = useCallback(
    async ({
      entryNodeId,
      runtimeNodes,
      runtimeEdges
    }: {
      entryNodeId: string;
      runtimeNodes: RuntimeNodeItemType[];
      runtimeEdges: RuntimeEdgeItemType[];
    }) => {
      const data = {
        runtimeNodes,
        runtimeEdges,
        nextRunNodes: runtimeNodes.filter((node) => node.nodeId === entryNodeId),
        variables: {}
      };
      onStopNodeDebug();
      setWorkflowDebugData(data);

      onNextNodeDebug(data);
    },
    [onNextNodeDebug, onStopNodeDebug]
  );

  /* Version histories */
  const [historiesDefaultData, setHistoriesDefaultData] = useState<InitProps>();

  /* event bus */
  useEffect(() => {
    eventBus.on(EventNameEnum.requestWorkflowStore, () => {
      eventBus.emit(EventNameEnum.receiveWorkflowStore, {
        nodes,
        edges
      });
    });
    return () => {
      eventBus.off(EventNameEnum.requestWorkflowStore);
    };
  }, [edges, nodes]);

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
  const [past, setPast] = useLocalStorageState<SnapshotsType[]>(`${appId}-past`, {
    defaultValue: []
  }) as [SnapshotsType[], (value: SetStateAction<SnapshotsType[]>) => void];

  const [future, setFuture] = useLocalStorageState<SnapshotsType[]>(`${appId}-future`, {
    defaultValue: []
  }) as [SnapshotsType[], (value: SetStateAction<SnapshotsType[]>) => void];

  const resetSnapshot = useCallback(
    (state: SnapshotsType) => {
      setNodes(state.nodes);
      setEdges(state.edges);
      setAppDetail((detail) => ({
        ...detail,
        chatConfig: state.chatConfig
      }));
    },
    [setAppDetail, setEdges, setNodes]
  );

  const { runAsync: saveSnapshot } = useRequest2(
    async ({
      pastNodes,
      pastEdges,
      customTitle,
      chatConfig,
      isSaved
    }: {
      pastNodes?: Node[];
      pastEdges?: Edge[];
      customTitle?: string;
      chatConfig?: AppChatConfigType;
      isSaved?: boolean;
    }) => {
      const pastState = past[0];
      const currentNodes = pastNodes || nodes;
      const currentEdges = pastEdges || edges;
      const currentChatConfig = chatConfig || appDetail.chatConfig;
      const isPastEqual = compareSnapshot(
        {
          nodes: currentNodes,
          edges: currentEdges,
          chatConfig: currentChatConfig
        },
        {
          nodes: pastState?.nodes,
          edges: pastState?.edges,
          chatConfig: pastState?.chatConfig
        }
      );

      if (isPastEqual) return false;

      setPast((past) => [
        {
          nodes: currentNodes,
          edges: currentEdges,
          title: customTitle || formatTime2YMDHMS(new Date()),
          chatConfig: currentChatConfig,
          isSaved
        },
        ...past.slice(0, 199)
      ]);

      setFuture([]);

      return true;
    },
    {
      refreshDeps: [nodes, edges, appDetail.chatConfig, past]
    }
  );

  useDebounceEffect(
    () => {
      if (!nodes.length) return;
      saveSnapshot({
        pastNodes: nodes,
        pastEdges: edges,
        customTitle: formatTime2YMDHMS(new Date()),
        chatConfig: appDetail.chatConfig
      });
    },
    [nodes, edges, appDetail.chatConfig],
    { wait: 500 }
  );

  const undo = useCallback(() => {
    if (past[1]) {
      setFuture((future) => [past[0], ...future]);
      setPast((past) => past.slice(1));
      resetSnapshot(past[1]);
    }
  }, [past, setFuture, setPast, resetSnapshot]);

  const redo = useCallback(() => {
    const futureState = future[0];

    if (futureState) {
      setPast((past) => [future[0], ...past]);
      setFuture((future) => future.slice(1));
      resetSnapshot(futureState);
    }
  }, [future, setPast, setFuture, resetSnapshot]);

  // remove other app's snapshot
  useEffect(() => {
    const keys = Object.keys(localStorage);
    const snapshotKeys = keys.filter((key) => key.endsWith('-past') || key.endsWith('-future'));
    snapshotKeys.forEach((key) => {
      const keyAppId = key.split('-')[0];
      if (keyAppId !== appId) {
        localStorage.removeItem(key);
      }
    });
  }, [appId]);

  const value = {
    appId,
    reactFlowWrapper,
    basicNodeTemplates,
    // node
    nodes,
    setNodes,
    onNodesChange,
    nodeList,
    hasToolNode,
    hoverNodeId,
    setHoverNodeId,
    onUpdateNodeError,
    onResetNode,
    onChangeNode,
    getNodeDynamicInputs,

    // edge
    edges,
    setEdges,
    hoverEdgeId,
    setHoverEdgeId,
    onEdgesChange,
    connectingEdge,
    setConnectingEdge,
    onDelEdge,

    // snapshots
    past,
    setPast,
    future,
    undo,
    redo,
    saveSnapshot,
    resetSnapshot,
    canUndo: past.length > 1,
    canRedo: !!future.length,

    // function
    onFixView,
    splitToolInputs,
    initData,
    flowData2StoreDataAndCheck,
    flowData2StoreData,
    onSaveWorkflow,
    isSaving,

    // debug
    workflowDebugData,
    onNextNodeDebug,
    onStartNodeDebug,
    onStopNodeDebug,

    // version history
    historiesDefaultData,
    setHistoriesDefaultData,

    // chat test
    setWorkflowTestData
  };

  return (
    <WorkflowContext.Provider value={value}>
      {children}
      <ChatTest isOpen={isOpenTest} {...workflowTestData} onClose={onCloseTest} />
    </WorkflowContext.Provider>
  );
};

export default WorkflowContextProvider;

type GetWorkflowStoreResponse = {
  nodes: Node<FlowNodeItemType>[];
  edges: Edge<any>[];
};
export const getWorkflowStore = () =>
  new Promise<GetWorkflowStoreResponse>((resolve) => {
    eventBus.on(EventNameEnum.receiveWorkflowStore, (data: GetWorkflowStoreResponse) => {
      resolve(data);
      eventBus.off(EventNameEnum.receiveWorkflowStore);
    });
    eventBus.emit(EventNameEnum.requestWorkflowStore);
  });
