import type { FlexProps } from '@chakra-ui/react';
import {
  Box,
  type ButtonProps,
  Checkbox,
  Flex,
  Menu,
  MenuButton,
  MenuItem,
  type MenuItemProps,
  MenuList,
  useDisclosure
} from '@chakra-ui/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MyTag from '../Tag/index';
import MyIcon from '../Icon';
import MyAvatar from '../Avatar';
import { useTranslation } from 'next-i18next';
import type { useScrollPagination } from '../../../hooks/useScrollPagination';
import MyDivider from '../MyDivider';
import { shadowLight } from '../../../styles/theme';
import { useMemoEnhance } from '../../../hooks/useMemoEnhance';
import MyLoading from '../MyLoading';
import { selectSizeStyleMap, type MySelectSize } from './styles';
import EmptyTip from '../EmptyTip';
import FilterSearchInput, { filterSelectOptionsBySearch } from '../TagFilter/FilterSearchInput';
import { useStaticVirtualList } from '../../../hooks/useVirtualList';
import MyIconButton from '../Icon/button';
import { useMenuListPresence } from './useMenuListPresence';
import { useCloseOnFlowNodeDragAreaPointerDown } from '../../../hooks/useCloseOnFlowNodeDragAreaPointerDown';

const menuItemStyles: MenuItemProps = {
  borderRadius: 'sm',
  py: 2,
  display: 'flex',
  alignItems: 'center',
  _hover: {
    backgroundColor: 'myGray.100'
  },
  _notLast: {
    mb: 2
  }
};

const VirtualizedMenuOptions = ({
  list,
  virtualListHeight,
  canSearch,
  showSelectAll,
  searchValue,
  renderItem
}: {
  list: SelectProps<any>['list'];
  virtualListHeight: number;
  canSearch: boolean;
  showSelectAll: boolean;
  searchValue: string;
  renderItem: (
    item: SelectProps<any>['list'][number],
    index: number,
    virtual: boolean
  ) => React.ReactNode;
}) => {
  const {
    containerRef,
    virtualDataList,
    topPlaceholderHeight,
    bottomPlaceholderHeight,
    scrollToTop
  } = useStaticVirtualList({ data: list, itemHeight: 40, overscan: 6 });

  useEffect(() => {
    scrollToTop();
  }, [list, scrollToTop, searchValue]);

  return (
    <Box
      ref={containerRef}
      h={`min(${Math.min(list.length * 40, virtualListHeight)}px, calc(40vh - ${
        (canSearch ? 36 : 0) + (showSelectAll ? 32 : 0) + 12
      }px))`}
      overflowY={'auto'}
    >
      {topPlaceholderHeight > 0 && <Box h={`${topPlaceholderHeight}px`} />}
      {virtualDataList.map((item) => renderItem(item.data, item.index, true))}
      {bottomPlaceholderHeight > 0 && <Box h={`${bottomPlaceholderHeight}px`} />}
    </Box>
  );
};

const selectedTagStyle: FlexProps = {
  bg: 'white',
  border: 'base',
  color: 'myGray.900'
};

const selectedTagSizeStyleMap: Record<
  MySelectSize,
  Pick<FlexProps, 'fontSize' | 'minH' | 'px' | 'py'>
> = {
  sm: {
    fontSize: 'xs',
    minH: 5,
    px: 2,
    py: 0.5
  },
  md: {
    fontSize: 'sm',
    minH: 6,
    px: 2.5,
    py: 1
  },
  lg: {
    fontSize: 'sm',
    minH: 7,
    px: 3,
    py: 1
  }
};

export type SelectProps<T = any> = {
  list: {
    icon?: string;
    label: string | React.ReactNode;
    value: T;
    searchText?: string;
  }[];
  value: T[];
  isSelectAll?: boolean;
  setIsSelectAll?: React.Dispatch<React.SetStateAction<boolean>>;
  showSelectAll?: boolean;

  placeholder?: string;
  /** true 展示全部已选标签并自动换行；false 单行展示并以 +N 收起溢出项。 */
  itemWrap?: boolean;
  onSelect: (val: T[]) => void;
  closeable?: boolean;
  isDisabled?: boolean;
  ScrollData?: ReturnType<typeof useScrollPagination>['ScrollData'];

  formLabel?: string;
  formLabelFontSize?: string;

  inputValue?: string;
  setInputValue?: (val: string) => void;
  isSearch?: boolean;
  searchPlaceholder?: string;
  /** 受控搜索默认交给调用方过滤；非受控搜索默认在组件内过滤。 */
  filterLocal?: boolean;

  /** 适用于已经一次性加载完成的大列表；分页列表请在外部使用 useVirtualList。 */
  virtualScroll?: boolean;
  virtualListHeight?: number;
  emptyText?: React.ReactNode;

  onOpenFunc?: () => void;

  size?: MySelectSize;
  tagStyle?: FlexProps;
  menuBottomSlot?: React.ReactNode;
} & Omit<ButtonProps, 'onSelect' | 'size'>;

type SelectedItemType<T> = {
  icon?: string;
  label: string | React.ReactNode;
  value: T;
  isInvalid: boolean;
};

/**
 * 将受控值解析为用于展示的选中项；已经不在候选列表中的值保留在结果中，
 * 但统一标记为无效项，避免继续展示可能已经过期或不可读的原始值。
 */
export const resolveMultipleSelectItems = <T,>({
  values,
  list,
  invalidLabel
}: {
  values: T[];
  list: SelectProps<T>['list'];
  invalidLabel: React.ReactNode;
}): SelectedItemType<T>[] => {
  return values.map((value) => {
    const listItem = list.find((item) => item.value === value);

    return listItem
      ? { ...listItem, isInvalid: false }
      : { value, label: invalidLabel, isInvalid: true };
  });
};

type MultipleSelectMenuProps = {
  isOpen: boolean;
  isDisabled: boolean;
  triggerContent: React.ReactNode;
  triggerProps: ButtonProps;
  list: SelectProps<any>['list'];
  formatValue: any[];
  isAllSelected: boolean;
  onclickItem: (val: any) => void;
  onSelectAll: () => void;
  setIsSelectAll?: React.Dispatch<React.SetStateAction<boolean>>;
  showSelectAll: boolean;
  ScrollData?: SelectProps<any>['ScrollData'];
  canSearch: boolean;
  searchValue: string;
  setSearchValue: (val: string) => void;
  searchPlaceholder?: string;
  shouldFilterLocal: boolean;
  virtualScroll: boolean;
  virtualListHeight: number;
  emptyText?: React.ReactNode;
  menuBottomSlot?: React.ReactNode;
  isLoading?: boolean;
  onOpen: () => void;
  onClose: () => void;
};

const MultipleSelectMenu = React.memo(function MultipleSelectMenu({
  isOpen,
  isDisabled,
  triggerContent,
  triggerProps,
  list,
  formatValue,
  isAllSelected,
  onclickItem,
  onSelectAll,
  setIsSelectAll,
  showSelectAll,
  ScrollData,
  canSearch,
  searchValue,
  setSearchValue,
  searchPlaceholder,
  shouldFilterLocal,
  virtualScroll,
  virtualListHeight,
  emptyText,
  menuBottomSlot,
  isLoading,
  onOpen,
  onClose
}: MultipleSelectMenuProps) {
  const { t } = useTranslation();
  const triggerOnClick = triggerProps.onClick;
  const triggerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [menuWidth, setMenuWidth] = useState<number>();
  const visibleList = useMemo(
    () => (canSearch && shouldFilterLocal ? filterSelectOptionsBySearch(list, searchValue) : list),
    [canSearch, list, searchValue, shouldFilterLocal]
  );
  const shouldUseVirtualList = virtualScroll && !ScrollData;
  const hasSelectAll = showSelectAll || !!setIsSelectAll;
  const { isMounted, mount, onAnimationComplete } = useMenuListPresence(isOpen);
  const menuListAnimationProps = { onAnimationComplete } as {
    onAnimationComplete: () => void;
  };

  const onMenuButtonClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (isDisabled) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      triggerOnClick?.(e);
    },
    [isDisabled, triggerOnClick]
  );

  const handleOpen = useCallback(() => {
    const width =
      triggerRef.current?.offsetWidth ||
      triggerRef.current?.clientWidth ||
      triggerRef.current?.getBoundingClientRect().width;
    if (width) {
      setMenuWidth(width);
    }
    mount();
    onOpen();
  }, [mount, onOpen]);

  const customOnKeyDown = triggerProps.onKeyDown;
  const onStaticTriggerClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (isDisabled) return;

      triggerOnClick?.(e as unknown as React.MouseEvent<HTMLButtonElement>);
      if (!e.isPropagationStopped()) {
        handleOpen();
      }
    },
    [handleOpen, isDisabled, triggerOnClick]
  );
  const onStaticTriggerKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (isDisabled) return;

      customOnKeyDown?.(e as unknown as React.KeyboardEvent<HTMLButtonElement>);
      if (e.isPropagationStopped() || (e.key !== 'Enter' && e.key !== ' ')) return;

      e.preventDefault();
      handleOpen();
    },
    [customOnKeyDown, handleOpen, isDisabled]
  );

  const renderListItem = useCallback(
    (item: (typeof list)[number], index: number, virtual = false) => {
      const isSelected = !isAllSelected && formatValue.includes(item.value);
      return (
        <MenuItem
          key={index}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onclickItem(item.value);
          }}
          whiteSpace={'pre-wrap'}
          gap={2}
          color={'myGray.600'}
          {...menuItemStyles}
          {...(virtual
            ? {
                h: '40px',
                minH: '40px',
                py: 0,
                mb: 0,
                _notLast: { mb: 0 }
              }
            : {})}
        >
          <Checkbox
            isChecked={isSelected}
            tabIndex={-1}
            aria-hidden
            pointerEvents={'none'}
            size={'sm'}
            flexShrink={0}
            icon={<MyIcon name={'common/check'} w={'12px'} />}
            sx={{ '.chakra-checkbox__control:not([data-checked]) svg': { opacity: 0 } }}
          />
          {item.icon && (
            <MyAvatar src={item.icon} w={'16px'} h={'16px'} borderRadius={'0'} flexShrink={0} />
          )}
          <Box flex={'1 0 0'} minW={0}>
            {item.label}
          </Box>
        </MenuItem>
      );
    },
    [formatValue, isAllSelected, onclickItem]
  );

  const ListRender = useMemo(
    () => <>{visibleList.map((item, index) => renderListItem(item, index))}</>,
    [renderListItem, visibleList]
  );

  const menuList = (
    <MenuList
      className={triggerProps.className}
      w={'100%'}
      minW={menuWidth ? `${menuWidth}px` : undefined}
      px={'6px'}
      py={'6px'}
      border={'1px solid #fff'}
      boxShadow={
        '0px 4px 10px 0px rgba(19, 51, 107, 0.10), 0px 0px 1px 0px rgba(19, 51, 107, 0.10);'
      }
      zIndex={99}
      maxH={'40vh'}
      overflowY={shouldUseVirtualList ? 'hidden' : 'auto'}
      position={'relative'}
      rootProps={
        {
          'data-preserve-width': true,
          style: {
            width: menuWidth ? `${menuWidth}px` : undefined,
            visibility: 'visible',
            pointerEvents: isOpen ? undefined : 'none'
          }
        } as any
      }
      motionProps={{ initial: 'exit' }}
      {...menuListAnimationProps}
    >
      {(hasSelectAll || canSearch) && (
        <Flex direction={'column'} gap={'4px'} mb={1}>
          {hasSelectAll && (
            <MenuItem
              alignItems={'center'}
              px={1}
              py={'6px'}
              cursor={'pointer'}
              borderRadius={'xs'}
              bg={isAllSelected ? 'myGray.05' : 'transparent'}
              color={isAllSelected ? 'primary.700' : 'myGray.600'}
              fontSize={'xs'}
              lineHeight={'16px'}
              fontWeight={'medium'}
              _hover={{ bg: 'myGray.05' }}
              _focus={{ bg: 'myGray.05' }}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onSelectAll();
              }}
            >
              {t('common:All')}
            </MenuItem>
          )}
          {canSearch ? (
            <FilterSearchInput
              ref={searchInputRef}
              value={searchValue}
              placeholder={searchPlaceholder ?? t('common:Search')}
              onChange={setSearchValue}
            />
          ) : (
            hasSelectAll && visibleList.length > 0 && <Box h={'1px'} bg={'myGray.200'} />
          )}
        </Flex>
      )}

      {ScrollData ? (
        <ScrollData minH={20}>{ListRender}</ScrollData>
      ) : visibleList.length === 0 && !isLoading ? (
        <EmptyTip py={8} text={emptyText} />
      ) : shouldUseVirtualList ? (
        <VirtualizedMenuOptions
          list={visibleList}
          virtualListHeight={virtualListHeight}
          canSearch={canSearch}
          showSelectAll={hasSelectAll}
          searchValue={searchValue}
          renderItem={renderListItem}
        />
      ) : (
        ListRender
      )}

      {menuBottomSlot && (
        <>
          <MyDivider my={1} />
          <Box px={1} py={1}>
            {menuBottomSlot}
          </Box>
        </>
      )}

      {isLoading && <MyLoading fixed={false} />}
    </MenuList>
  );

  const staticTrigger = (
    <Flex
      {...(triggerProps as unknown as FlexProps)}
      ref={triggerRef}
      role={'button'}
      tabIndex={isDisabled ? -1 : 0}
      aria-disabled={isDisabled || undefined}
      aria-expanded={isOpen}
      onClick={onStaticTriggerClick}
      onKeyDown={onStaticTriggerKeyDown}
    >
      {triggerContent}
    </Flex>
  );

  return isMounted ? (
    <Menu
      autoSelect={canSearch}
      initialFocusRef={canSearch ? searchInputRef : undefined}
      isOpen={isOpen}
      onOpen={handleOpen}
      onClose={onClose}
      strategy={'fixed'}
      matchWidth
      closeOnSelect={false}
    >
      <MenuButton
        as={Flex}
        {...triggerProps}
        ref={triggerRef}
        role={'button'}
        tabIndex={isDisabled ? -1 : 0}
        aria-disabled={isDisabled || undefined}
        pointerEvents={isOpen ? undefined : 'none'}
        onClick={onMenuButtonClick}
      >
        {triggerContent}
      </MenuButton>
      {menuList}
    </Menu>
  ) : (
    staticTrigger
  );
});

/**
 * 通用多选器：默认以单行 +N 展示选中项，也可完整换行展示。
 * 搜索位于展开菜单内；静态大列表可启用虚拟滚动，远程分页由调用方管理。
 */
const MultipleSelect = <T = any,>({
  value: initialValue = [],
  placeholder,
  list = [],
  onSelect,
  closeable = false,
  itemWrap = false,
  ScrollData,
  isSelectAll,
  setIsSelectAll,
  showSelectAll = false,
  isDisabled = false,

  formLabel,
  formLabelFontSize = 'sm',

  inputValue,
  setInputValue,
  isSearch = false,
  searchPlaceholder,
  filterLocal,
  virtualScroll = false,
  virtualListHeight = 240,
  emptyText,

  onOpenFunc,

  size = 'md',
  tagStyle,
  menuBottomSlot,
  isLoading,
  ...props
}: SelectProps<T>) => {
  const tagsContainerRef = useRef<HTMLDivElement>(null);
  const outsideClickRef = useRef<HTMLDivElement>(null);

  const { t } = useTranslation();
  const { isOpen, onOpen: originalOnOpen, onClose } = useDisclosure();
  const [innerInputValue, setInnerInputValue] = useState('');

  const onOpen = useCallback(() => {
    originalOnOpen();
    onOpenFunc?.();
  }, [originalOnOpen, onOpenFunc]);

  useCloseOnFlowNodeDragAreaPointerDown(outsideClickRef, onClose, isOpen && !isDisabled);

  const canSearch = isSearch || setInputValue !== undefined;
  const searchValue = inputValue ?? innerInputValue;
  const setSearchValue = setInputValue ?? setInnerInputValue;
  const shouldFilterLocal = filterLocal ?? setInputValue === undefined;
  const isMenuOpen = isOpen && !isDisabled;

  const [visibleItems, setVisibleItems] = useState<SelectedItemType<T>[]>([]);
  const [overflowItems, setOverflowItems] = useState<SelectedItemType<T>[]>([]);

  const formatValue = useMemoEnhance(() => {
    return Array.isArray(initialValue) ? initialValue : [];
  }, [initialValue]);

  const selectedItems = useMemo(() => {
    return resolveMultipleSelectItems({
      values: formatValue,
      list,
      invalidLabel: t('common:invalid_value')
    });
  }, [formatValue, list, t]);
  const uniqueListValues = useMemo(
    () => Array.from(new Set(list.map((item) => item.value))),
    [list]
  );
  const selectedTagSizeStyle = selectedTagSizeStyleMap[size];
  const tagWidth = tagStyle?.w;
  const canInferSelectAll =
    !ScrollData && (isSelectAll !== undefined || !!setIsSelectAll || showSelectAll);
  const isFullSelected = useMemo(() => {
    if (uniqueListValues.length === 0 || formatValue.length < uniqueListValues.length) return false;

    return uniqueListValues.every((value) => formatValue.includes(value));
  }, [formatValue, uniqueListValues]);
  const isAllSelected = !!isSelectAll || (canInferSelectAll && isFullSelected);
  const openedMenuButtonStyle: Pick<ButtonProps, 'bg' | 'borderColor' | 'boxShadow'> = isMenuOpen
    ? {
        boxShadow: shadowLight,
        borderColor: 'primary.600 !important',
        bg: 'white'
      }
    : {};

  useEffect(() => {
    if (!isMenuOpen) {
      setSearchValue('');
    }
  }, [isMenuOpen, setSearchValue]);

  const onclickItem = useCallback(
    (val: T) => {
      if (isAllSelected) {
        onSelect([val]);
        setIsSelectAll?.(false);
        return;
      }

      const nextValue = formatValue.includes(val)
        ? formatValue.filter((i) => i !== val)
        : [...formatValue, val];
      onSelect(nextValue);
      setIsSelectAll?.(
        !ScrollData &&
          uniqueListValues.length > 0 &&
          uniqueListValues.every((value) => nextValue.includes(value))
      );
    },
    [isAllSelected, formatValue, onSelect, setIsSelectAll, ScrollData, uniqueListValues]
  );

  const onSelectAll = useCallback(() => {
    onSelect(isAllSelected ? [] : uniqueListValues);

    setIsSelectAll?.(!isAllSelected);
  }, [isAllSelected, onSelect, uniqueListValues, setIsSelectAll]);

  // 动态长度计算器 - 计算一行能展示多少个tag，剩余用+n表示
  const calculateLayout = useCallback(() => {
    if (itemWrap) return;

    if (!tagsContainerRef.current || selectedItems.length === 0) {
      setVisibleItems(selectedItems);
      setOverflowItems([]);
      return;
    }

    const containerWidth = tagsContainerRef.current.offsetWidth;
    const tagGap = 4; // tag之间的gap
    const overflowIndicatorWidth = 30; // "+n" 宽度
    const formLabelWidth = formLabel ? formLabel.length * 8 + 20 : 0;

    // 实际可用宽度
    const availableWidth = containerWidth - formLabelWidth - 10;

    // 如果只有一个项目，直接显示
    if (selectedItems.length === 1) {
      setVisibleItems(selectedItems);
      setOverflowItems([]);
      return;
    }

    // 创建临时元素来测量每个tag的实际宽度
    const measureTagWidth = (item: any): number => {
      // 如果有tagStyle.w，优先使用
      if (tagWidth) {
        return typeof tagWidth === 'number' ? tagWidth : parseInt(String(tagWidth)) || 60;
      }

      // 否则根据文本长度估算（更精确）
      const text = String(item.label || item.value);
      const baseWidth = size === 'sm' ? 16 : size === 'md' ? 20 : 24; // 基础padding
      const charWidth = size === 'sm' ? 7.5 : 8; // 每个字符约8px
      const closeIconWidth = closeable || item.isInvalid ? 22 : 0; // 无效项始终提供删除入口

      return baseWidth + text.length * charWidth + closeIconWidth;
    };

    // 确保至少显示1个tag
    const firstTagWidth = measureTagWidth(selectedItems[0]);

    // 如果连第一个tag都放不下，也要强制显示
    if (availableWidth < firstTagWidth) {
      setVisibleItems([selectedItems[0]]);
      setOverflowItems(selectedItems.slice(1));
      return;
    }

    // 精确计算每个tag的宽度
    let usedWidth = 0;
    let visibleCount = 0;

    for (let i = 0; i < selectedItems.length; i++) {
      const currentTagWidth = measureTagWidth(selectedItems[i]);
      const currentGap = i > 0 ? tagGap : 0;
      const remainingItems = selectedItems.length - i - 1;
      const needsOverflow = remainingItems > 0;
      const overflowSpace = needsOverflow ? overflowIndicatorWidth + tagGap : 0;

      const totalNeeded = usedWidth + currentTagWidth + currentGap + overflowSpace;

      if (totalNeeded <= availableWidth) {
        usedWidth += currentTagWidth + currentGap;
        visibleCount = i + 1;
      } else {
        break;
      }
    }

    // 保证至少显示1个tag
    if (visibleCount === 0) {
      visibleCount = 1;
    }

    setVisibleItems(selectedItems.slice(0, visibleCount));
    setOverflowItems(selectedItems.slice(visibleCount));
  }, [closeable, formLabel, itemWrap, selectedItems, size, tagWidth]);

  // 动态监听容器宽度变化并重新计算
  useEffect(() => {
    if (itemWrap || selectedItems.length <= 1 || !tagsContainerRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        calculateLayout();
      });
    });

    resizeObserver.observe(tagsContainerRef.current);

    requestAnimationFrame(() => {
      calculateLayout();
    });

    return () => {
      resizeObserver.disconnect();
    };
  }, [calculateLayout, itemWrap, selectedItems.length]);

  useEffect(() => {
    if (itemWrap || selectedItems.length <= 1) return;

    requestAnimationFrame(() => {
      calculateLayout();
    });
  }, [calculateLayout, itemWrap, selectedItems.length]);

  const renderedVisibleItems =
    selectedItems.length <= 1
      ? selectedItems
      : visibleItems.length > 0
        ? visibleItems
        : selectedItems;

  const triggerProps: ButtonProps = {
    px: 3,
    alignItems: 'center',
    ...selectSizeStyleMap[size],
    border: '1px solid',
    borderColor: 'borderColor.low',
    userSelect: 'none',
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    _active: {
      transform: 'none'
    },
    _hover: {
      borderColor: isDisabled ? 'myGray.200' : 'primary.300'
    },
    opacity: isDisabled ? 0.6 : 1,
    ...props,
    minH: selectSizeStyleMap[size].h,
    h: itemWrap ? 'auto' : selectSizeStyleMap[size].h,
    ...openedMenuButtonStyle
  };

  const triggerContent = (
    <Flex alignItems={'center'} w={'100%'} minH={'100%'} py={1.5}>
      {formLabel && (
        <Flex alignItems={'center'}>
          <Box color={'myGray.600'} fontSize={formLabelFontSize} whiteSpace={'nowrap'}>
            {formLabel}
          </Box>
          <Box w={'1px'} h={'12px'} bg={'myGray.200'} mx={2} />
        </Flex>
      )}
      {formatValue.length === 0 && placeholder ? (
        <Box color={'myGray.500'} fontSize={formLabelFontSize} flex={1}>
          {placeholder}
        </Box>
      ) : (
        <Flex
          ref={tagsContainerRef}
          flex={'1 0 0'}
          gap={1}
          flexWrap={itemWrap ? 'wrap' : 'nowrap'}
          overflow={'hidden'}
          alignItems={'center'}
        >
          {isAllSelected ? (
            <Box fontSize={formLabelFontSize} color={'myGray.900'}>
              {t('common:All')}
            </Box>
          ) : (
            <>
              {(itemWrap ? selectedItems : renderedVisibleItems).map((item, i) => {
                const showCloseButton = closeable || item.isInvalid;

                return (
                  <MyTag
                    className="tag-icon"
                    key={i}
                    bg={'primary.100'}
                    color={'primary.700'}
                    type={'fill'}
                    borderRadius={'sm'}
                    {...selectedTagSizeStyle}
                    flexShrink={0}
                    {...selectedTagStyle}
                    pr={showCloseButton ? 1 : undefined}
                    {...tagStyle}
                    {...(item.isInvalid
                      ? {
                          bg: 'red.50',
                          borderColor: 'red.200',
                          color: 'red.600'
                        }
                      : {})}
                  >
                    {item.label}
                    {showCloseButton && (
                      <MyIconButton
                        icon={'common/closeLight'}
                        tip={t('common:Remove')}
                        ml={1}
                        p={1}
                        size={'0.8rem'}
                        position={'relative'}
                        zIndex={2}
                        pointerEvents={'auto'}
                        hoverColor={'red.500'}
                        hoverBg={'red.50'}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          onclickItem(item.value);
                        }}
                      />
                    )}
                  </MyTag>
                );
              })}
              {!itemWrap && selectedItems.length > 1 && overflowItems.length > 0 && (
                <Box
                  {...selectedTagSizeStyle}
                  display={'flex'}
                  alignItems={'center'}
                  flexShrink={0}
                  borderRadius={'lg'}
                  bg={'myGray.100'}
                >
                  +{overflowItems.length}
                </Box>
              )}
            </>
          )}
        </Flex>
      )}
      <MyIcon name={'core/chat/chevronDown'} color={'myGray.600'} w={4} h={4} />
    </Flex>
  );

  return (
    <Box ref={outsideClickRef} h={'100%'} w={'100%'}>
      <MultipleSelectMenu
        isOpen={isMenuOpen}
        isDisabled={isDisabled}
        triggerContent={triggerContent}
        triggerProps={triggerProps}
        list={list}
        formatValue={formatValue}
        isAllSelected={isAllSelected}
        onclickItem={onclickItem}
        onSelectAll={onSelectAll}
        setIsSelectAll={setIsSelectAll}
        showSelectAll={showSelectAll}
        ScrollData={ScrollData}
        canSearch={canSearch}
        searchValue={searchValue}
        setSearchValue={setSearchValue}
        searchPlaceholder={searchPlaceholder}
        shouldFilterLocal={shouldFilterLocal}
        virtualScroll={virtualScroll}
        virtualListHeight={virtualListHeight}
        emptyText={emptyText}
        menuBottomSlot={menuBottomSlot}
        isLoading={isLoading}
        onOpen={onOpen}
        onClose={onClose}
      />
    </Box>
  );
};

export default MultipleSelect;

export const useMultipleSelect = <T = any,>(defaultValue: T[] = [], defaultSelectAll = false) => {
  const [value, setValue] = useState<T[]>(defaultValue);
  const [isSelectAll, setIsSelectAll] = useState<boolean>(defaultSelectAll);
  return { value, setValue, isSelectAll, setIsSelectAll };
};
