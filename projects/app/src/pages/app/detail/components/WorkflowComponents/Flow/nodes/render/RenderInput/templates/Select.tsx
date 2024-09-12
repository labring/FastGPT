import React, { useMemo } from 'react';
import type { RenderInputProps } from '../type';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { WorkflowContext } from '@/pages/app/detail/components/WorkflowComponents/context';
import { useContextSelector } from 'use-context-selector';

const SelectRender = ({ item, nodeId }: RenderInputProps) => {
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

  const Render = useMemo(() => {
    return (
      <MySelect
        className="nowheel"
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
