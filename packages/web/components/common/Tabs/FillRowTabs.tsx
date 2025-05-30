import React, { forwardRef, useRef, useState, useEffect } from 'react';
import { Flex, Box, type BoxProps, HStack } from '@chakra-ui/react';
import MyIcon from '../Icon';

type Props<T = string> = Omit<BoxProps, 'onChange'> & {
  list: {
    icon?: string;
    label: string | React.ReactNode;
    value: T;
  }[];
  value: T;
  onChange: (e: T) => void;
  iconSize?: string;
  labelSize?: string;
  iconGap?: number;
};

const FillRowTabs = ({
  list,
  value,
  onChange,
  py = '2.5',
  px = '4',
  iconSize = '18px',
  labelSize = 'sm',
  iconGap = 2,
  ...props
}: Props) => {
  const tabsRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<Map<any, HTMLDivElement>>(new Map());
  const [sliderStyle, setSliderStyle] = useState({
    width: 0,
    left: 0,
    opacity: 0
  });

  useEffect(() => {
    const updateSlider = () => {
      const activeItem = itemsRef.current.get(value);
      if (activeItem && tabsRef.current) {
        const tabsRect = tabsRef.current.getBoundingClientRect();
        const itemRect = activeItem.getBoundingClientRect();

        setSliderStyle({
          width: itemRect.width,
          left: itemRect.left - tabsRect.left,
          opacity: 1
        });
      }
    };

    updateSlider();
    window.addEventListener('resize', updateSlider);

    return () => {
      window.removeEventListener('resize', updateSlider);
    };
  }, [value]);

  return (
    <Box
      ref={tabsRef}
      position="relative"
      display={'inline-flex'}
      px={'3px'}
      py={'3px'}
      borderRadius={'sm'}
      borderWidth={'1px'}
      borderColor={'myGray.200'}
      bg={'myGray.50'}
      gap={'4px'}
      fontSize={'sm'}
      fontWeight={'medium'}
      {...props}
    >
      {/* 滑动背景元素 */}
      <Box
        position="absolute"
        height="calc(100% - 6px)"
        top="3px"
        borderRadius={'xs'}
        bg="white"
        boxShadow="1.5"
        transition="all 0.14s ease-in-out"
        pointerEvents="none"
        style={{
          width: `${sliderStyle.width}px`,
          left: `${sliderStyle.left}px`,
          opacity: sliderStyle.opacity
        }}
      />

      {list.map((item) => (
        <HStack
          key={item.value}
          ref={(el) => {
            if (el) itemsRef.current.set(item.value, el);
          }}
          flex={'1 0 0'}
          alignItems={'center'}
          justifyContent={'center'}
          cursor={'pointer'}
          borderRadius={'xs'}
          px={px}
          py={py}
          userSelect={'none'}
          whiteSpace={'noWrap'}
          gap={iconGap}
          zIndex={1}
          position="relative"
          transition="color 0.25s ease"
          onClick={() => onChange(item.value)}
          color={value === item.value ? 'primary.600' : 'myGray.500'}
          _hover={{
            color: 'primary.600'
          }}
        >
          {item.icon && <MyIcon name={item.icon as any} w={iconSize} />}
          <Box fontSize={labelSize}>{item.label}</Box>
        </HStack>
      ))}
    </Box>
  );
};

export default forwardRef(FillRowTabs) as <T>(
  props: Props<T> & { ref?: React.Ref<HTMLSelectElement> }
) => JSX.Element;
