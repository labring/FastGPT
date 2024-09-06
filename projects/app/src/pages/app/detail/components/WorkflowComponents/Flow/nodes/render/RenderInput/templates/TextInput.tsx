import React, { useMemo } from 'react';
import type { RenderInputProps } from '../type';
import { Input } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '@/pages/app/detail/components/WorkflowComponents/context';
import { useTranslation } from 'next-i18next';

const TextInput = ({ item, nodeId }: RenderInputProps) => {
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);
  const { t } = useTranslation();
  const Render = useMemo(() => {
    return (
      <Input
        placeholder={t(item.placeholder as any) ?? t(item.description as any)}
        defaultValue={item.value}
        bg={'white'}
        px={3}
        borderRadius={'sm'}
        onBlur={(e) => {
          onChangeNode({
            nodeId,
            type: 'updateInput',
            key: item.key,
            value: {
              ...item,
              value: e.target.value
            }
          });
        }}
      />
    );
  }, [item, nodeId, onChangeNode, t]);

  return Render;
};

export default React.memo(TextInput);
