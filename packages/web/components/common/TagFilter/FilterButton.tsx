import React, { forwardRef, useLayoutEffect, useRef, useState } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import type { FlexProps } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import MyIcon from '../Icon';

export type FilterSummaryValueProps = {
  text: ReactNode;
  extraCount?: number;
  chip?: boolean;
};

/** 多选触发器右侧：全部/未选择纯文本，已选项灰色胶囊，多人 +N。 */
export const FilterSummaryValue = ({
  text,
  extraCount = 0,
  chip = false
}: FilterSummaryValueProps) => (
  <Flex alignItems={'center'} gap={1} minW={0} maxW={'100%'}>
    <Box
      minW={0}
      overflow={'hidden'}
      textOverflow={'ellipsis'}
      whiteSpace={'nowrap'}
      {...(chip ? { px: 1, py: '2px', bg: 'myGray.100', borderRadius: 'xs' } : {})}
    >
      {text}
    </Box>
    {extraCount > 0 && (
      <Box
        flexShrink={0}
        px={1}
        py={'2px'}
        bg={'myGray.100'}
        borderRadius={'full'}
        whiteSpace={'nowrap'}
      >
        +{extraCount}
      </Box>
    )}
  </Flex>
);

export type FilterButtonProps = Omit<FlexProps, 'children' | 'title' | 'value'> & {
  title: ReactNode;
  value: ReactNode;
};

/** 测量触发器宽度，让下拉菜单不窄于按钮。 */
export const useFilterTriggerWidth = (syncKey?: unknown) => {
  const triggerRef = useRef<HTMLDivElement>(null);
  const [triggerWidth, setTriggerWidth] = useState(0);

  useLayoutEffect(() => {
    const width = triggerRef.current?.offsetWidth ?? 0;
    if (width > 0 && width !== triggerWidth) {
      setTriggerWidth(width);
    }
  }, [syncKey, triggerWidth]);

  return { triggerRef, triggerWidth };
};

const FilterButton = forwardRef<HTMLDivElement, FilterButtonProps>(
  ({ title, value, ...props }, ref) => (
    <Flex
      ref={ref}
      as={'button'}
      alignItems={'center'}
      gap={2}
      px={3}
      w={'fit-content'}
      maxW={'240px'}
      minW={0}
      flexShrink={0}
      h={'36px'}
      border={'1px solid'}
      borderColor={'myGray.200'}
      borderRadius={'sm'}
      bg={'white'}
      color={'myGray.900'}
      cursor={'pointer'}
      type={'button'}
      fontSize={'mini'}
      lineHeight={'16px'}
      _hover={{
        boxShadow: 'focus',
        borderColor: 'primary.300'
      }}
      sx={{
        '&[aria-expanded="true"]': {
          borderColor: 'primary.600',
          boxShadow: '0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)'
        }
      }}
      {...props}
    >
      <Flex alignItems={'center'} gap={2} minW={0} overflow={'hidden'}>
        <Box flexShrink={0}>{title}</Box>
        <Box w={'1px'} h={'16px'} flexShrink={0} bg={'myGray.200'} />
        <Flex minW={0} overflow={'hidden'} alignItems={'center'} whiteSpace={'nowrap'}>
          {value}
        </Flex>
      </Flex>
      <MyIcon
        name={'core/chat/chevronDown'}
        w={'16px'}
        h={'16px'}
        flexShrink={0}
        color={'myGray.500'}
      />
    </Flex>
  )
);

FilterButton.displayName = 'FilterButton';

export default FilterButton;
