import React, { useMemo } from 'react';
import type { RenderInputProps } from '../type';
import { Input } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '@/components/core/workflow/context';

const TextInput = ({ item, nodeId }: RenderInputProps) => {
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

  const Render = useMemo(() => {
    return (
      <Input
        placeholder={item.placeholder}
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
  }, [item, nodeId, onChangeNode]);

  return Render;
};

export default React.memo(TextInput);
