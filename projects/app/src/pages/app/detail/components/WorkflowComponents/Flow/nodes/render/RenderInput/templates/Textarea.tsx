import React, { useCallback, useMemo } from 'react';
import type { RenderInputProps } from '../type';
import { useTranslation } from 'next-i18next';
import PromptEditor from '@fastgpt/web/components/common/Textarea/PromptEditor';
import { formatEditorVariablePickerIcon } from '@fastgpt/global/core/workflow/utils';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '@/pages/app/detail/components/WorkflowComponents/context';
import { computedNodeInputReference } from '@/web/core/workflow/utils';
import { useCreation } from 'ahooks';
import { AppContext } from '@/pages/app/detail/components/context';

const TextareaRender = ({ inputs = [], item, nodeId }: RenderInputProps) => {
  const { t } = useTranslation();
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);
  const edges = useContextSelector(WorkflowContext, (v) => v.edges);
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);
  const getNodeDynamicInputs = useContextSelector(WorkflowContext, (v) => v.getNodeDynamicInputs);

  const { appDetail } = useContextSelector(AppContext, (v) => v);

  // get variable
  const variables = useCreation(() => {
    const currentNode = nodeList.find((node) => node.nodeId === nodeId)!;
    const nodeVariables = getNodeDynamicInputs(nodeId).map((item) => ({
      key: item.key,
      label: item.label,
      parent: {
        id: currentNode.nodeId,
        label: currentNode.name,
        avatar: currentNode.avatar
      }
    }));

    const sourceNodes = computedNodeInputReference({
      nodeId,
      nodes: nodeList,
      edges: edges,
      chatConfig: appDetail.chatConfig,
      t
    });

    const sourceNodeVariables = !sourceNodes
      ? []
      : sourceNodes
          .map((node) => {
            return node.outputs
              .filter((output) => !!output.label)
              .map((output) => {
                return {
                  label: t((output.label as any) || ''),
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
  }, [nodeList, edges, inputs, t]);

  const onChange = useCallback(
    (e: string) => {
      onChangeNode({
        nodeId,
        type: 'updateInput',
        key: item.key,
        value: {
          ...item,
          value: e
        }
      });
    },
    [item, nodeId, onChangeNode]
  );

  const Render = useMemo(() => {
    return (
      <PromptEditor
        variableLabels={variables}
        variables={variables}
        title={t(item.label as any)}
        maxLength={item.maxLength}
        h={150}
        placeholder={t((item.placeholder as any) || '')}
        value={item.value}
        onChange={onChange}
        isFlow={true}
      />
    );
  }, [item.label, item.maxLength, item.placeholder, item.value, onChange, t, variables]);

  return Render;
};

export default React.memo(TextareaRender);
