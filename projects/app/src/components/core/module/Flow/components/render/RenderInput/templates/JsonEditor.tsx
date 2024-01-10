import React, { useCallback } from 'react';
import type { RenderInputProps } from '../type';
import { onChangeNode } from '../../../../FlowProvider';
import { useTranslation } from 'next-i18next';
import JSONEditor from '@fastgpt/web/components/common/Textarea/JsonEditor';

const JsonEditor = ({ item, moduleId }: RenderInputProps) => {
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
    <JSONEditor
      title={t(item.label)}
      bg={'myWhite.400'}
      placeholder={t(item.placeholder || '')}
      resize
      defaultValue={item.value}
      onChange={(e) => {
        update(e);
      }}
    />
  );
};

export default React.memo(JsonEditor);
