import React, { useMemo } from 'react';
import type { RenderInputProps } from '../type';
import { Box } from '@chakra-ui/react';
import MySlider from '@/components/Slider';
import { useField } from '@/web/core/workflow/editor';

const SliderRender = ({ item, nodeId }: RenderInputProps) => {
  const field = useField(nodeId, item.key, 'input');
  const currentInput = field?.data.input ?? item;

  const Render = useMemo(() => {
    return (
      <Box px={2}>
        <MySlider
          markList={currentInput.markList?.map(({ label, value }) => ({ label, value }))}
          width={'100%'}
          min={currentInput.min || 0}
          max={currentInput.max}
          step={currentInput.step || 1}
          value={currentInput.value}
          onChange={(e) => {
            field?.setValue(e);
          }}
        />
      </Box>
    );
  }, [currentInput, field]);

  return Render;
};

export default React.memo(SliderRender);
