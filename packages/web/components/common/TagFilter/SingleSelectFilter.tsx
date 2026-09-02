import React, { useMemo, useState, type ReactNode } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import type { PlacementWithLogical } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyPopover from '../MyPopover';
import MyIcon from '../Icon';
import Avatar from '../Avatar';
import type { IconNameType } from '../Icon/type';
import FilterButton, { useFilterTriggerWidth } from './FilterButton';
import FilterSearchInput, {
  FILTER_SEARCH_THRESHOLD,
  filterSelectOptionsBySearch
} from './FilterSearchInput';
import { getFilterListBoxProps, filterPopoverProps } from './styles';

export type SingleSelectFilterOption<T> = {
  value: T;
  label: ReactNode;
  icon?: IconNameType;
  avatar?: string;
  extra?: ReactNode;
  searchText?: string;
};

export type SingleSelectFilterProps<T> = {
  title: ReactNode;
  value: T;
  options: Array<SingleSelectFilterOption<T>>;
  onChange: (value: T) => void;
  maxW?: string | number;
  minW?: string | number;
  placement?: PlacementWithLogical;
  /** 为 true 时下拉里显示搜索框。封闭短枚举不要传。 */
  showSearch?: boolean;
  searchPlaceholder?: string;
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
 * 单选筛选：触发器 hug，菜单按最长文案定宽且不窄于触发器。
 */
function SingleSelectFilter<T>({
  title,
  value,
  options,
  onChange,
  maxW = '180px',
  minW,
  placement = 'bottom-start',
  showSearch,
  searchPlaceholder
}: SingleSelectFilterProps<T>) {
  const { t } = useTranslation();
  const [searchKey, setSearchKey] = useState('');
  const selected = useMemo(() => resolveSingleSelectOption(options, value), [options, value]);
  const visibleOptions = useMemo(
    () => filterSelectOptionsBySearch(options, searchKey),
    [options, searchKey]
  );
  const { triggerRef, triggerWidth } = useFilterTriggerWidth(selected?.label);
  const listScrollable = showSearch || visibleOptions.length > FILTER_SEARCH_THRESHOLD;

  return (
    <MyPopover
      {...filterPopoverProps}
      placement={placement}
      w={'max-content'}
      minW={triggerWidth ? `${triggerWidth}px` : minW}
      onCloseFunc={() => setSearchKey('')}
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
          {showSearch && (
            <Box mb={'4px'}>
              <FilterSearchInput
                value={searchKey}
                placeholder={searchPlaceholder ?? t('common:Search')}
                onChange={setSearchKey}
              />
            </Box>
          )}
          <Box {...getFilterListBoxProps(listScrollable)}>
            {visibleOptions.map((item) => {
              const isActive = item.value === value;
              return (
                <Flex
                  key={String(item.value)}
                  alignItems={'center'}
                  justifyContent={'space-between'}
                  gap={2}
                  w={'100%'}
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
                  <Flex alignItems={'center'} gap={2} minW={0}>
                    {item.avatar && <Avatar src={item.avatar} w={'1rem'} />}
                    {item.icon && (
                      <MyIcon name={item.icon} w={'16px'} h={'16px'} color={'currentcolor'} />
                    )}
                    <Box whiteSpace={'nowrap'}>{item.label}</Box>
                  </Flex>
                  {item.extra && (
                    <Box flexShrink={0} color={'myGray.500'} fontWeight={'normal'}>
                      {item.extra}
                    </Box>
                  )}
                </Flex>
              );
            })}
          </Box>
        </Box>
      )}
    </MyPopover>
  );
}

export default React.memo(SingleSelectFilter) as typeof SingleSelectFilter;
