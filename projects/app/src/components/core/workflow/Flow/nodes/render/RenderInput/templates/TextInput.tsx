import React, { useMemo } from 'react';
import type { RenderInputProps } from '../type';
import { Input } from '@chakra-ui/react';
import { useFlowProviderStore } from '../../../../FlowProvider';

const TextInput = ({ item, nodeId }: RenderInputProps) => {
  const { onChangeNode } = useFlowProviderStore();

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
