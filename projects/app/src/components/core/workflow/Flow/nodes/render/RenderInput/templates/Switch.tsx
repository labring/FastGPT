import React, { useMemo } from 'react';
import type { RenderInputProps } from '../type';
import { Switch } from '@chakra-ui/react';
import { useFlowProviderStore } from '../../../../FlowProvider';

const SwitchRender = ({ item, nodeId }: RenderInputProps) => {
  const { onChangeNode } = useFlowProviderStore();

  const Render = useMemo(() => {
    return (
      <Switch
        size={'md'}
        isChecked={item.value}
        onChange={(e) => {
          onChangeNode({
            nodeId,
            type: 'updateInput',
            key: item.key,
            value: {
              ...item,
              value: e.target.checked
            }
          });
        }}
      />
    );
  }, [item, nodeId, onChangeNode]);

  return Render;
};

export default React.memo(SwitchRender);
