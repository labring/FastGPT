import React, { useCallback, useMemo, useTransition } from 'react';
import type { RenderInputProps } from '../type';
import { useFlowProviderStore, onChangeNode } from '../../../../FlowProvider';
import { useTranslation } from 'next-i18next';
import PromptEditor from '@fastgpt/web/components/common/Textarea/PromptEditor';
import {
  formatEditorVariablePickerIcon,
  getGuideModule,
  splitGuideModule
} from '@fastgpt/global/core/module/utils';

const TextareaRender = ({ inputs = [], item, moduleId }: RenderInputProps) => {
  const { t } = useTranslation();
  const { nodes } = useFlowProviderStore();

  // get variable
  const variables = useMemo(() => {
    const globalVariables = formatEditorVariablePickerIcon(
      splitGuideModule(getGuideModule(nodes.map((node) => node.data)))?.variableModules || []
    );
    const moduleVariables = formatEditorVariablePickerIcon(
      inputs
        .filter((input) => input.edit)
        .map((item) => ({
          key: item.key,
          label: item.label
        }))
    );
    const systemVariables = [
      {
        key: 'cTime',
        label: t('core.module.http.Current time')
      }
    ];

    return [...globalVariables, ...moduleVariables, ...systemVariables];
  }, [inputs, nodes, t]);

  const onChange = useCallback(
    (e: string) => {
      onChangeNode({
        moduleId,
        type: 'updateInput',
        key: item.key,
        value: {
          ...item,
          value: e
        }
      });
    },
    [item, moduleId]
  );

  return (
    <PromptEditor
      variables={variables}
      title={t(item.label)}
      h={150}
      placeholder={t(item.placeholder || '')}
      value={item.value}
      onChange={onChange}
    />
  );
};

export default React.memo(TextareaRender);
