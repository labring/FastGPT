// 工作流 Node/Edge 操作层
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import type {
  FlowNodeTemplateType,
  WorkflowCheckNodeIssueMap
} from '@fastgpt/global/core/workflow/type/node';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import {
  checkWorkflowNodeIssues,
  collectWorkflowStartAutoFillRevertPatches
} from '@/web/core/workflow/utils';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.schema';

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

  /** 批量同步节点校验问题详情；不改动 isError */
  onSyncWorkflowCheckIssues: (nodeIssueMap: WorkflowCheckNodeIssueMap) => void;

  /** 单节点刷新校验问题详情，用于节点配置编辑后的局部复查 */
  onRefreshSingleNodeWorkflowCheckIssues: (nodeId: string) => void;

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
  onUpdateNodeError: (...args: Parameters<WorkflowActionsContextValue['onUpdateNodeError']>) => {
    void args;
    throw new Error('Function not implemented.');
  },
  onSyncWorkflowCheckIssues: (
    ...args: Parameters<WorkflowActionsContextValue['onSyncWorkflowCheckIssues']>
  ) => {
    void args;
    throw new Error('Function not implemented.');
  },
  onRefreshSingleNodeWorkflowCheckIssues: (nodeId: string) => {
    void nodeId;
    throw new Error('Function not implemented.');
  },
  onRemoveError: () => {
    throw new Error('Function not implemented.');
  },
  onResetNode: (...args: Parameters<WorkflowActionsContextValue['onResetNode']>) => {
    void args;
    throw new Error('Function not implemented.');
  },
  onChangeNode: (...args: Parameters<WorkflowActionsContextValue['onChangeNode']>) => {
    void args;
    throw new Error('Function not implemented.');
  },
  onDelEdge: (...args: Parameters<WorkflowActionsContextValue['onDelEdge']>) => {
    void args;
    throw new Error('Function not implemented.');
  },
  setConnectingEdge: (...args: Parameters<WorkflowActionsContextValue['setConnectingEdge']>) => {
    void args;
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
  const {
    forbiddenSaveSnapshot: forbiddenSaveSnapshotRef,
    setEdges,
    setNodes,
    edges,
    getNodes
  } = useContextSelector(WorkflowBufferDataContext, (v) => v);

  const singleNodeCheckTimerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const edgeCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstEdgesEffectRef = useRef(true);
  const prevEdgesRef = useRef(edges);

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

  // 更新节点错误状态；标红时仅保留一个节点的 isError，避免多个节点同时进入选中错误态。
  const onUpdateNodeError = useCallback(
    (nodeId: string, isError: boolean) => {
      setNodes((state) =>
        state.map((item) => {
          if (item.data?.nodeId === nodeId) {
            return {
              ...item,
              selected: isError ? true : item.selected,
              data: {
                ...item.data,
                isError
              }
            };
          }

          if (isError && item.data.isError) {
            return {
              ...item,
              data: {
                ...item.data,
                isError: false
              }
            };
          }

          return item;
        })
      );
    },
    [setNodes]
  );

  /** 同步节点下方问题文案；不改动 isError，标红仅由 onUpdateNodeError 控制。 */
  const onSyncWorkflowCheckIssues = useCallback(
    (nodeIssueMap: WorkflowCheckNodeIssueMap) => {
      setNodes((state) =>
        state.map((item) => {
          const nodeId = item.data.nodeId;
          const issues = nodeIssueMap[nodeId];
          const nextIssues = issues?.length ? issues : undefined;

          if (JSON.stringify(item.data.workflowCheckIssues) === JSON.stringify(nextIssues)) {
            return item;
          }

          return {
            ...item,
            data: {
              ...item.data,
              workflowCheckIssues: nextIssues
            }
          };
        })
      );
    },
    [setNodes]
  );

  /** 单节点配置变更后防抖重校验，仅同步问题文案，不自动标红。 */
  const onRefreshSingleNodeWorkflowCheckIssues = useCallback(
    (nodeId: string) => {
      const nodes = getNodes();
      const issueMap = checkWorkflowNodeIssues({ nodes, edges, nodeId, t });

      setNodes((state) =>
        state.map((item) => {
          if (item.data.nodeId !== nodeId) return item;

          const issues = issueMap[nodeId];
          const nextIssues = issues?.length ? issues : undefined;

          if (JSON.stringify(item.data.workflowCheckIssues) === JSON.stringify(nextIssues)) {
            return item;
          }

          return {
            ...item,
            data: {
              ...item.data,
              workflowCheckIssues: nextIssues
            }
          };
        })
      );
    },
    [edges, getNodes, setNodes, t]
  );

  /** 节点配置变更后防抖触发单节点重新校验，避免每次输入都同步扫描。 */
  const scheduleSingleNodeWorkflowCheck = useCallback(
    (nodeId: string) => {
      const existingTimer = singleNodeCheckTimerRef.current.get(nodeId);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      singleNodeCheckTimerRef.current.set(
        nodeId,
        setTimeout(() => {
          singleNodeCheckTimerRef.current.delete(nodeId);
          onRefreshSingleNodeWorkflowCheckIssues(nodeId);
        }, 400)
      );
    },
    [onRefreshSingleNodeWorkflowCheckIssues]
  );

  /** 连线变更后防抖全量扫描，及时更新 no_upstream 等依赖连线的错误态。 */
  const scheduleWorkflowCheckOnEdgeChange = useCallback(() => {
    if (edgeCheckTimerRef.current) {
      clearTimeout(edgeCheckTimerRef.current);
    }

    edgeCheckTimerRef.current = setTimeout(() => {
      edgeCheckTimerRef.current = null;
      const nodes = getNodes();
      if (nodes.length === 0) return;

      const issueMap = checkWorkflowNodeIssues({ nodes, edges, t });
      onSyncWorkflowCheckIssues(issueMap);
    }, 400);
  }, [edges, getNodes, onSyncWorkflowCheckIssues, t]);

  useEffect(() => {
    if (isFirstEdgesEffectRef.current) {
      isFirstEdgesEffectRef.current = false;
      prevEdgesRef.current = edges;
      return;
    }

    const prevEdges = prevEdgesRef.current;
    const removedEdges = prevEdges.filter(
      (prevEdge) => !edges.some((edge) => edge.id === prevEdge.id)
    );
    prevEdgesRef.current = edges;

    if (removedEdges.length > 0) {
      const getNodeDataById = (nodeId: string) =>
        getNodes().find((node) => node.data.nodeId === nodeId)?.data;

      const patches = collectWorkflowStartAutoFillRevertPatches({
        removedEdges,
        remainingEdges: edges,
        getNodeById: getNodeDataById
      });

      if (patches.length > 0) {
        setNodes((nodes) =>
          nodes.map((node) => {
            const nodePatches = patches.filter((patch) => patch.nodeId === node.data.nodeId);
            if (nodePatches.length === 0) return node;

            return {
              ...node,
              data: {
                ...node.data,
                inputs: node.data.inputs.map((input) => {
                  const patch = nodePatches.find((item) => item.key === input.key);
                  return patch ? patch.value : input;
                })
              }
            };
          })
        );
      }
    }

    scheduleWorkflowCheckOnEdgeChange();
  }, [edges, scheduleWorkflowCheckOnEdgeChange, getNodes, setNodes]);

  useEffect(() => {
    const timers = singleNodeCheckTimerRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
      if (edgeCheckTimerRef.current) {
        clearTimeout(edgeCheckTimerRef.current);
      }
    };
  }, []);

  // 移除所有节点的错误状态
  const onRemoveError = useCallback(() => {
    setNodes((state) =>
      state.map((item) => {
        if (!item.data.isError && !item.data.workflowCheckIssues?.length) {
          return item;
        }
        return {
          ...item,
          selected: false,
          data: {
            ...item.data,
            isError: false,
            workflowCheckIssues: undefined
          }
        };
      })
    );
  }, [setNodes]);

  // Reset a node data. delete edge and replace it
  const onResetNode = useCallback(
    ({ id, node }: Parameters<WorkflowActionsContextValue['onResetNode']>[0]) => {
      // 确保重置时不阻塞快照保存
      forbiddenSaveSnapshotRef.current = false;

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
    [forbiddenSaveSnapshotRef, setNodes]
  );

  // 使用结构共享优化的节点更改
  const { llmModelList } = useSystemStore();
  const llmModelMap = useMemo(() => {
    return llmModelList.reduce(
      (acc, model) => {
        acc[model.model] = model;
        return acc;
      },
      {} as Record<string, LLMModelItemType>
    );
  }, [llmModelList]);
  const onChangeNode = useCallback(
    (props: FlowNodeChangeProps | FlowNodeChangeProps[]) => {
      const updateData = Array.isArray(props) ? props : [props];
      const nodeIdsToRecheck = new Set(updateData.map((item) => item.nodeId));
      const updatesByNodeId = updateData.reduce((map, item) => {
        map.set(item.nodeId, [...(map.get(item.nodeId) ?? []), item]);
        return map;
      }, new Map<string, FlowNodeChangeProps[]>());

      setNodes((nodes) => {
        return nodes.map((node) => {
          const updateItems = updatesByNodeId.get(node.data.nodeId);
          if (!updateItems?.length) return node;

          // ✅ 使用结构共享，只拷贝变化的部分
          let updateObj = node.data;

          updateItems.forEach((updateItem) => {
            const { nodeId, type } = updateItem;

            if (type === 'attr') {
              // 浅拷贝 + 更新单个属性
              updateObj = {
                ...updateObj,
                [updateItem.key]: updateItem.value
              };
            } else if (type === 'updateInput') {
              // 批量自动填充会同时更新同一节点的多个 input，需基于上一次变更继续叠加。
              updateObj = {
                ...updateObj,
                inputs: updateObj.inputs.map((item) =>
                  item.key === updateItem.key ? updateItem.value : item
                )
              };
            } else if (type === 'replaceInput') {
              const existingIndex = updateObj.inputs.findIndex(
                (item) => item.key === updateItem.key
              );

              updateObj = {
                ...updateObj,
                inputs:
                  existingIndex === -1
                    ? [...updateObj.inputs, updateItem.value]
                    : updateObj.inputs.map((item) =>
                        item.key === updateItem.key ? updateItem.value : item
                      )
              };
            } else if (type === 'addInput') {
              const hasInput = updateObj.inputs.some((input) => input.key === updateItem.value.key);
              if (hasInput) {
                toast({
                  status: 'warning',
                  title: t('common:key_repetition')
                });
              } else {
                updateObj = {
                  ...updateObj,
                  inputs: [...updateObj.inputs, updateItem.value]
                };
              }
            } else if (type === 'delInput') {
              updateObj = {
                ...updateObj,
                inputs: updateObj.inputs.filter((item) => item.key !== updateItem.key)
              };
            } else if (type === 'updateOutput') {
              updateObj = {
                ...updateObj,
                outputs: updateObj.outputs.map((item) =>
                  item.key === updateItem.key ? updateItem.value : item
                )
              };
            } else if (type === 'replaceOutput') {
              onDelEdge({ nodeId, sourceHandle: getHandleId(nodeId, 'source', updateItem.key) });
              updateObj = {
                ...updateObj,
                outputs: updateObj.outputs.map((item) =>
                  item.key === updateItem.key ? updateItem.value : item
                )
              };
            } else if (type === 'addOutput') {
              const hasOutput = updateObj.outputs.some(
                (output) => output.key === updateItem.value.key
              );
              if (hasOutput) {
                toast({
                  status: 'warning',
                  title: t('common:key_repetition')
                });
              } else {
                if (updateItem.index !== undefined) {
                  const outputs = [...updateObj.outputs];
                  outputs.splice(updateItem.index, 0, updateItem.value);
                  updateObj = {
                    ...updateObj,
                    outputs
                  };
                } else {
                  updateObj = {
                    ...updateObj,
                    outputs: [...updateObj.outputs, updateItem.value]
                  };
                }
              }
            } else if (type === 'delOutput') {
              onDelEdge({ nodeId, sourceHandle: getHandleId(nodeId, 'source', updateItem.key) });
              updateObj = {
                ...updateObj,
                outputs: updateObj.outputs.filter((item) => item.key !== updateItem.key)
              };
            }
          });

          updateObj.outputs = updateObj.outputs.map((output) => {
            return {
              ...output,
              invalid: output.invalidCondition
                ? output.invalidCondition({ inputs: updateObj.inputs, llmModelMap })
                : undefined
            };
          });

          return {
            ...node,
            data: updateObj
          };
        });
      });

      nodeIdsToRecheck.forEach((nodeId) => scheduleSingleNodeWorkflowCheck(nodeId));
    },
    [setNodes, toast, t, onDelEdge, llmModelMap, scheduleSingleNodeWorkflowCheck]
  );

  const contextValue = useMemo(() => {
    console.log('WorkflowActionsContextValue 更新了');
    return {
      onUpdateNodeError,
      onSyncWorkflowCheckIssues,
      onRefreshSingleNodeWorkflowCheckIssues,
      onRemoveError,
      onResetNode,
      onChangeNode,
      onDelEdge,
      connectingEdge,
      setConnectingEdge
    };
  }, [
    onUpdateNodeError,
    onSyncWorkflowCheckIssues,
    onRefreshSingleNodeWorkflowCheckIssues,
    onRemoveError,
    onResetNode,
    onChangeNode,
    onDelEdge,
    connectingEdge
  ]);

  return (
    <WorkflowActionsContext.Provider value={contextValue}>
      {children}
    </WorkflowActionsContext.Provider>
  );
};
