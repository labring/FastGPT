import React, { useCallback, useMemo } from 'react';
import type { RenderInputProps } from '../type';
import { useFlowProviderStore } from '../../../../FlowProvider';
import { useTranslation } from 'next-i18next';
import PromptEditor from '@fastgpt/web/components/common/Textarea/PromptEditor';
import {
  formatEditorVariablePickerIcon,
  getGuideModule,
  splitGuideModule
} from '@fastgpt/global/core/workflow/utils';
import { getSystemVariables } from '@/web/core/app/utils';

const TextareaRender = ({ inputs = [], item, nodeId }: RenderInputProps) => {
  const { t } = useTranslation();
  const { nodeList, onChangeNode } = useFlowProviderStore();

  // get variable
  const variables = useMemo(() => {
    const globalVariables = formatEditorVariablePickerIcon(
      splitGuideModule(getGuideModule(nodeList))?.variableModules || []
    );
    const moduleVariables = formatEditorVariablePickerIcon(
      inputs
        .filter((input) => input.canEdit)
        .map((item) => ({
          key: item.key,
          label: item.label
        }))
    );

    const systemVariables = getSystemVariables(t);

    return [...globalVariables, ...moduleVariables, ...systemVariables];
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
