import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import type { GridProps } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import type { IconNameType } from '@fastgpt/web/components/common/Icon/type';

/**
 * 支持两级分组的侧栏 tab 定义：父级可携带 children 子项。
 * 无 children 时行为与 SideTabs 单级一致，用于兼容账号页等单层使用。
 */
export type GroupTab<ValueType = string> = {
  value: ValueType;
  label: string;
  icon: string;
  children?: GroupTab<ValueType>[];
};

export type Props<ValueType = string> = Omit<GridProps, 'onChange'> & {
  list: GroupTab<ValueType>[];
  value: ValueType;
  size?: 'sm' | 'md' | 'lg';
  onChange: (value: ValueType) => void;
  scrollPositionKey?: string;
};

const SideTabsGroup = <ValueType = string,>({
  list,
  size = 'md',
  value,
  onChange,
  scrollPositionKey = 'navigation',
  ...props
}: Props<ValueType>) => {
  const sizeMap = useMemo(() => {
    switch (size) {
      case 'sm':
        return {
          fontSize: 'xs',
          inlineP: 1
        };
      case 'md':
        return {
          fontSize: 'sm',
          inlineP: 2
        };
      case 'lg':
        return {
          fontSize: 'md',
          inlineP: 3
        };
    }
  }, [size]);

  // 当前激活项所在父级默认展开
  const defaultExpand = useMemo(
    () =>
      list
        .filter((item) => item.children?.some((child) => child.value === value))
        .map((item) => item.value),
    [list, value]
  );
  const storageKey = 'fastgpt-admin-navigation-expanded-groups';
  const [expandValues, setExpandValues] = useState<ValueType[]>(() => {
    if (typeof window === 'undefined') return defaultExpand;

    try {
      const stored = window.localStorage.getItem(storageKey);
      const values = stored ? (JSON.parse(stored) as ValueType[]) : [];
      return Array.from(new Set([...values, ...defaultExpand]));
    } catch {
      return defaultExpand;
    }
  });

  // 路由切换后保证激活父级展开；状态写入 localStorage，以跨页面重新挂载保留用户选择。
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 父级展开状态需跟随路由 value 同步更新
    setExpandValues((prev) => {
      const next = Array.from(new Set([...prev, ...defaultExpand]));
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // 存储不可用时仍保留内存中的展开状态。
      }
      return next;
    });
  }, [defaultExpand]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollStorageKey = `fastgpt-navigation-scroll:${scrollPositionKey}`;

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    try {
      const stored = window.localStorage.getItem(scrollStorageKey);
      if (stored) element.scrollTop = Number(stored);
    } catch {
      // 存储不可用时使用默认滚动位置。
    }
  }, [scrollStorageKey]);

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    try {
      window.localStorage.setItem(scrollStorageKey, String(event.currentTarget.scrollTop));
    } catch {
      // 存储不可用时不影响滚动。
    }
  };

  const toggleExpand = (itemValue: ValueType) => {
    setExpandValues((prev) => {
      const next = prev.includes(itemValue)
        ? prev.filter((i) => i !== itemValue)
        : [...prev, itemValue];
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // 存储不可用时仍保留内存中的展开状态。
      }
      return next;
    });
  };

  const isActive = (itemValue: ValueType) => value === itemValue;

  return (
    <Box ref={scrollRef} onScroll={handleScroll} fontSize={sizeMap.fontSize} {...props}>
      {list.map((item) => {
        const hasChildren = !!item.children && item.children.length > 0;
        const isExpanded = expandValues.includes(item.value);

        // 单级项：与 SideTabs 行为一致
        if (!hasChildren) {
          return (
            <Flex
              key={item.value as string}
              py={sizeMap.inlineP}
              borderRadius={'md'}
              px={3}
              mb={2}
              fontWeight={'medium'}
              alignItems={'center'}
              {...(isActive(item.value)
                ? {
                    bg: 'primary.100 !important',
                    color: 'primary.600',
                    cursor: 'default'
                  }
                : {
                    cursor: 'pointer',
                    color: 'myGray.600'
                  })}
              _hover={{
                color: 'primary.600',
                bg: 'myGray.100'
              }}
              onClick={() => {
                if (isActive(item.value)) return;
                onChange(item.value);
              }}
            >
              <MyIcon mr={2} name={item.icon as IconNameType} w={'20px'} />
              {item.label}
            </Flex>
          );
        }

        // 分组父级：可展开/收起，激活子项时高亮并自动展开
        const children = item.children ?? [];
        const isGroupActive = children.some((child) => child.value === value);
        return (
          <Box key={item.value as string}>
            <Flex
              py={sizeMap.inlineP}
              borderRadius={'md'}
              px={3}
              mb={2}
              fontWeight={'medium'}
              alignItems={'center'}
              cursor={'pointer'}
              color={isGroupActive ? 'primary.600' : 'myGray.600'}
              _hover={{
                color: 'primary.600',
                bg: 'myGray.100'
              }}
              onClick={() => toggleExpand(item.value)}
            >
              <MyIcon
                mr={2}
                name={item.icon as IconNameType}
                w={'20px'}
                color={isGroupActive ? 'primary.600' : undefined}
              />
              <Box flex={1}>{item.label}</Box>
              <MyIcon
                name={isExpanded ? 'core/chat/chevronUp' : 'core/chat/chevronDown'}
                w={'16px'}
                color={'myGray.400'}
              />
            </Flex>
            {isExpanded && (
              <Box mb={2}>
                {children.map((child) => (
                  <Flex
                    key={child.value as string}
                    py={1.5}
                    borderRadius={'md'}
                    pl={6}
                    pr={3}
                    mb={0.5}
                    fontWeight={'medium'}
                    alignItems={'center'}
                    {...(isActive(child.value)
                      ? {
                          bg: 'primary.100 !important',
                          color: 'primary.600',
                          cursor: 'default'
                        }
                      : {
                          cursor: 'pointer',
                          color: 'myGray.600'
                        })}
                    _hover={{
                      color: 'primary.600',
                      bg: 'myGray.100'
                    }}
                    onClick={() => {
                      if (isActive(child.value)) return;
                      onChange(child.value);
                    }}
                  >
                    <MyIcon mr={2} name={child.icon as IconNameType} w={'18px'} />
                    {child.label}
                  </Flex>
                ))}
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
};

export default SideTabsGroup;
