import React, { useCallback, useMemo } from 'react';
import type { RenderInputProps } from '../type';
import JSONEditor from '@fastgpt/web/components/common/Textarea/JsonEditor';
import { formatEditorVariablePickerIcon } from '@fastgpt/global/core/workflow/utils';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '@/pages/app/detail/components/WorkflowComponents/context';
import { getWorkflowGlobalVariables } from '@/web/core/workflow/utils';
import { useCreation } from 'ahooks';
import { useTranslation } from 'next-i18next';
import { AppContext } from '@/pages/app/detail/components/context';

const JsonEditor = ({ inputs = [], item, nodeId }: RenderInputProps) => {
  const { t } = useTranslation();
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);
  const getNodeDynamicInputs = useContextSelector(WorkflowContext, (v) => v.getNodeDynamicInputs);

  const { appDetail } = useContextSelector(AppContext, (v) => v);

  // get variable
  const variables = useCreation(() => {
    const globalVariables = getWorkflowGlobalVariables({
      nodes: nodeList,
      chatConfig: appDetail.chatConfig
    });

    const nodeVariables = formatEditorVariablePickerIcon(getNodeDynamicInputs(nodeId));

    return [...globalVariables, ...nodeVariables];
  }, [inputs, nodeList]);

  const update = useCallback(
    (value: string) => {
      onChangeNode({
        nodeId,
        type: 'updateInput',
        key: item.key,
        value: {
          ...item,
          value
        }
      });
    },
    [item, nodeId, onChangeNode]
  );

  const value = useMemo(() => {
    if (typeof item.value === 'string') {
      return item.value;
    }
    return JSON.stringify(item.value, null, 2);
  }, [item.value]);

  return (
    <JSONEditor
      className="nowheel"
      bg={'white'}
      borderRadius={'sm'}
      placeholder={t(item.placeholder as any)}
      resize
      value={value}
      onChange={(e) => {
        update(e);
      }}
      variables={variables}
    />
  );
};

export default React.memo(JsonEditor);
