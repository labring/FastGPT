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
  onChange,
  value,
  max = 100,
  min = 0,
  step = 1,
  width = '100%'
}: {
  markList?: {
    label: string | number;
    value: number;
  }[];
  value: number;
  onChange?: (index: number) => void;
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

  return (
    <Box pb={4} zIndex={10}>
      <Slider
        max={max}
        min={min}
        step={step}
        value={value}
        width={width}
        onChange={onChange}
        _hover={{
          '& .marker': {
            display: 'block'
          }
        }}
        _active={{
          '& .marker': {
            display: 'block'
          }
        }}
      >
        {markList?.map((item, i) => (
          <SliderMark
            key={item.value}
            value={item.value}
            fontSize={'sm'}
            mt={2}
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
          className="marker"
          value={value}
          textAlign="center"
          bg="primary.500"
          color="white"
          px={1}
          minW={'20px'}
          w={'auto'}
          py={'1px'}
          borderRadius={'md'}
          transform={'translate(-50%, -155%)'}
          fontSize={'11px'}
          display={['block', 'none']}
        >
          <Box transform={'scale(0.9)'}>{value}</Box>
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
          <SliderFilledTrack bg={'primary.500'} />
        </SliderTrack>
        <SliderThumb border={'3px solid'} borderColor={'primary.500'}></SliderThumb>
      </Slider>
    </Box>
  );
};

export default MySlider;
