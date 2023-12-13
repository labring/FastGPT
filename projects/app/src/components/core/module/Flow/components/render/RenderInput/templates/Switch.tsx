import React from 'react';
import type { RenderInputProps } from '../type';
import { Switch } from '@chakra-ui/react';
import { onChangeNode } from '../../../../FlowProvider';

const SwitchRender = ({ item, moduleId }: RenderInputProps) => {
  return (
    <Switch
      size={'lg'}
      isChecked={item.value}
      onChange={(e) => {
        onChangeNode({
          moduleId,
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
};

export default React.memo(SwitchRender);
