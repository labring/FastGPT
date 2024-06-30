import React, { useMemo } from 'react';
import type { RenderInputProps } from '../type';
import { Switch } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '@/pages/app/detail/components/WorkflowComponents/context';

const SwitchRender = ({ item, nodeId }: RenderInputProps) => {
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

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
