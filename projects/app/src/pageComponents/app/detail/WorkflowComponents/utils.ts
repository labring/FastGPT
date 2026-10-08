import { getGlobalVariableNode } from '@/web/core/workflow/adapt';
import { workflowSystemVariables } from '@/web/core/app/utils';
import type { AppChatConfigType } from '@fastgpt/global/core/app/type';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  VARIABLE_NODE_ID
} from '@fastgpt/global/core/workflow/constants';
import type { DeepReadonly } from '@fastgpt/global/core/workflow/editor/types';
import {
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type {
  FlowNodeInputItemType,
  FlowNodeOutputItemType
} from '@fastgpt/global/core/workflow/type/io';
import { type TFunction } from 'i18next';

type EditorVariableNode = {
  nodeId: string;
  name: string;
  avatar?: string;
  catchError?: boolean;
  inputs: readonly DeepReadonly<Pick<FlowNodeInputItemType, 'key' | 'label' | 'canEdit'>>[];
  outputs: readonly DeepReadonly<
    Pick<FlowNodeOutputItemType, 'id' | 'label' | 'type' | 'invalid'>
  >[];
};

export const filterExportModules = (modules: StoreNodeItemType[]) => {
  modules.forEach((module) => {
    // dataset - remove select dataset value
    if (module.flowNodeType === FlowNodeTypeEnum.datasetSearchNode) {
      module.inputs.forEach((item) => {
        if (item.key === NodeInputKeyEnum.datasetSelectList) {
          item.value = [];
        }
      });
    }
  });

  return JSON.stringify(modules, null, 2);
};

export const getEditorVariables = ({
  nodeId,
  getNodeById,
  chatConfig,
  t,
  getSourceNodeIds
}: {
  nodeId: string;
  getNodeById: (nodeId: string | null | undefined) => EditorVariableNode | undefined;
  chatConfig: DeepReadonly<AppChatConfigType>;
  t: TFunction;
  /** Runtime 唯一来源查询；UI 只负责把来源节点映射成变量展示项。 */
  getSourceNodeIds: (nodeId: string) => readonly string[];
}) => {
  const currentNode = getNodeById(nodeId);
  if (!currentNode) return [];

  const nodeVariables = currentNode.inputs
    .filter((input) => input.canEdit)
    .map((item) => ({
      key: item.key,
      label: item.label ?? item.key,
      parent: {
        id: currentNode.nodeId,
        label: currentNode.name,
        avatar: currentNode.avatar
      }
    }));

  const sourceNodes = [
    ...getSourceNodeIds(nodeId)
      .map((sourceNodeId) => getNodeById(sourceNodeId))
      .filter((sourceNode): sourceNode is EditorVariableNode => !!sourceNode),
    getGlobalVariableNode({
      chatConfig: chatConfig as AppChatConfigType,
      t
    })
  ];

  const sourceNodeVariables = !sourceNodes
    ? []
    : sourceNodes
        .map((node) => {
          return node.outputs
            .filter((output) => {
              if (output.type === FlowNodeOutputTypeEnum.error) {
                return node.catchError === true;
              }
              return (
                !!output.label &&
                output.invalid !== true &&
                output.id !== NodeOutputKeyEnum.addOutputParam
              );
            })
            .map((output) => {
              return {
                label:
                  node.nodeId === VARIABLE_NODE_ID &&
                  !workflowSystemVariables.some((item) => item.key === output.id)
                    ? (output.label ?? output.id)
                    : t((output.label as any) || ''),
                key: output.id,
                parent: {
                  id: node.nodeId,
                  label: node.name,
                  avatar: node.avatar
                }
              };
            });
        })
        .flat();

  return [...nodeVariables, ...sourceNodeVariables];
};
