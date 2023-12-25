import React, { useCallback } from 'react';
import type { RenderInputProps } from '../type';
import { onChangeNode } from '../../../../FlowProvider';
import { useTranslation } from 'next-i18next';
import PromptTextarea from '@/components/common/Textarea/PromptTextarea';

const TextareaRender = ({ item, moduleId }: RenderInputProps) => {
  const { t } = useTranslation();

  const update = useCallback(
    (value: string) => {
      onChangeNode({
        moduleId,
        type: 'updateInput',
        key: item.key,
        value: {
          ...item,
          value
        }
      });
    },
    [item, moduleId]
  );

  return (
    <PromptTextarea
      title={t(item.label)}
      rows={5}
      bg={'myWhite.400'}
      placeholder={t(item.placeholder || '')}
      resize={'both'}
      defaultValue={item.value}
      onBlur={(e) => {
        update(e.target.value);
      }}
    />
  );
};

export default React.memo(TextareaRender);
