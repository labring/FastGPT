import React, { forwardRef, useCallback, useRef } from 'react';
import { Box, type BoxProps, HStack, useMergeRefs } from '@chakra-ui/react';
import type { ResponsiveValue } from '@chakra-ui/system';
import MyIcon from '../Icon';

type FillRowTabsSize = 'sm' | 'md';

// 跨内容切换重新挂载时，通过业务 key 在当前页面会话内恢复横向位置。
const scrollPositionMap = new Map<string, number>();

type Props<T = string> = Omit<BoxProps, 'onChange' | 'size'> & {
  list: {
    icon?: string;
    iconSize?: string;
    label: string | React.ReactNode;
    value: T;
  }[];
  value: T;
  onChange: (e: T) => void;
  size?: ResponsiveValue<FillRowTabsSize>;
  iconSize?: string;
  labelSize?: string;
  iconGap?: number;
  itemHeight?: string;
  outerPadding?: string;
  outerHeight?: string;
  scrollPositionKey?: string;
};

const FillRowTabs = (
  {
    list,
    value,
    onChange,
    size = 'md',
    py,
    px,
    iconSize = '18px',
    labelSize = 'sm',
    iconGap = 2,
    itemHeight,
    outerPadding,
    outerHeight,
    scrollPositionKey,
    onScroll,
    ...props
  }: Props,
  ref: React.Ref<HTMLDivElement>
) => {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const setScrollContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      scrollContainerRef.current = node;
      if (!node || !scrollPositionKey) return;

      const savedScrollPosition = scrollPositionMap.get(scrollPositionKey);
      if (savedScrollPosition !== undefined) {
        node.scrollLeft = savedScrollPosition;
      }
    },
    [scrollPositionKey]
  );
  const mergedRef = useMergeRefs(ref, setScrollContainerRef);

  const resolveSizeValue = (valueMap: Record<FillRowTabsSize, string | number>): BoxProps['px'] => {
    const resolveValue = (value: FillRowTabsSize | null | undefined) =>
      value == null ? value : valueMap[value];

    if (typeof size === 'string') {
      return resolveValue(size) as BoxProps['px'];
    }
    if (Array.isArray(size)) {
      return size.map(resolveValue) as BoxProps['px'];
    }
    return Object.fromEntries(
      Object.entries(size).map(([breakpoint, value]) => [
        breakpoint,
        resolveValue(value as FillRowTabsSize | null | undefined)
      ])
    ) as BoxProps['px'];
  };

  const sizePx = resolveSizeValue({ sm: 4, md: 4 });
  const sizePy = resolveSizeValue({ sm: 1, md: '2.5' });

  return (
    <Box
      ref={mergedRef}
      display={'inline-flex'}
      maxW={'100%'}
      minW={0}
      overflowX={'auto'}
      overflowY={'hidden'}
      overscrollBehaviorX={'contain'}
      sx={{
        scrollbarWidth: 'none',
        '&::-webkit-scrollbar': {
          display: 'none'
        }
      }}
      px={'3px'}
      py={'3px'}
      {...(outerPadding ? { p: outerPadding } : {})}
      borderRadius={'sm'}
      borderWidth={'1px'}
      borderColor={'myGray.200'}
      {...(outerHeight
        ? {
            h: outerHeight,
            borderWidth: 0,
            boxShadow: 'inset 0 0 0 1px var(--chakra-colors-myGray-200)'
          }
        : {})}
      bg={'myGray.50'}
      gap={'4px'}
      fontSize={'sm'}
      fontWeight={'medium'}
      onScroll={(event) => {
        if (scrollPositionKey) {
          scrollPositionMap.set(scrollPositionKey, event.currentTarget.scrollLeft);
        }
        onScroll?.(event);
      }}
      {...props}
    >
      {list.map((item) => (
        <HStack
          key={item.value}
          flex={'1 0 0'}
          alignItems={'center'}
          justifyContent={'center'}
          cursor={'pointer'}
          borderRadius={'xs'}
          px={px ?? sizePx}
          py={py ?? sizePy}
          {...(itemHeight ? { h: itemHeight } : {})}
          userSelect={'none'}
          whiteSpace={'noWrap'}
          gap={iconGap}
          {...(value === item.value
            ? {
                bg: 'white',
                boxShadow: '1.5',
                color: 'primary.700'
              }
            : {
                color: 'myGray.500',
                _hover: {
                  color: 'primary.700'
                },
                onClick: () => {
                  if (scrollPositionKey && scrollContainerRef.current) {
                    scrollPositionMap.set(scrollPositionKey, scrollContainerRef.current.scrollLeft);
                  }
                  onChange(item.value);
                }
              })}
        >
          {item.icon && (
            <MyIcon
              name={item.icon as any}
              w={item.iconSize || iconSize}
              h={item.iconSize || iconSize}
            />
          )}
          {item.label !== undefined && item.label !== '' && (
            <Box fontSize={labelSize}>{item.label}</Box>
          )}
        </HStack>
      ))}
    </Box>
  );
};

export default forwardRef(FillRowTabs) as <T>(
  props: Props<T> & { ref?: React.Ref<HTMLDivElement> }
) => JSX.Element;
