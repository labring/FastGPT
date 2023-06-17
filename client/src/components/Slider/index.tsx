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
  markList = [],
  setVal,
  activeVal,
  max = 100,
  min = 0,
  step = 1,
  width = '100%'
}: {
  markList?: {
    label: string | number;
    value: number;
  }[];
  activeVal: number;
  setVal: (index: number) => void;
  max?: number;
  min?: number;
  step?: number;
  width?: string | string[] | number | number[];
}) => {
  const startEndPointStyle = {
    content: '""',
    borderRadius: '6px',
    width: '6px',
    height: '6px',
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
    <Slider
      max={max}
      min={min}
      step={step}
      size={'lg'}
      value={activeVal}
      width={width}
      onChange={setVal}
    >
      {markList?.map((item, i) => (
        <SliderMark
          key={item.value}
          value={item.value}
          fontSize={'sm'}
          mt={3}
          whiteSpace={'nowrap'}
          transform={'translateX(-50%)'}
          color={'myGray.600'}
        >
          <Box px={3} cursor={'pointer'}>
            {item.label}
          </Box>
        </SliderMark>
      ))}
      <SliderMark
        value={activeVal}
        textAlign="center"
        bg="myBlue.600"
        color="white"
        px={1}
        minW={'18px'}
        w={'auto'}
        h={'18px'}
        borderRadius={'18px'}
        fontSize={'xs'}
        transform={'translate(-50%, -170%)'}
        boxSizing={'border-box'}
      >
        {activeVal}
      </SliderMark>
      <SliderTrack
        bg={'#EAEDF3'}
        overflow={'visible'}
        h={'4px'}
        _before={{
          ...startEndPointStyle,
          left: '-3px'
        }}
        _after={{
          ...startEndPointStyle,
          right: '-3px'
        }}
      >
        <SliderFilledTrack bg={'myBlue.600'} />
      </SliderTrack>
      <SliderThumb border={'3px solid'} borderColor={'myBlue.600'}></SliderThumb>
    </Slider>
  );
};

export default MySlider;
