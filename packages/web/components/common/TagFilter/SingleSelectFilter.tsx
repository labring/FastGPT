import React, { useMemo, type ReactNode } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import type { PlacementWithLogical } from '@chakra-ui/react';
import MyPopover from '../MyPopover';
import MyIcon from '../Icon';
import type { IconNameType } from '../Icon/type';
import FilterButton, { useFilterTriggerWidth } from './FilterButton';
import { filterPopoverProps } from './styles';

export type SingleSelectFilterOption<T> = {
  value: T;
  label: ReactNode;
  icon?: IconNameType;
  extra?: ReactNode;
};

export type SingleSelectFilterProps<T> = {
  title: ReactNode;
  value: T;
  options: Array<SingleSelectFilterOption<T>>;
  onChange: (value: T) => void;
  maxW?: string | number;
  minW?: string | number;
  placement?: PlacementWithLogical;
};

/**
 * 从选项里取出当前值对应项，找不到则回退第一项。
 */
export function resolveSingleSelectOption<T>(
  options: Array<SingleSelectFilterOption<T>>,
  value: T
): SingleSelectFilterOption<T> | undefined {
  return options.find((item) => item.value === value) ?? options[0];
}

/**
 * 单选筛选：复用 FilterButton 触发器，菜单按内容 hug 且不窄于触发器。
 */
function SingleSelectFilter<T>({
  title,
  value,
  options,
  onChange,
  maxW = '180px',
  minW,
  placement = 'bottom-start'
}: SingleSelectFilterProps<T>) {
  const selected = useMemo(() => resolveSingleSelectOption(options, value), [options, value]);
  const { triggerRef, triggerWidth } = useFilterTriggerWidth(selected?.label);

  return (
    <MyPopover
      {...filterPopoverProps}
      placement={placement}
      w={'max-content'}
      minW={triggerWidth ? `${triggerWidth}px` : minW}
      Trigger={
        <FilterButton
          ref={triggerRef}
          title={title}
          value={selected?.label}
          maxW={maxW}
          minW={minW}
        />
      }
    >
      {({ onClose }) => (
        <Box p={'6px'} minW={'100%'}>
          {options.map((item) => {
            const isActive = item.value === value;
            return (
              <Flex
                key={String(item.value)}
                alignItems={'center'}
                gap={2}
                px={1}
                py={'6px'}
                mb={'4px'}
                cursor={'pointer'}
                borderRadius={'xs'}
                bg={isActive ? 'primary.50' : 'transparent'}
                color={isActive ? 'primary.600' : 'myGray.900'}
                fontSize={'xs'}
                fontWeight={'medium'}
                _hover={{ bg: isActive ? 'primary.50' : 'myGray.05' }}
                _last={{ mb: 0 }}
                onClick={() => {
                  onChange(item.value);
                  onClose();
                }}
              >
                {item.icon && (
                  <MyIcon name={item.icon} w={'16px'} h={'16px'} color={'currentcolor'} />
                )}
                <Box
                  minW={0}
                  flex={1}
                  overflow={'hidden'}
                  textOverflow={'ellipsis'}
                  whiteSpace={'nowrap'}
                >
                  {item.label}
                </Box>
                {item.extra && (
                  <Box flexShrink={0} color={'myGray.500'} fontWeight={'normal'}>
                    {item.extra}
                  </Box>
                )}
              </Flex>
            );
          })}
        </Box>
      )}
    </MyPopover>
  );
}

export default React.memo(SingleSelectFilter) as typeof SingleSelectFilter;
