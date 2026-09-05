import React, { useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { Box, Checkbox, Flex } from '@chakra-ui/react';
import type { BoxProps, PlacementWithLogical } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyPopover from '../MyPopover';
import MyIcon from '../Icon';
import Avatar from '../Avatar';
import MyTooltip from '../MyTooltip';
import FilterButton, { FilterSummaryValue, useFilterTriggerWidth } from './FilterButton';
import FilterSearchInput, {
  FILTER_SEARCH_THRESHOLD,
  filterSelectOptionsBySearch
} from './FilterSearchInput';
import {
  DEFAULT_FILTER_LIST_SIZE,
  getFilterListBoxProps,
  filterPopoverProps,
  type FilterListSize
} from './styles';
import {
  createMultiSelectFilter,
  getMultiSelectFilterSummary,
  toggleMultiSelectFilterValue,
  type MultiSelectFilterOption,
  type MultiSelectFilterValue
} from './multiSelectFilterUtils';

export type MultiSelectFilterLabels = {
  all: string;
  unselected: string;
  selectedSelf?: string;
};

/** 多选筛选通用文案：全部 / 未选择。页面专用文案仍自己传 labels。 */
export const useCommonFilterLabels = () => {
  const { t } = useTranslation();
  return useMemo(
    () => ({
      all: t('common:All'),
      unselected: t('common:filter_unselected')
    }),
    [t]
  );
};

export type MultiSelectFilterProps<T extends string = string> = {
  title: ReactNode;
  value: MultiSelectFilterValue<T>;
  onChange: (next: MultiSelectFilterValue<T>) => void;
  options: Array<MultiSelectFilterOption<T>>;
  labels: MultiSelectFilterLabels;
  currentValue?: T;
  /** 为 true 时下拉里显示搜索框。封闭短枚举不要传。 */
  showSearch?: boolean;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (next: string) => void;
  /** 受控搜索默认不在前端再滤一遍，避免和分页接口抢数据。 */
  filterLocal?: boolean;
  ListContainer?: ComponentType<{ children: ReactNode } & BoxProps>;
  footer?: ReactNode;
  onOpen?: () => void;
  maxW?: string | number;
  placement?: PlacementWithLogical;
  /** 下拉列表高度档位，选项较多时使用 md 或 lg。 */
  listSize?: FilterListSize;
};

/**
 * 多选筛选：全部是独立项；勾选进入已选；取消最后一项变成未选择。
 * 触发器 hug，菜单按最长文案定宽且不窄于触发器。
 */
function MultiSelectFilter<T extends string>({
  title,
  value,
  onChange,
  options,
  labels,
  currentValue,
  showSearch,
  searchPlaceholder,
  searchValue,
  onSearchChange,
  filterLocal,
  ListContainer,
  footer,
  onOpen,
  maxW = '200px',
  placement = 'bottom-start',
  listSize = DEFAULT_FILTER_LIST_SIZE
}: MultiSelectFilterProps<T>) {
  const { t } = useTranslation();
  const [innerSearch, setInnerSearch] = useState('');
  const searchKey = searchValue ?? innerSearch;
  const setSearchKey = onSearchChange ?? setInnerSearch;
  const shouldFilterLocal = filterLocal ?? !onSearchChange;

  const visibleOptions = useMemo(
    () => (shouldFilterLocal ? filterSelectOptionsBySearch(options, searchKey) : options),
    [options, searchKey, shouldFilterLocal]
  );
  const selectedSet = useMemo(() => new Set(value.values), [value.values]);
  const summary = getMultiSelectFilterSummary({
    mode: value.mode,
    values: value.values,
    options,
    currentValue,
    labels
  });
  const { triggerRef, triggerWidth } = useFilterTriggerWidth(
    `${summary.text}-${summary.extraCount}`
  );
  const listScrollable = showSearch || visibleOptions.length > FILTER_SEARCH_THRESHOLD;
  const listProps = getFilterListBoxProps(listScrollable, listSize);
  const listItems = visibleOptions.map((item) => {
    const checked = value.mode === 'selected' && selectedSet.has(item.value);
    return (
      <Flex
        key={item.value}
        alignItems={'center'}
        justifyContent={'space-between'}
        gap={2}
        w={'100%'}
        px={1}
        py={'6px'}
        cursor={'pointer'}
        borderRadius={'xs'}
        fontSize={'sm'}
        _hover={{ bg: 'myGray.05' }}
        onClick={() => onChange(toggleMultiSelectFilterValue(value, item.value))}
      >
        <Flex alignItems={'center'} gap={2} minW={0} overflow={'hidden'}>
          <Checkbox
            isChecked={checked}
            pointerEvents={'none'}
            size={'sm'}
            icon={<MyIcon name={'common/check'} w={'12px'} />}
            sx={{
              // 自定义勾图标不会走 Chakra 未选中时的隐藏，悬浮会露出白勾
              '.chakra-checkbox__control:not([data-checked]) svg': { opacity: 0 }
            }}
          />
          {item.avatar && <Avatar src={item.avatar} w={'16px'} h={'16px'} borderRadius={'full'} />}
          <MyTooltip label={item.label} showOnlyWhenOverflow shouldWrapChildren={false}>
            <Box
              minW={0}
              overflow={'hidden'}
              textOverflow={'ellipsis'}
              fontWeight={'medium'}
              color={'myGray.600'}
              whiteSpace={'nowrap'}
            >
              {item.label}
            </Box>
          </MyTooltip>
        </Flex>
        {item.extra && (
          <Box flexShrink={0} color={'myGray.500'} fontWeight={'normal'}>
            {item.extra}
          </Box>
        )}
      </Flex>
    );
  });

  return (
    <MyPopover
      {...filterPopoverProps}
      placement={placement}
      w={'max-content'}
      minW={triggerWidth ? `${triggerWidth}px` : undefined}
      onOpenFunc={onOpen}
      Trigger={
        <FilterButton
          ref={triggerRef}
          title={title}
          value={<FilterSummaryValue {...summary} />}
          maxW={maxW}
        />
      }
    >
      {() => (
        <Box p={'6px'} minW={'100%'} onClick={(e) => e.stopPropagation()}>
          <Flex direction={'column'} gap={'4px'}>
            <Flex
              alignItems={'center'}
              px={1}
              py={'6px'}
              cursor={'pointer'}
              borderRadius={'xs'}
              bg={value.mode === 'all' ? 'myGray.05' : 'transparent'}
              color={value.mode === 'all' ? 'primary.700' : 'myGray.600'}
              fontSize={'sm'}
              fontWeight={'medium'}
              _hover={{ bg: 'myGray.05' }}
              onClick={() => onChange(createMultiSelectFilter<T>())}
            >
              {labels.all}
            </Flex>
            {showSearch ? (
              <FilterSearchInput
                value={searchKey}
                placeholder={searchPlaceholder ?? t('common:Search')}
                onChange={setSearchKey}
              />
            ) : (
              visibleOptions.length > 0 && <Box h={'1px'} bg={'myGray.200'} />
            )}
            {visibleOptions.length > 0 &&
              (ListContainer ? (
                <ListContainer {...listProps}>{listItems}</ListContainer>
              ) : (
                <Box {...listProps}>{listItems}</Box>
              ))}
            {footer && (
              <>
                <Box h={'1px'} bg={'myGray.200'} />
                {footer}
              </>
            )}
          </Flex>
        </Box>
      )}
    </MyPopover>
  );
}

export default React.memo(MultiSelectFilter) as typeof MultiSelectFilter;
