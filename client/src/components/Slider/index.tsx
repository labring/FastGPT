import React, { useMemo } from 'react';
import {
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
  SliderMark,
  Box
} from '@chakra-ui/react';

const MySlider = ({
  markList,
  setVal,
  activeVal,
  max = 100,
  min = 0,
  step = 1
}: {
  markList: {
    label: string | number;
    value: number;
  }[];
  activeVal?: number;
  setVal: (index: number) => void;
  max?: number;
  min?: number;
  step?: number;
}) => {
  const startEndPointStyle = {
    content: '""',
    borderRadius: '10px',
    width: '10px',
    height: '10px',
    backgroundColor: '#ffffff',
    border: '2px solid #D7DBE2',
    position: 'absolute',
    zIndex: 1,
    top: 0,
    transform: 'translateY(-3px)'
  };
  const value = useMemo(() => {
    const index = markList.findIndex((item) => item.value === activeVal);
    return index > -1 ? index : 0;
  }, [activeVal, markList]);

  return (
    <Slider max={max} min={min} step={step} size={'lg'} value={value} onChange={setVal}>
      {markList.map((item, i) => (
        <SliderMark
          key={item.value}
          value={i}
          mt={3}
          fontSize={'sm'}
          transform={'translateX(-50%)'}
          {...(activeVal === item.value ? { color: 'myBlue.500', fontWeight: 'bold' } : {})}
        >
          <Box px={3} cursor={'pointer'}>
            {item.label}
          </Box>
        </SliderMark>
      ))}
      <SliderTrack
        bg={'#EAEDF3'}
        overflow={'visible'}
        h={'4px'}
        _before={{
          ...startEndPointStyle,
          left: '-5px'
        }}
        _after={{
          ...startEndPointStyle,
          right: '-5px'
        }}
      >
        <SliderFilledTrack />
      </SliderTrack>
      <SliderThumb border={'2.5px solid'} borderColor={'myBlue.500'}></SliderThumb>
    </Slider>
  );
};

export default MySlider;
