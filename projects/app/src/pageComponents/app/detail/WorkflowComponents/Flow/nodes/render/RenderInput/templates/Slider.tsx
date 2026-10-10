import React, { useMemo } from 'react';
import type { RenderInputProps } from '../type';
import { Box } from '@chakra-ui/react';
import MySlider from '@/components/Slider';
import { useField, useFieldActions } from '@/web/core/workflow/editor/react/useField';

const SliderRender = ({ item, nodeId }: RenderInputProps) => {
  const fieldInput = useField(nodeId, item.key, 'input', (field) => field?.data.input);
  const fieldActions = useFieldActions({ nodeId, fieldKey: item.key, kind: 'input' });

  const Render = useMemo(() => {
    if (!fieldInput) return null;

    return (
      <Box px={2}>
        <MySlider
          markList={fieldInput.markList?.map(({ label, value }) => ({ label, value }))}
          width={'100%'}
          min={fieldInput.min || 0}
          max={fieldInput.max}
          step={fieldInput.step || 1}
          value={fieldInput.value}
          onChange={(e) => {
            fieldActions.setValue(e);
          }}
        />
      </Box>
    );
  }, [fieldInput, fieldActions]);

  return Render;
};

export default React.memo(SliderRender);
