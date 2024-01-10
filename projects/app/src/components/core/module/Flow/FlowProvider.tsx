import {
  type Node,
  type NodeChange,
  type Edge,
  type EdgeChange,
  useNodesState,
  useEdgesState,
  Connection,
  addEdge
} from 'reactflow';
import type {
  FlowModuleItemType,
  FlowModuleTemplateType
} from '@fastgpt/global/core/module/type.d';
import type { FlowNodeChangeProps } from '@fastgpt/global/core/module/node/type';
import React, {
  type SetStateAction,
  type Dispatch,
  useContext,
  useCallback,
  createContext,
  useRef,
  useEffect
} from 'react';
import { customAlphabet } from 'nanoid';
import { appModule2FlowEdge, appModule2FlowNode } from '@/utils/adapt';
import { useToast } from '@/web/common/hooks/useToast';
import { EDGE_TYPE, FlowNodeTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { ModuleIOValueTypeEnum } from '@fastgpt/global/core/module/constants';
import { useTranslation } from 'next-i18next';
import { ModuleItemType } from '@fastgpt/global/core/module/type.d';
import { EventNameEnum, eventBus } from '@/web/common/utils/eventbus';

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 6);

type OnChange<ChangesType> = (changes: ChangesType[]) => void;
export type useFlowProviderStoreType = {
  reactFlowWrapper: null | React.RefObject<HTMLDivElement>;
  mode: 'app' | 'plugin';
  filterAppIds: string[];
  nodes: Node<FlowModuleItemType, string | undefined>[];
  setNodes: Dispatch<SetStateAction<Node<FlowModuleItemType, string | undefined>[]>>;
  onNodesChange: OnChange<NodeChange>;
  edges: Edge<any>[];
  setEdges: Dispatch<SetStateAction<Edge<any>[]>>;
  onEdgesChange: OnChange<EdgeChange>;
  onFixView: () => void;
  onDelNode: (nodeId: string) => void;
  onChangeNode: (e: FlowNodeChangeProps) => void;
  onCopyNode: (nodeId: string) => void;
  onResetNode: (e: { id: string; module: FlowModuleTemplateType }) => void;
  onDelEdge: (e: {
    moduleId: string;
    sourceHandle?: string | undefined;
    targetHandle?: string | undefined;
  }) => void;
  onDelConnect: (id: string) => void;
  onConnect: ({ connect }: { connect: Connection }) => any;
  initData: (modules: ModuleItemType[]) => void;
};
type requestEventType =
  | 'onChangeNode'
  | 'onCopyNode'
  | 'onResetNode'
  | 'onDelNode'
  | 'onDelConnect'
  | 'setNodes';

const StateContext = createContext<useFlowProviderStoreType>({
  reactFlowWrapper: null,
  mode: 'app',
  filterAppIds: [],
  nodes: [],
  setNodes: function (
    value: React.SetStateAction<Node<FlowModuleItemType, string | undefined>[]>
  ): void {
    return;
  },
  onNodesChange: function (changes: NodeChange[]): void {
    return;
  },
  edges: [],
  setEdges: function (value: React.SetStateAction<Edge<any>[]>): void {
    return;
  },
  onEdgesChange: function (changes: EdgeChange[]): void {
    return;
  },
  onFixView: function (): void {
    return;
  },
  onDelNode: function (nodeId: string): void {
    return;
  },
  onChangeNode: function (e: FlowNodeChangeProps): void {
    return;
  },
  onCopyNode: function (nodeId: string): void {
    return;
  },
  onDelEdge: function (e: {
    moduleId: string;
    sourceHandle?: string | undefined;
    targetHandle?: string | undefined;
  }): void {
    return;
  },
  onDelConnect: function (id: string): void {
    return;
  },
  onConnect: function ({ connect }: { connect: Connection }) {
    return;
  },
  initData: function (modules: ModuleItemType[]): void {
    throw new Error('Function not implemented.');
  },
  onResetNode: function (e): void {
    throw new Error('Function not implemented.');
  }
});
export const useFlowProviderStore = () => useContext(StateContext);

export const FlowProvider = ({
  mode,
  filterAppIds = [],
  children
}: {
  mode: useFlowProviderStoreType['mode'];
  filterAppIds?: string[];
  children: React.ReactNode;
}) => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();
  const { toast } = useToast();
  const [nodes = [], setNodes, onNodesChange] = useNodesState<FlowModuleItemType>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const onFixView = useCallback(() => {
    const btn = document.querySelector('.react-flow__controls-fitview') as HTMLButtonElement;

    setTimeout(() => {
      btn && btn.click();
    }, 100);
  }, []);

  const onDelEdge = useCallback(
    ({
      moduleId,
      sourceHandle,
      targetHandle
    }: {
      moduleId: string;
      sourceHandle?: string | undefined;
      targetHandle?: string | undefined;
    }) => {
      if (!sourceHandle && !targetHandle) return;
      setEdges((state) =>
        state.filter((edge) => {
          if (edge.source === moduleId && edge.sourceHandle === sourceHandle) return false;
          if (edge.target === moduleId && edge.targetHandle === targetHandle) return false;

          return true;
        })
      );
    },
    [setEdges]
  );

  const onDelConnect = useCallback(
    (id: string) => {
      setEdges((state) => state.filter((item) => item.id !== id));
    },
    [setEdges]
  );

  const onConnect = useCallback(
    ({ connect }: { connect: Connection }) => {
      const source = nodes.find((node) => node.id === connect.source)?.data;
      const sourceType = (() => {
        if (source?.flowType === FlowNodeTypeEnum.classifyQuestion) {
          return ModuleIOValueTypeEnum.string;
        }
        if (source?.flowType === FlowNodeTypeEnum.pluginInput) {
          return source?.inputs.find((input) => input.key === connect.sourceHandle)?.valueType;
        }
        return source?.outputs.find((output) => output.key === connect.sourceHandle)?.valueType;
      })();

      const targetType = nodes
        .find((node) => node.id === connect.target)
        ?.data?.inputs.find((input) => input.key === connect.targetHandle)?.valueType;

      if (!sourceType || !targetType) {
        return toast({
          status: 'warning',
          title: t('app.Connection is invalid')
        });
      }
      if (
        sourceType !== ModuleIOValueTypeEnum.any &&
        targetType !== ModuleIOValueTypeEnum.any &&
        sourceType !== targetType
      ) {
        return toast({
          status: 'warning',
          title: t('app.Connection type is different')
        });
      }

      setEdges((state) =>
        addEdge(
          {
            ...connect,
            type: EDGE_TYPE,
            data: {
              onDelete: onDelConnect
            }
          },
          state
        )
      );
    },
    [nodes, onDelConnect, setEdges, t, toast]
  );

  const onDelNode = useCallback(
    (nodeId: string) => {
      setNodes((state) => state.filter((item) => item.id !== nodeId));
      setEdges((state) => state.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    },
    [setEdges, setNodes]
  );

  /* change */
  const onChangeNode = useCallback(
    ({ moduleId, type, key, value, index }: FlowNodeChangeProps) => {
      setNodes((nodes) =>
        nodes.map((node) => {
          if (node.id !== moduleId) return node;

          const updateObj: Record<string, any> = {};

          if (type === 'attr') {
            if (key) {
              updateObj[key] = value;
            }
          } else if (type === 'updateInput') {
            updateObj.inputs = node.data.inputs.map((item) => (item.key === key ? value : item));
          } else if (type === 'replaceInput') {
            onDelEdge({ moduleId, targetHandle: key });
            const oldInputIndex = node.data.inputs.findIndex((item) => item.key === key);
            updateObj.inputs = node.data.inputs.filter((item) => item.key !== key);
            setTimeout(() => {
              onChangeNode({
                moduleId,
                type: 'addInput',
                index: oldInputIndex,
                value
              });
            });
          } else if (type === 'addInput') {
            const input = node.data.inputs.find((input) => input.key === value.key);
            if (input) {
              toast({
                status: 'warning',
                title: 'key 重复'
              });
              updateObj.inputs = node.data.inputs;
            } else {
              if (index !== undefined) {
                const inputs = [...node.data.inputs];
                inputs.splice(index, 0, value);
                updateObj.inputs = inputs;
              } else {
                updateObj.inputs = node.data.inputs.concat(value);
              }
            }
          } else if (type === 'delInput') {
            onDelEdge({ moduleId, targetHandle: key });
            updateObj.inputs = node.data.inputs.filter((item) => item.key !== key);
          } else if (type === 'updateOutput') {
            updateObj.outputs = node.data.outputs.map((item) => (item.key === key ? value : item));
          } else if (type === 'replaceOutput') {
            onDelEdge({ moduleId, sourceHandle: key });
            const oldOutputIndex = node.data.outputs.findIndex((item) => item.key === key);
            updateObj.outputs = node.data.outputs.filter((item) => item.key !== key);
            setTimeout(() => {
              onChangeNode({
                moduleId,
                type: 'addOutput',
                index: oldOutputIndex,
                value
              });
            });
          } else if (type === 'addOutput') {
            const output = node.data.outputs.find((output) => output.key === value.key);
            if (output) {
              toast({
                status: 'warning',
                title: 'key 重复'
              });
              updateObj.outputs = node.data.outputs;
            } else {
              if (index !== undefined) {
                const outputs = [...node.data.outputs];
                outputs.splice(index, 0, value);
                updateObj.outputs = outputs;
              } else {
                updateObj.outputs = node.data.outputs.concat(value);
              }
            }
          } else if (type === 'delOutput') {
            onDelEdge({ moduleId, sourceHandle: key });
            updateObj.outputs = node.data.outputs.filter((item) => item.key !== key);
          }

          return {
            ...node,
            data: {
              ...node.data,
              ...updateObj
            }
          };
        })
      );
    },
    [onDelEdge, setNodes, toast]
  );

  const onCopyNode = useCallback(
    (nodeId: string) => {
      setNodes((nodes) => {
        const node = nodes.find((node) => node.id === nodeId);
        if (!node) return nodes;
        const template = {
          avatar: node.data.avatar,
          name: node.data.name,
          intro: node.data.intro,
          flowType: node.data.flowType,
          inputs: node.data.inputs,
          outputs: node.data.outputs,
          showStatus: node.data.showStatus
        };
        return nodes.concat(
          appModule2FlowNode({
            item: {
              ...template,
              moduleId: nanoid(),
              position: { x: node.position.x + 200, y: node.position.y + 50 }
            }
          })
        );
      });
    },
    [setNodes]
  );

  // reset a node data. delete edge and replace it
  const onResetNode = useCallback(
    ({ id, module }: { id: string; module: FlowModuleTemplateType }) => {
      setNodes((state) =>
        state.map((node) => {
          if (node.id === id) {
            // delete edge
            node.data.inputs.forEach((item) => {
              onDelEdge({ moduleId: id, targetHandle: item.key });
            });
            node.data.outputs.forEach((item) => {
              onDelEdge({ moduleId: id, sourceHandle: item.key });
            });
            return {
              ...node,
              data: {
                ...node.data,
                ...module
              }
            };
          }
          return node;
        })
      );
    },
    [onDelEdge, setNodes]
  );

  const initData = useCallback(
    (modules: ModuleItemType[]) => {
      const edges = appModule2FlowEdge({
        modules
      });
      setEdges(edges);

      setNodes(modules.map((item) => appModule2FlowNode({ item })));

      onFixView();
    },
    [setEdges, setNodes, onFixView]
  );

  // use eventbus to avoid refresh ReactComponents
  useEffect(() => {
    eventBus.on(
      EventNameEnum.requestFlowEvent,
      ({ type, data }: { type: requestEventType; data: any }) => {
        switch (type) {
          case 'onChangeNode':
            onChangeNode(data);
            return;
          case 'onCopyNode':
            onCopyNode(data);
            return;
          case 'onResetNode':
            onResetNode(data);
            return;
          case 'onDelNode':
            onDelNode(data);
            return;
          case 'onDelConnect':
            onDelConnect(data);
            return;
          case 'setNodes':
            setNodes(data);
            return;
        }
      }
    );
    return () => {
      eventBus.off(EventNameEnum.requestFlowEvent);
    };
  }, []);
  useEffect(() => {
    eventBus.on(EventNameEnum.requestFlowStore, () => {
      eventBus.emit('receiveFlowStore', {
        nodes,
        edges,
        mode,
        filterAppIds,
        reactFlowWrapper
      });
    });
    return () => {
      eventBus.off(EventNameEnum.requestFlowStore);
    };
  }, [edges, filterAppIds, mode, nodes]);

  const value = {
    reactFlowWrapper,
    mode,
    filterAppIds,
    nodes,
    setNodes,
    onNodesChange,
    edges,
    setEdges,
    onEdgesChange,
    onFixView,
    onDelNode,
    onChangeNode,
    onResetNode,
    onCopyNode,
    onDelEdge,
    onDelConnect,
    onConnect,
    initData
  };

  return <StateContext.Provider value={value}>{children}</StateContext.Provider>;
};

export default React.memo(FlowProvider);

export const onChangeNode = (e: FlowNodeChangeProps) => {
  eventBus.emit(EventNameEnum.requestFlowEvent, {
    type: 'onChangeNode',
    data: e
  });
};
export const onCopyNode = (nodeId: string) => {
  eventBus.emit(EventNameEnum.requestFlowEvent, {
    type: 'onCopyNode',
    data: nodeId
  });
};
export const onResetNode = (e: Parameters<useFlowProviderStoreType['onResetNode']>[0]) => {
  eventBus.emit(EventNameEnum.requestFlowEvent, {
    type: 'onResetNode',
    data: e
  });
};
export const onDelNode = (nodeId: string) => {
  eventBus.emit(EventNameEnum.requestFlowEvent, {
    type: 'onDelNode',
    data: nodeId
  });
};
export const onDelConnect = (e: Parameters<useFlowProviderStoreType['onDelConnect']>[0]) => {
  eventBus.emit(EventNameEnum.requestFlowEvent, {
    type: 'onDelConnect',
    data: e
  });
};
export const onSetNodes = (e: useFlowProviderStoreType['nodes']) => {
  eventBus.emit(EventNameEnum.requestFlowEvent, {
    type: 'setNodes',
    data: e
  });
};

export const getFlowStore = () =>
  new Promise<{
    nodes: useFlowProviderStoreType['nodes'];
    edges: useFlowProviderStoreType['edges'];
    mode: useFlowProviderStoreType['mode'];
    filterAppIds: useFlowProviderStoreType['filterAppIds'];
    reactFlowWrapper: useFlowProviderStoreType['reactFlowWrapper'];
  }>((resolve) => {
    eventBus.on('receiveFlowStore', (data: any) => {
      resolve(data);
      eventBus.off('receiveFlowStore');
    });
    eventBus.emit(EventNameEnum.requestFlowStore);
  });
