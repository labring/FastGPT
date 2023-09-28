import {
  type Node,
  type NodeChange,
  type Edge,
  type EdgeChange,
  useNodesState,
  useEdgesState,
  XYPosition,
  useViewport,
  Connection,
  addEdge
} from 'reactflow';
import type {
  FlowModuleItemType,
  FlowModuleTemplateType,
  FlowOutputTargetItemType,
  FlowModuleItemChangeProps
} from '@/types/core/app/flow';
import React, {
  type SetStateAction,
  type Dispatch,
  useContext,
  useCallback,
  createContext,
  useRef
} from 'react';
import { customAlphabet } from 'nanoid';
import { appModule2FlowEdge, appModule2FlowNode } from '@/utils/adapt';
import { useToast } from '@/hooks/useToast';
import { FlowModuleTypeEnum, FlowValueTypeEnum } from '@/constants/flow';
import { useTranslation } from 'next-i18next';
import { AppModuleItemType } from '@/types/app';

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 6);

type OnChange<ChangesType> = (changes: ChangesType[]) => void;
export type useFlowStoreType = {
  reactFlowWrapper: null | React.RefObject<HTMLDivElement>;
  nodes: Node<FlowModuleItemType, string | undefined>[];
  setNodes: Dispatch<SetStateAction<Node<FlowModuleItemType, string | undefined>[]>>;
  onNodesChange: OnChange<NodeChange>;
  edges: Edge<any>[];
  setEdges: Dispatch<SetStateAction<Edge<any>[]>>;
  onEdgesChange: OnChange<EdgeChange>;
  onFixView: () => void;
  onAddNode: (e: { template: FlowModuleTemplateType; position: XYPosition }) => void;
  onDelNode: (nodeId: string) => void;
  onChangeNode: (e: FlowModuleItemChangeProps) => void;
  onCopyNode: (nodeId: string) => void;
  onDelEdge: (e: {
    moduleId: string;
    sourceHandle?: string | undefined;
    targetHandle?: string | undefined;
  }) => void;
  onDelConnect: (id: string) => void;
  onConnect: ({ connect }: { connect: Connection }) => any;
  initData: (modules: AppModuleItemType[]) => void;
};

const StateContext = createContext<useFlowStoreType>({
  reactFlowWrapper: null,
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
  onAddNode: function (e: { template: FlowModuleTemplateType; position: XYPosition }): void {
    return;
  },
  onDelNode: function (nodeId: string): void {
    return;
  },
  onChangeNode: function (e: FlowModuleItemChangeProps): void {
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
  initData: function (modules: AppModuleItemType[]): void {
    throw new Error('Function not implemented.');
  }
});
export const useFlowStore = () => useContext(StateContext);

export const FlowProvider = ({ children }: { children: React.ReactNode }) => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();
  const { toast } = useToast();
  const [nodes = [], setNodes, onNodesChange] = useNodesState<FlowModuleItemType>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const { x, y, zoom } = useViewport();

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
        if (source?.flowType === FlowModuleTypeEnum.classifyQuestion) {
          return FlowValueTypeEnum.boolean;
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
        sourceType !== FlowValueTypeEnum.any &&
        targetType !== FlowValueTypeEnum.any &&
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
            type: 'buttonedge',
            animated: true,
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

  const onAddNode = useCallback(
    ({ template, position }: { template: FlowModuleTemplateType; position: XYPosition }) => {
      if (!reactFlowWrapper.current) return;
      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const mouseX = (position.x - reactFlowBounds.left - x) / zoom - 100;
      const mouseY = (position.y - reactFlowBounds.top - y) / zoom;
      console.log(template);
      setNodes((state) =>
        state.concat(
          appModule2FlowNode({
            item: {
              ...template,
              moduleId: nanoid(),
              position: { x: mouseX, y: mouseY }
            }
          })
        )
      );
    },
    [setNodes, x, y, zoom]
  );

  const onDelNode = useCallback(
    (nodeId: string) => {
      setNodes((state) => state.filter((item) => item.id !== nodeId));
      setEdges((state) => state.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    },
    [setEdges, setNodes]
  );

  const onChangeNode = useCallback(
    ({ moduleId, key, type = 'inputs', value }: FlowModuleItemChangeProps) => {
      setNodes((nodes) =>
        nodes.map((node) => {
          if (node.id !== moduleId) return node;

          const updateObj: Record<string, any> = {};

          if (type === 'inputs') {
            updateObj.inputs = node.data.inputs.map((item) => (item.key === key ? value : item));
          } else if (type === 'addInput') {
            const input = node.data.inputs.find((input) => input.key === value.key);
            if (input) {
              toast({
                status: 'warning',
                title: 'key 重复'
              });
              updateObj.inputs = node.data.inputs;
            } else {
              updateObj.inputs = node.data.inputs.concat(value);
            }
          } else if (type === 'delInput') {
            onDelEdge({ moduleId, targetHandle: key });
            updateObj.inputs = node.data.inputs.filter((item) => item.key !== key);
          } else if (type === 'attr') {
            updateObj[key] = value;
          } else if (type === 'outputs') {
            // del output connect
            const delOutputs = node.data.outputs.filter(
              (item) => !value.find((output: FlowOutputTargetItemType) => output.key === item.key)
            );
            delOutputs.forEach((output) => {
              onDelEdge({ moduleId, sourceHandle: output.key });
            });
            updateObj.outputs = value;
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
          logo: node.data.logo,
          name: node.data.name,
          intro: node.data.intro,
          description: node.data.description,
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

  const initData = useCallback(
    (modules: AppModuleItemType[]) => {
      const edges = appModule2FlowEdge({
        modules,
        onDelete: onDelConnect
      });
      setEdges(edges);

      setNodes(modules.map((item) => appModule2FlowNode({ item })));

      onFixView();
    },
    [onDelConnect, setEdges, setNodes, onFixView]
  );

  const value = {
    reactFlowWrapper,
    nodes,
    setNodes,
    onNodesChange,
    edges,
    setEdges,
    onEdgesChange,
    onFixView,
    onAddNode,
    onDelNode,
    onChangeNode,
    onCopyNode,
    onDelEdge,
    onDelConnect,
    onConnect,
    initData
  };

  return <StateContext.Provider value={value}>{children}</StateContext.Provider>;
};

export default React.memo(FlowProvider);
