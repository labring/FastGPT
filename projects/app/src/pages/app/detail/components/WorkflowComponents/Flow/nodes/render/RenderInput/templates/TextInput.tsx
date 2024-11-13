import React, { useCallback, useMemo } from 'react';
import type { RenderInputProps } from '../type';
import { useTranslation } from 'next-i18next';
import PromptEditor from '@fastgpt/web/components/common/Textarea/PromptEditor';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '@/pages/app/detail/components/WorkflowComponents/context';
import { useCreation } from 'ahooks';
import { AppContext } from '@/pages/app/detail/components/context';
import { getEditorVariables } from '../../../../../utils';
import { WorkflowNodeEdgeContext } from '../../../../../context/workflowInitContext';

const TextInputRender = ({ inputs = [], item, nodeId }: RenderInputProps) => {
  const { t } = useTranslation();
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const edges = useContextSelector(WorkflowNodeEdgeContext, (v) => v.edges);
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

  // get variable
  const variables = useCreation(() => {
    return getEditorVariables({
      nodeId,
      nodeList,
      edges,
      appDetail,
      t
    });
  }, [nodeId, nodeList, edges, appDetail, t]);

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
        minH={30}
        maxH={120}
        placeholder={t(item.placeholder as any)}
        value={item.value}
        onChange={onChange}
      />
    );
  }, [item.label, item.maxLength, item.placeholder, item.value, onChange, t, variables]);

  return Render;
};

export default React.memo(TextInputRender);
