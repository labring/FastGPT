import React, { useCallback, useMemo, useTransition } from 'react';
import type { RenderInputProps } from '../type';
import { useFlowProviderStore, onChangeNode } from '../../../../FlowProvider';
import { useTranslation } from 'next-i18next';
import PromptEditor from '@fastgpt/web/components/common/Textarea/PromptEditor';
import {
  formatVariablesIcon,
  getGuideModule,
  splitGuideModule
} from '@fastgpt/global/core/module/utils';

const TextareaRender = ({ item, moduleId }: RenderInputProps) => {
  const { t } = useTranslation();
  const [, startTst] = useTransition();
  const { nodes } = useFlowProviderStore();

  // get variable
  const variables = useMemo(
    () =>
      formatVariablesIcon(
        splitGuideModule(getGuideModule(nodes.map((node) => node.data)))?.variableModules || []
      ),
    [nodes]
  );

  const onChange = useCallback(
    (e: string) => {
      startTst(() => {
        onChangeNode({
          moduleId,
          type: 'updateInput',
          key: item.key,
          value: {
            ...item,
            value: e
          }
        });
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
      defaultValue={item.value}
      onChange={onChange}
    />
  );
};

export default React.memo(TextareaRender);
