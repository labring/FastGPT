import MultipleSelect from '@fastgpt/web/components/common/MySelect/MultipleSelect';
import { RenderInputProps } from '../type';
import { WorkflowContext } from '@/pageComponents/app/detail/WorkflowComponents/context';
import { useContextSelector } from 'use-context-selector';
import React from 'react';

const SelectMultiRender = ({ item, nodeId }: RenderInputProps) => {
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);
  return (
    <MultipleSelect<string>
      width={'100%'}
      value={item.value}
      list={item.list || []}
      onSelect={(e) =>
        onChangeNode({
          nodeId,
          type: 'updateInput',
          key: item.key,
          value: {
            ...item,
            value: e
          }
        })
      }
      isSelectAll={item.value.length === item?.list?.length}
      setIsSelectAll={(all) => {
        if (all) {
          onChangeNode({
            nodeId,
            type: 'updateInput',
            key: item.key,
            value: {
              ...item,
              value: item?.list?.map((item) => item.value)
            }
          });
        }
      }}
    />
  );
};

export default React.memo(SelectMultiRender);
