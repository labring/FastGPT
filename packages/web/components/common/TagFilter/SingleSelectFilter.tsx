import React, { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { FILTER_LIST_H, getFilterListBoxProps, filterPopoverProps } from './styles';

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
  listMaxH?: string | number;
};

/** 从选项里取出当前值对应项；无效值必须显式暴露，不能静默回退。 */
export function resolveSingleSelectOption<T>(
  options: Array<SingleSelectFilterOption<T>>,
  value: T
): SingleSelectFilterOption<T> | undefined {
  return options.find((item) => item.value === value);
}

/** 计算选中项居中时的滚动位置，并限制在列表的有效滚动范围内。 */
export function getCenteredOptionScrollTop({
  optionOffsetTop,
  optionHeight,
  listHeight,
  scrollHeight
}: {
  optionOffsetTop: number;
  optionHeight: number;
  listHeight: number;
  scrollHeight: number;
}) {
  const centeredScrollTop = optionOffsetTop - (listHeight - optionHeight) / 2;
  const maxScrollTop = Math.max(0, scrollHeight - listHeight);

  return Math.min(Math.max(0, centeredScrollTop), maxScrollTop);
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
  searchPlaceholder,
  listMaxH
}: SingleSelectFilterProps<T>) {
  const { t } = useTranslation();
  const [searchKey, setSearchKey] = useState('');
  const [openRevision, setOpenRevision] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const selectedOptionRef = useRef<HTMLDivElement>(null);
  const selected = useMemo(() => resolveSingleSelectOption(options, value), [options, value]);
  const visibleOptions = useMemo(
    () => filterSelectOptionsBySearch(options, searchKey),
    [options, searchKey]
  );
  const invalidValueLabel = t('common:invalid_value');
  const hasLoadedOptions = options.length > 0;
  const { triggerRef, triggerWidth } = useFilterTriggerWidth(
    selected?.label ?? (hasLoadedOptions ? invalidValueLabel : undefined)
  );
  const listScrollable = showSearch || visibleOptions.length > FILTER_SEARCH_THRESHOLD;

  useLayoutEffect(() => {
    const list = listRef.current;
    const selectedOption = selectedOptionRef.current;
    if (!list || !selectedOption) return;

    list.scrollTop = getCenteredOptionScrollTop({
      optionOffsetTop: selectedOption.offsetTop,
      optionHeight: selectedOption.offsetHeight,
      listHeight: list.clientHeight,
      scrollHeight: list.scrollHeight
    });
  }, [openRevision, value, visibleOptions]);

  const selectedContent = selected ? (
    <Flex alignItems={'center'} gap={2} minW={0} overflow={'hidden'} whiteSpace={'nowrap'}>
      {selected.avatar && (
        <Avatar src={selected.avatar} w={'1rem'} h={'1rem'} flexShrink={0} borderRadius={'full'} />
      )}
      {selected.icon && (
        <MyIcon
          name={selected.icon}
          w={'16px'}
          h={'16px'}
          flexShrink={0}
          color={'currentcolor'}
          sx={{ '& path': { fill: 'currentColor' } }}
        />
      )}
      <Box minW={0} overflow={'hidden'} textOverflow={'ellipsis'} whiteSpace={'nowrap'}>
        {selected.label}
      </Box>
    </Flex>
  ) : hasLoadedOptions ? (
    <Box color={'red.600'} whiteSpace={'nowrap'}>
      {invalidValueLabel}
    </Box>
  ) : null;

  return (
    <MyPopover
      {...filterPopoverProps}
      placement={placement}
      w={'max-content'}
      minW={triggerWidth ? `${triggerWidth}px` : minW}
      onOpenFunc={() => setOpenRevision((revision) => revision + 1)}
      onCloseFunc={() => setSearchKey('')}
      Trigger={
        <FilterButton
          ref={triggerRef}
          title={title}
          value={selectedContent}
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
          <Box
            ref={listRef}
            {...getFilterListBoxProps(listScrollable)}
            maxH={listScrollable ? (listMaxH ?? FILTER_LIST_H) : undefined}
            position={'relative'}
          >
            {visibleOptions.map((item) => {
              const isActive = item.value === value;
              return (
                <Flex
                  key={String(item.value)}
                  ref={isActive ? selectedOptionRef : undefined}
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
                  fontSize={'sm'}
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
                      <MyIcon
                        name={item.icon}
                        w={'16px'}
                        h={'16px'}
                        flexShrink={0}
                        color={'currentcolor'}
                        sx={{ '& path': { fill: 'currentColor' } }}
                      />
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
