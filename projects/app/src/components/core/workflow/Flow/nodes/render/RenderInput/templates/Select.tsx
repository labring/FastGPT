import React, { useMemo } from 'react';
import type { RenderInputProps } from '../type';
import { useFlowProviderStore } from '../../../../FlowProvider';
import MySelect from '@fastgpt/web/components/common/MySelect';

const SelectRender = ({ item, nodeId }: RenderInputProps) => {
  const { onChangeNode } = useFlowProviderStore();

  const Render = useMemo(() => {
    return (
      <MySelect
        width={'100%'}
        value={item.value}
        list={item.list || []}
        onchange={(e) => {
          onChangeNode({
            nodeId,
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
  }, [item, nodeId, onChangeNode]);

  return Render;
};

export default React.memo(SelectRender);
