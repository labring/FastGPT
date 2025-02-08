import React, { useMemo } from 'react';
import { Slider, SliderTrack, SliderThumb, HStack, SliderMark } from '@chakra-ui/react';
import MyNumberInput from '../Input/NumberInput';

const InputSlider = ({
  onChange,
  value,
  max = 100,
  min = 0,
  step = 1,
  isDisabled
}: {
  value?: number;
  onChange: (index: number) => void;
  max: number;
  min: number;
  step?: number;
  isDisabled?: boolean;
}) => {
  const markList = useMemo(() => {
    const valLen = max - min;
    return [
      valLen * 0.007 + min,
      valLen * 0.2 + min,
      valLen * 0.4 + min,
      valLen * 0.6 + min,
      valLen * 0.8 + min,
      valLen * 0.985 + min
    ];
  }, [max, min]);

  return (
    <HStack zIndex={10} spacing={3}>
      <Slider
        max={max}
        min={min}
        step={step}
        value={value}
        focusThumbOnChange={false}
        onChange={onChange}
        isDisabled={isDisabled}
      >
        <SliderTrack bg={'myGray.100'} h={'4px'} />
        {markList.map((val, i) => (
          <SliderMark
            key={i}
            value={val}
            w={'2px'}
            h={'2px'}
            bg={'#A4A4A4'}
            borderRadius={'2px'}
            opacity={0.4}
            transform={'translateY(-50%)'}
          />
        ))}
        <SliderThumb
          bg={'primary.500'}
          border={'4px solid'}
          borderColor={'#dee7f6'}
          w={'18px'}
          h={'18px'}
          boxShadow={'none'}
          // transform={'translate(-50%, -50%) !important'}
        />
      </Slider>
      <MyNumberInput
        size={'sm'}
        width={'150px'}
        min={min}
        max={max}
        step={step}
        value={value}
        isDisabled={isDisabled}
        onChange={(e) => onChange(e ?? min)}
      />
    </HStack>
  );
};

export default React.memo(InputSlider);
