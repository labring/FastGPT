import React from 'react';
import type { RenderInputProps } from '../type';
import { onChangeNode } from '../../../../FlowProvider';
import { useTranslation } from 'next-i18next';
import { Box } from '@chakra-ui/react';
import MySlider from '@/components/Slider';

const SliderRender = ({ item, moduleId }: RenderInputProps) => {
  const { t } = useTranslation();
  return (
    <Box pt={5} pb={4} px={2}>
      <MySlider
        markList={item.markList}
        width={'100%'}
        min={item.min || 0}
        max={item.max}
        step={item.step || 1}
        value={item.value}
        onChange={(e) => {
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
    </Box>
  );
};

export default React.memo(SliderRender);
