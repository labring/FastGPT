import type { FlexProps } from '@chakra-ui/react';
import {
  Box,
  type ButtonProps,
  Checkbox,
  Flex,
  Input,
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
import { isArray } from 'lodash';
import { useMemoEnhance } from '../../../hooks/useMemoEnhance';

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

export type SelectProps<T = any> = {
  list: {
    icon?: string;
    label: string | React.ReactNode;
    value: T;
  }[];
  value: T[];
  isSelectAll?: boolean;
  setIsSelectAll?: React.Dispatch<React.SetStateAction<boolean>>;

  placeholder?: string;
  itemWrap?: boolean;
  onSelect: (val: T[]) => void;
  closeable?: boolean;
  isDisabled?: boolean;
  ScrollData?: ReturnType<typeof useScrollPagination>['ScrollData'];

  formLabel?: string;
  formLabelFontSize?: string;

  inputValue?: string;
  setInputValue?: (val: string) => void;

  tagStyle?: FlexProps;
} & Omit<ButtonProps, 'onSelect'>;

type SelectedItemType<T> = {
  icon?: string;
  label: string | React.ReactNode;
  value: T;
};

const MultipleSelect = <T = any,>({
  value: initialValue = [],
  placeholder,
  list = [],
  onSelect,
  closeable = false,
  itemWrap = true,
  ScrollData,
  isSelectAll,
  setIsSelectAll,
  isDisabled = false,

  formLabel,
  formLabelFontSize = 'sm',

  inputValue,
  setInputValue,

  tagStyle,
  ...props
}: SelectProps<T>) => {
  const SearchInputRef = useRef<HTMLInputElement>(null);
  const tagsContainerRef = useRef<HTMLDivElement>(null);

  const { t } = useTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const canInput = setInputValue !== undefined;

  const [visibleItems, setVisibleItems] = useState<SelectedItemType<T>[]>([]);
  const [overflowItems, setOverflowItems] = useState<SelectedItemType<T>[]>([]);

  const formatValue = useMemoEnhance(() => {
    return Array.isArray(initialValue) ? initialValue : [];
  }, [initialValue]);

  const selectedItems = useMemo(() => {
    return formatValue.map((val) => {
      const listItem = list.find((item) => item.value === val);
      return listItem || { value: val, label: String(val) };
    });
  }, [formatValue, list]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Backspace' && (!inputValue || inputValue === '')) {
        const newValue = [...formatValue];
        newValue.pop();
        onSelect(newValue);
      }
    },
    [inputValue, formatValue, onSelect]
  );
  useEffect(() => {
    if (!isOpen) {
      setInputValue?.('');
    }
  }, [isOpen]);

  const onclickItem = useCallback(
    (val: T) => {
      if (isSelectAll) {
        onSelect(list.map((item) => item.value).filter((i) => i !== val));
        setIsSelectAll?.(false);
        return;
      }

      if (formatValue.includes(val)) {
        onSelect(formatValue.filter((i) => i !== val));
      } else {
        onSelect([...formatValue, val]);
      }
    },
    [isSelectAll, formatValue, onSelect, list, setIsSelectAll]
  );

  const onSelectAll = useCallback(() => {
    onSelect(isSelectAll ? [] : list.map((item) => item.value));

    setIsSelectAll?.((state) => !state);
  }, [isSelectAll, onSelect, list, setIsSelectAll]);

  // 动态长度计算器 - 计算一行能展示多少个tag，剩余用+n表示
  const calculateLayout = useCallback(() => {
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
      if (tagStyle?.w) {
        return typeof tagStyle.w === 'number' ? tagStyle.w : parseInt(String(tagStyle.w)) || 60;
      }

      // 否则根据文本长度估算（更精确）
      const text = String(item.label || item.value);
      const baseWidth = 16; // 基础padding
      const charWidth = 8; // 每个字符约8px
      const closeIconWidth = closeable ? 20 : 0; // 关闭按钮宽度

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
  }, [closeable, formLabel, selectedItems, tagStyle?.w]);

  // 动态监听容器宽度变化并重新计算布局
  useEffect(() => {
    if (!tagsContainerRef.current) return;

    // 创建 ResizeObserver 监听容器宽度变化
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // 当容器宽度发生变化时，触发重新计算
        requestAnimationFrame(() => {
          calculateLayout();
        });
      }
    });

    // 开始监听容器
    resizeObserver.observe(tagsContainerRef.current);

    // 初始计算
    requestAnimationFrame(() => {
      calculateLayout();
    });

    // 清理监听器
    return () => {
      resizeObserver.disconnect();
    };
  }, [calculateLayout]);

  // 当选中项目、样式等发生变化时重新计算
  useEffect(() => {
    requestAnimationFrame(() => {
      calculateLayout();
    });
  }, [calculateLayout]);

  const ListRender = useMemo(() => {
    return (
      <>
        {list.map((item, i) => {
          const isSelected = isSelectAll || formatValue.includes(item.value);
          return (
            <MenuItem
              key={i}
              {...(isSelected
                ? {
                    color: 'primary.600'
                  }
                : {
                    color: 'myGray.900'
                  })}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onclickItem(item.value);
              }}
              whiteSpace={'pre-wrap'}
              fontSize={'sm'}
              gap={2}
              {...menuItemStyles}
            >
              <Checkbox isChecked={isSelected} />
              {item.icon && <MyAvatar src={item.icon} w={'1rem'} borderRadius={'0'} />}
              <Box flex={'1 0 0'}>{item.label}</Box>
            </MenuItem>
          );
        })}
      </>
    );
  }, [list, isSelectAll, formatValue, onclickItem]);

  return (
    <Box h={'100%'} w={'100%'}>
      <Menu
        autoSelect={false}
        isOpen={isOpen && !isDisabled}
        onOpen={isDisabled ? undefined : onOpen}
        onClose={onClose}
        strategy={'fixed'}
        matchWidth
        closeOnSelect={false}
      >
        <MenuButton
          as={Flex}
          px={3}
          alignItems={'center'}
          borderRadius={'md'}
          border={'sm'}
          userSelect={'none'}
          cursor={isDisabled ? 'not-allowed' : 'pointer'}
          _active={{
            transform: 'none'
          }}
          _hover={{
            borderColor: isDisabled ? 'myGray.200' : 'primary.300'
          }}
          opacity={isDisabled ? 0.6 : 1}
          {...props}
          {...(isOpen && !isDisabled
            ? {
                boxShadow: shadowLight,
                borderColor: 'primary.600 !important',
                bg: 'white'
              }
            : {})}
        >
          <Flex alignItems={'center'} w={'100%'} h={'100%'} py={1.5}>
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
                flexWrap={'nowrap'}
                overflow={'hidden'}
                alignItems={'center'}
              >
                {(!isOpen || !canInput) &&
                  (isSelectAll ? (
                    <Box fontSize={formLabelFontSize} color={'myGray.900'}>
                      {t('common:All')}
                    </Box>
                  ) : (
                    <>
                      {visibleItems.map((item, i) => (
                        <MyTag
                          className="tag-icon"
                          key={i}
                          bg={'primary.100'}
                          color={'primary.700'}
                          type={'fill'}
                          borderRadius={'lg'}
                          px={2}
                          py={0.5}
                          flexShrink={0}
                          {...tagStyle}
                        >
                          {item.label}
                          {closeable && (
                            <MyIcon
                              name={'common/closeLight'}
                              ml={1}
                              w="0.8rem"
                              cursor={'pointer'}
                              _hover={{
                                color: 'red.500'
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                onclickItem(item.value);
                              }}
                            />
                          )}
                        </MyTag>
                      ))}
                      {overflowItems.length > 0 && (
                        <Box
                          fontSize={formLabelFontSize}
                          px={2}
                          py={0.5}
                          flexShrink={0}
                          borderRadius={'lg'}
                          bg={'myGray.100'}
                        >
                          +{overflowItems.length}
                        </Box>
                      )}
                    </>
                  ))}
                {canInput && isOpen && (
                  <Input
                    value={inputValue}
                    onChange={(e) => setInputValue?.(e.target.value)}
                    onKeyDown={handleKeyDown}
                    ref={SearchInputRef}
                    autoFocus
                    onBlur={() => {
                      setTimeout(() => {
                        SearchInputRef?.current?.focus();
                      }, 0);
                    }}
                    h={6}
                    variant={'unstyled'}
                    border={'none'}
                  />
                )}
              </Flex>
            )}
            <MyIcon name={'core/chat/chevronDown'} color={'myGray.600'} w={4} h={4} />
          </Flex>
        </MenuButton>

        <MenuList
          className={props.className}
          px={'6px'}
          py={'6px'}
          border={'1px solid #fff'}
          boxShadow={
            '0px 4px 10px 0px rgba(19, 51, 107, 0.10), 0px 0px 1px 0px rgba(19, 51, 107, 0.10);'
          }
          zIndex={99}
          maxH={'40vh'}
          overflowY={'auto'}
        >
          {setIsSelectAll && (
            <>
              <MenuItem
                color={isSelectAll ? 'primary.600' : 'myGray.900'}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onSelectAll();
                }}
                whiteSpace={'pre-wrap'}
                fontSize={'sm'}
                gap={2}
                mb={1}
                {...menuItemStyles}
              >
                <Checkbox isChecked={isSelectAll} />
                <Box flex={'1 0 0'}>{t('common:All')}</Box>
              </MenuItem>

              <MyDivider my={1} />
            </>
          )}

          {ScrollData ? <ScrollData minH={20}>{ListRender}</ScrollData> : ListRender}
        </MenuList>
      </Menu>
    </Box>
  );
};

export default MultipleSelect;

export const useMultipleSelect = <T = any,>(defaultValue: T[] = [], defaultSelectAll = false) => {
  const [value, setValue] = useState<T[]>(defaultValue);
  const [isSelectAll, setIsSelectAll] = useState<boolean>(defaultSelectAll);
  return { value, setValue, isSelectAll, setIsSelectAll };
};
