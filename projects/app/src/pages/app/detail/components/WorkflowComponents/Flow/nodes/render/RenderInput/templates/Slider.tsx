import React, { useMemo } from 'react';
import type { RenderInputProps } from '../type';
import { useTranslation } from 'next-i18next';
import { Box } from '@chakra-ui/react';
import MySlider from '@/components/Slider';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '@/pages/app/detail/components/WorkflowComponents/context';

const SliderRender = ({ item, nodeId }: RenderInputProps) => {
  const { t } = useTranslation();
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

  const Render = useMemo(() => {
    return (
      <Box px={2}>
        <MySlider
          markList={item.markList}
          width={'100%'}
          min={item.min || 0}
          max={item.max}
          step={item.step || 1}
          value={item.value}
          onChange={(e) => {
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
      </Box>
    );
  }, [item, nodeId, onChangeNode]);

  return Render;
};

export default React.memo(SliderRender);
