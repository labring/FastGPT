import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Box, Flex, Grid } from '@chakra-ui/react';
import type { FlexProps, GridProps } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import Avatar from '../Avatar';

// 跨路由切换时组件会重新挂载，通过业务 key 在当前页面会话内恢复横向位置。
const scrollPositionMap = new Map<string, number>();

type Props<ValueType = string> = Omit<GridProps, 'onChange'> & {
  list: { icon?: string; label: string | React.ReactNode; value: ValueType }[];
  value: ValueType;
  size?: 'sm' | 'md' | 'lg';
  inlineStyles?: FlexProps;
  activeColor?: string;
  defaultColor?: string;
  itemHeight?: string;
  outerPadding?: string;
  outerHeight?: string;
  ensureActiveVisible?: boolean;
  scrollPositionKey?: string;
  onChange: (value: ValueType) => void;
};

const LightRowTabs = <ValueType = string,>({
  list,
  size = 'md',
  value,
  activeColor = 'primary.600',
  defaultColor = 'transparent',
  itemHeight,
  outerPadding,
  outerHeight,
  ensureActiveVisible = false,
  scrollPositionKey,
  onChange,
  inlineStyles,
  ...props
}: Props<ValueType>) => {
  const { t } = useTranslation();
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const activeTabRef = useRef<HTMLDivElement>(null);
  const hasSavedScrollPosition = scrollPositionKey
    ? scrollPositionMap.has(scrollPositionKey)
    : false;
  const sizeMap = useMemo(() => {
    switch (size) {
      case 'sm':
        return {
          fontSize: 'xs',
          outP: '3px',
          inlineP: 1
        };
      case 'md':
        return {
          fontSize: 'sm',
          outP: '4px',
          inlineP: 1
        };
      case 'lg':
        return {
          fontSize: ['sm', 'md'],
          outP: '5px',
          inlineP: 2
        };
    }
  }, [size]);

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

  useEffect(() => {
    if (!ensureActiveVisible || hasSavedScrollPosition) return;

    const frameId = requestAnimationFrame(() => {
      const container = scrollContainerRef.current;
      const activeTab = activeTabRef.current;
      if (!container || !activeTab) return;

      const containerRect = container.getBoundingClientRect();
      const activeTabRect = activeTab.getBoundingClientRect();
      const edgeSpacing = 8;

      if (activeTabRect.left < containerRect.left) {
        container.scrollLeft += activeTabRect.left - containerRect.left - edgeSpacing;
      } else if (activeTabRect.right > containerRect.right) {
        container.scrollLeft += activeTabRect.right - containerRect.right + edgeSpacing;
      }
    });

    return () => cancelAnimationFrame(frameId);
  }, [ensureActiveVisible, hasSavedScrollPosition, value]);

  return (
    <Box
      ref={setScrollContainerRef}
      overflow={'auto'}
      onScroll={(event) => {
        if (scrollPositionKey) {
          scrollPositionMap.set(scrollPositionKey, event.currentTarget.scrollLeft);
        }
      }}
    >
      <Grid
        gridTemplateColumns={`repeat(${list.length},1fr)`}
        p={sizeMap.outP}
        {...(outerPadding ? { p: outerPadding } : {})}
        {...(outerHeight ? { minH: outerHeight } : {})}
        borderRadius={'sm'}
        fontSize={sizeMap.fontSize}
        userSelect={'none'}
        display={'inline-grid'}
        {...props}
      >
        {list.map((item) => (
          <Flex
            key={item.value as string}
            ref={item.value === value ? activeTabRef : undefined}
            py={sizeMap.inlineP}
            {...(itemHeight ? { h: itemHeight } : {})}
            alignItems={'center'}
            justifyContent={'center'}
            borderBottom={'2px solid'}
            borderColor={defaultColor}
            px={1}
            whiteSpace={'nowrap'}
            _hover={{
              color: activeColor
            }}
            fontWeight={'medium'}
            onClick={() => {
              if (value === item.value) return;
              if (scrollPositionKey && scrollContainerRef.current) {
                scrollPositionMap.set(scrollPositionKey, scrollContainerRef.current.scrollLeft);
              }
              onChange(item.value);
            }}
            {...inlineStyles}
            {...(value === item.value
              ? {
                  color: activeColor,
                  cursor: 'default',
                  borderBottomColor: activeColor
                }
              : {
                  cursor: 'pointer'
                })}
          >
            {item.icon && (
              <>
                <Avatar src={item.icon} alt={''} w={'1.25rem'} borderRadius={'sm'} mr={1} />
              </>
            )}
            <Box>{typeof item.label === 'string' ? t(item.label as any) : item.label}</Box>
          </Flex>
        ))}
      </Grid>
    </Box>
  );
};

export default LightRowTabs;
