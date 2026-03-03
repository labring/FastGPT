// 工作流 Node/Edge 操作层
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { createContext, useContextSelector } from 'use-context-selector';
import { useTranslation } from 'next-i18next';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';
import type { OnConnectStartParams } from 'reactflow';
import { WorkflowBufferDataContext } from './workflowInitContext';
import type {
  FlowNodeInputItemType,
  FlowNodeOutputItemType
} from '@fastgpt/global/core/workflow/type/io';
import type { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node';

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

// 创建 Context
type WorkflowActionsContextValue = {
  /** 更新节点错误状态 */
  onUpdateNodeError: (nodeId: string, isError: boolean) => void;

  /** 移除所有错误状态 */
  onRemoveError: () => void;

  /** 重置节点到模板状态 */
  onResetNode: (e: { id: string; node: FlowNodeTemplateType }) => void;

  /** 修改节点 */
  onChangeNode: (props: FlowNodeChangeProps | FlowNodeChangeProps[]) => void;

  /** 删除边 */
  onDelEdge: (e: { nodeId: string; sourceHandle?: string; targetHandle?: string }) => void;

  /** 连接中的边 */
  connectingEdge?: OnConnectStartParams;

  /** 设置连接中的边 */
  setConnectingEdge: React.Dispatch<React.SetStateAction<OnConnectStartParams | undefined>>;
};
export const WorkflowActionsContext = createContext<WorkflowActionsContextValue>({
  onUpdateNodeError: function (nodeId: string, isError: boolean): void {
    throw new Error('Function not implemented.');
  },
  onRemoveError: function (): void {
    throw new Error('Function not implemented.');
  },
  onResetNode: function (e: { id: string; node: FlowNodeTemplateType }): void {
    throw new Error('Function not implemented.');
  },
  onChangeNode: function (props: FlowNodeChangeProps | FlowNodeChangeProps[]): void {
    throw new Error('Function not implemented.');
  },
  onDelEdge: function (e: { nodeId: string; sourceHandle?: string; targetHandle?: string }): void {
    throw new Error('Function not implemented.');
  },
  setConnectingEdge: function (
    value: React.SetStateAction<OnConnectStartParams | undefined>
  ): void {
    throw new Error('Function not implemented.');
  }
});

/**
 * WorkflowActionsProvider - 操作提供者
 */
export const WorkflowActionsProvider = ({ children }: { children: React.ReactNode }) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  // 获取 WorkflowBufferDataContext 的数据
  const { forbiddenSaveSnapshot, setEdges, setNodes } = useContextSelector(
    WorkflowBufferDataContext,
    (v) => v
  );

  // 连接状态
  const [connectingEdge, setConnectingEdge] = useState<OnConnectStartParams>();

  // 删除边
  const onDelEdge = useCallback(
    ({
      nodeId,
      sourceHandle,
      targetHandle
    }: Parameters<WorkflowActionsContextValue['onDelEdge']>[0]) => {
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

  // 更新节点错误状态
  const onUpdateNodeError = useCallback(
    (nodeId: string, isError: boolean) => {
      setNodes((state) =>
        state.map((item) => {
          if (item.data?.nodeId === nodeId) {
            return {
              ...item,
              selected: true,
              data: {
                ...item.data,
                isError
              }
            };
          }
          return item;
        })
      );
    },
    [setNodes]
  );
  // 移除所有节点的错误状态
  const onRemoveError = useCallback(() => {
    setNodes((state) =>
      state.map((item) => {
        if (item.data.isError) {
          return {
            ...item,
            selected: false,
            data: {
              ...item.data,
              isError: false
            }
          };
        }
        return item;
      })
    );
  }, [setNodes]);

  // Reset a node data. delete edge and replace it
  const onResetNode = useCallback(
    ({ id, node }: Parameters<WorkflowActionsContextValue['onResetNode']>[0]) => {
      // 确保重置时不阻塞快照保存
      forbiddenSaveSnapshot.current = false;

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
    },
    [forbiddenSaveSnapshot, setNodes]
  );

  // 使用结构共享优化的节点更改
  const onChangeNode = useCallback(
    (props: FlowNodeChangeProps | FlowNodeChangeProps[]) => {
      const updateData = Array.isArray(props) ? props : [props];

      setNodes((nodes) => {
        return nodes.map((node) => {
          const updateItem = updateData.find((item) => item.nodeId === node.data.nodeId);
          if (!updateItem) return node;
          const { nodeId, type } = updateItem;

          // ✅ 使用结构共享，只拷贝变化的部分
          let updateObj = node.data;

          if (type === 'attr') {
            // 浅拷贝 + 更新单个属性
            updateObj = {
              ...node.data,
              [updateItem.key]: updateItem.value
            };
          } else if (type === 'updateInput') {
            // 只拷贝inputs数组
            updateObj = {
              ...node.data,
              inputs: node.data.inputs.map((item) =>
                item.key === updateItem.key ? updateItem.value : item
              )
            };
          } else if (type === 'replaceInput') {
            const existingIndex = node.data.inputs.findIndex((item) => item.key === updateItem.key);

            updateObj = {
              ...node.data,
              inputs:
                existingIndex === -1
                  ? [...node.data.inputs, updateItem.value]
                  : node.data.inputs.map((item) =>
                      item.key === updateItem.key ? updateItem.value : item
                    )
            };
          } else if (type === 'addInput') {
            const hasInput = node.data.inputs.some((input) => input.key === updateItem.value.key);
            if (hasInput) {
              toast({
                status: 'warning',
                title: t('common:key_repetition')
              });
              updateObj = node.data; // 不修改
            } else {
              updateObj = {
                ...node.data,
                inputs: [...node.data.inputs, updateItem.value]
              };
            }
          } else if (type === 'delInput') {
            updateObj = {
              ...node.data,
              inputs: node.data.inputs.filter((item) => item.key !== updateItem.key)
            };
          } else if (type === 'updateOutput') {
            updateObj = {
              ...node.data,
              outputs: node.data.outputs.map((item) =>
                item.key === updateItem.key ? updateItem.value : item
              )
            };
          } else if (type === 'replaceOutput') {
            onDelEdge({ nodeId, sourceHandle: getHandleId(nodeId, 'source', updateItem.key) });
            updateObj = {
              ...node.data,
              outputs: node.data.outputs.map((item) =>
                item.key === updateItem.key ? updateItem.value : item
              )
            };
          } else if (type === 'addOutput') {
            const hasOutput = node.data.outputs.some(
              (output) => output.key === updateItem.value.key
            );
            if (hasOutput) {
              toast({
                status: 'warning',
                title: t('common:key_repetition')
              });
              updateObj = node.data; // 不修改
            } else {
              if (updateItem.index !== undefined) {
                const outputs = [...node.data.outputs];
                outputs.splice(updateItem.index, 0, updateItem.value);
                updateObj = {
                  ...node.data,
                  outputs
                };
              } else {
                updateObj = {
                  ...node.data,
                  outputs: [...node.data.outputs, updateItem.value]
                };
              }
            }
          } else if (type === 'delOutput') {
            onDelEdge({ nodeId, sourceHandle: getHandleId(nodeId, 'source', updateItem.key) });
            updateObj = {
              ...node.data,
              outputs: node.data.outputs.filter((item) => item.key !== updateItem.key)
            };
          }

          return {
            ...node,
            data: updateObj
          };
        });
      });
    },
    [setNodes, toast, t, onDelEdge]
  );

  const contextValue = useMemo(() => {
    console.log('WorkflowActionsContextValue 更新了');
    return {
      onUpdateNodeError,
      onRemoveError,
      onResetNode,
      onChangeNode,
      onDelEdge,
      connectingEdge,
      setConnectingEdge
    };
  }, [onUpdateNodeError, onRemoveError, onResetNode, onChangeNode, onDelEdge, connectingEdge]);

  return (
    <WorkflowActionsContext.Provider value={contextValue}>
      {children}
    </WorkflowActionsContext.Provider>
  );
};
