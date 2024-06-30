import React, { useCallback, useMemo } from 'react';
import type { RenderInputProps } from '../type';
import { useTranslation } from 'next-i18next';
import PromptEditor from '@fastgpt/web/components/common/Textarea/PromptEditor';
import { formatEditorVariablePickerIcon } from '@fastgpt/global/core/workflow/utils';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '@/pages/app/detail/components/WorkflowComponents/context';
import { getWorkflowGlobalVariables } from '@/web/core/workflow/utils';
import { useCreation } from 'ahooks';
import { AppContext } from '@/pages/app/detail/components/context';

const TextareaRender = ({ inputs = [], item, nodeId }: RenderInputProps) => {
  const { t } = useTranslation();
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);
  const { appDetail } = useContextSelector(AppContext, (v) => v);

  // get variable
  const variables = useCreation(() => {
    const globalVariables = getWorkflowGlobalVariables({
      nodes: nodeList,
      chatConfig: appDetail.chatConfig,
      t
    });

    const moduleVariables = formatEditorVariablePickerIcon(
      inputs
        .filter((input) => input.canEdit)
        .map((item) => ({
          key: item.key,
          label: item.label
        }))
    );

    return [...globalVariables, ...moduleVariables];
  }, [nodeList, inputs, t]);

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
        variables={variables}
        title={t(item.label)}
        maxLength={item.maxLength}
        h={150}
        placeholder={t(item.placeholder || '')}
        value={item.value}
        onChange={onChange}
        isFlow={true}
      />
    );
  }, [item.label, item.maxLength, item.placeholder, item.value, onChange, t, variables]);

  return Render;
};

export default React.memo(TextareaRender);
