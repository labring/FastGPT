import React from 'react';
import type { RenderInputProps } from '../type';
import { onChangeNode } from '../../../../FlowProvider';
import MySelect from '@/components/Select';

const SelectRender = ({ item, moduleId }: RenderInputProps) => {
  return (
    <MySelect
      width={'100%'}
      value={item.value}
      list={item.list || []}
      onchange={(e) => {
        onChangeNode({
          moduleId,
          type: 'updateInput',
          key: item.key,
          value: {
            ...item,
            value: e
          }
        });
      }}
    />
  );
};

export default React.memo(SelectRender);
