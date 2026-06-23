import type { FlexProps, MenuItemProps } from '@chakra-ui/react';
import {
  Box,
  type ButtonProps,
  Checkbox,
  Flex,
  Input,
  Menu,
  MenuButton,
  MenuItem,
  useDisclosure
} from '@chakra-ui/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import MyTag from '../Tag/index';
import MyIcon from '../Icon';
import MyAvatar from '../Avatar';
import { useTranslation } from 'next-i18next';
import type { useScrollPagination } from '../../../hooks/useScrollPagination';
import MyDivider from '../MyDivider';
import { shadowLight } from '../../../styles/theme';
import { useMemoEnhance } from '../../../hooks/useMemoEnhance';
import MyLoading from '../MyLoading';
import SearchInput from '../Input/SearchInput';

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

  searchable?: boolean;
  searchPlaceholder?: string;
  onSearch?: (val: string) => void;

  onOpenFunc?: () => void;

  tagStyle?: FlexProps;
  menuBottomSlot?: React.ReactNode;
} & Omit<ButtonProps, 'onSelect'>;

type SelectedItemType<T> = {
  icon?: string;
  label: string | React.ReactNode;
  value: T;
};

const menuItemStyling: MenuItemProps = {
  borderRadius: 'sm',
  py: 2,
  px: 2,
  display: 'flex',
  alignItems: 'center',
  fontSize: 'sm',
  whiteSpace: 'pre-wrap',
  mb: 1
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

  searchable,
  searchPlaceholder,
  onSearch,

  onOpenFunc,

  tagStyle,
  menuBottomSlot,
  isLoading,
  onClick: _ignoredOnClick,
  ...props
}: SelectProps<T>) => {
  const SearchInputRef = useRef<HTMLInputElement>(null);
  const tagsContainerRef = useRef<HTMLDivElement>(null);
  const TriggerRef = useRef<HTMLDivElement>(null);
  const DropdownRef = useRef<HTMLDivElement>(null);

  const { t } = useTranslation();
  const { isOpen, onOpen: originalOnOpen, onClose } = useDisclosure();

  const onOpen = useCallback(() => {
    originalOnOpen();
    onOpenFunc?.();
  }, [originalOnOpen, onOpenFunc]);

  const canInput = setInputValue !== undefined;
  const isSearchable = searchable || canInput;

  // 内部搜索状态
  const [internalSearchKey, setInternalSearchKey] = useState('');
  const searchKey = searchable ? internalSearchKey : inputValue ?? '';
  const setSearchKey = searchable
    ? (val: string) => {
        setInternalSearchKey(val);
        onSearch?.(val);
      }
    : setInputValue;

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
      if (searchable) {
        setInternalSearchKey('');
      }
    }
  }, [isOpen, setInputValue, searchable]);

  // 从 React 节点中提取文本内容
  const extractTextFromNode = useCallback((node: React.ReactNode): string => {
    if (typeof node === 'string') return node;
    if (typeof node === 'number') return String(node);
    if (!node) return '';
    if (React.isValidElement(node)) {
      const props = node.props as { children?: React.ReactNode };
      if (props.children) {
        if (Array.isArray(props.children)) {
          return props.children.map(extractTextFromNode).join('');
        }
        return extractTextFromNode(props.children);
      }
    }
    if (Array.isArray(node)) {
      return node.map(extractTextFromNode).join('');
    }
    return '';
  }, []);

  const filteredList = useMemo(() => {
    if (!searchKey) return list;
    const lowerSearch = searchKey.toLowerCase();
    return list.filter((item) => {
      const labelText = extractTextFromNode(item.label);
      return labelText.toLowerCase().includes(lowerSearch);
    });
  }, [list, searchKey, extractTextFromNode]);

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

  // 动态长度计算器
  const calculateLayout = useCallback(() => {
    if (!tagsContainerRef.current || selectedItems.length === 0) {
      setVisibleItems(selectedItems);
      setOverflowItems([]);
      return;
    }

    const containerWidth = tagsContainerRef.current.offsetWidth;
    const tagGap = 4;
    const overflowIndicatorWidth = 30;
    const formLabelWidth = formLabel ? formLabel.length * 8 + 20 : 0;

    const availableWidth = containerWidth - formLabelWidth - 10;

    if (selectedItems.length === 1) {
      setVisibleItems(selectedItems);
      setOverflowItems([]);
      return;
    }

    const measureTagWidth = (item: any): number => {
      if (tagStyle?.w) {
        return typeof tagStyle.w === 'number' ? tagStyle.w : parseInt(String(tagStyle.w)) || 60;
      }
      const text = String(item.label || item.value);
      const baseWidth = 16;
      const charWidth = 8;
      const closeIconWidth = closeable ? 20 : 0;
      return baseWidth + text.length * charWidth + closeIconWidth;
    };

    const firstTagWidth = measureTagWidth(selectedItems[0]);

    if (availableWidth < firstTagWidth) {
      setVisibleItems([selectedItems[0]]);
      setOverflowItems(selectedItems.slice(1));
      return;
    }

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

    if (visibleCount === 0) {
      visibleCount = 1;
    }

    setVisibleItems(selectedItems.slice(0, visibleCount));
    setOverflowItems(selectedItems.slice(visibleCount));
  }, [closeable, formLabel, selectedItems, tagStyle?.w]);

  useEffect(() => {
    if (!tagsContainerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        requestAnimationFrame(() => {
          calculateLayout();
        });
      }
    });

    resizeObserver.observe(tagsContainerRef.current);

    requestAnimationFrame(() => {
      calculateLayout();
    });

    return () => {
      resizeObserver.disconnect();
    };
  }, [calculateLayout]);

  useEffect(() => {
    requestAnimationFrame(() => {
      calculateLayout();
    });
  }, [calculateLayout]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        TriggerRef.current &&
        !TriggerRef.current.contains(target) &&
        DropdownRef.current &&
        !DropdownRef.current.contains(target)
      ) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Calculate dropdown position
  const getDropdownPosition = (): {
    top?: number;
    bottom?: number;
    left: number;
    w: number;
  } => {
    if (typeof window === 'undefined') return { top: 0, left: 0, w: 0 };
    const rect = TriggerRef.current?.getBoundingClientRect();
    if (!rect) return { top: 0, left: 0, w: 0 };

    const viewportHeight = window.innerHeight;
    const estimatedDropdownH = 300;

    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;

    if (spaceBelow >= estimatedDropdownH || spaceBelow >= spaceAbove) {
      // Position below the trigger
      return {
        top: Math.max(0, rect.bottom + 4),
        left: rect.left,
        w: rect.width
      };
    } else {
      // Position above the trigger: use bottom so the dropdown's bottom edge is just above the trigger
      return {
        bottom: viewportHeight - rect.top + 4,
        left: rect.left,
        w: rect.width
      };
    }
  };

  const dropdownPos = isOpen ? getDropdownPosition() : null;

  const ListRender = useMemo(() => {
    return (
      <>
        {filteredList.map((item, i) => {
          const isSelected = isSelectAll || formatValue.includes(item.value);
          return (
            <MenuItem
              key={i}
              {...menuItemStyling}
              color={isSelected ? 'primary.600' : 'myGray.900'}
              gap={2}
              _hover={{ backgroundColor: 'myGray.100' }}
              closeOnSelect={false}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onclickItem(item.value);
              }}
            >
              <Checkbox isChecked={isSelected} pointerEvents="none" />
              {item.icon && <MyAvatar src={item.icon} w={'1rem'} borderRadius={'0'} />}
              <Box flex={'1 0 0'}>{item.label}</Box>
            </MenuItem>
          );
        })}
      </>
    );
  }, [filteredList, isSelectAll, formatValue, onclickItem]);

  return (
    <Box h={'100%'} w={'100%'}>
      <Menu
        autoSelect={false}
        isOpen={isOpen && !isDisabled}
        onOpen={isDisabled ? undefined : onOpen}
        onClose={onClose}
        closeOnBlur={false}
        closeOnSelect={false}
      >
        <MenuButton
          as={Flex}
          ref={TriggerRef}
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
                <Box color={'myWhite.1000'} fontSize={formLabelFontSize} whiteSpace={'nowrap'}>
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
            <MyIcon name={'core/chat/chevronDown'} color={'myWhite.1000'} w={4} h={4} />
          </Flex>
        </MenuButton>

      {isOpen &&
        !isDisabled &&
        dropdownPos &&
        createPortal(
          <Box
            ref={DropdownRef}
            className={props.className}
            position="fixed"
            zIndex={1500}
            top={dropdownPos.top !== undefined ? `${dropdownPos.top}px` : undefined}
            bottom={dropdownPos.bottom !== undefined ? `${dropdownPos.bottom}px` : undefined}
            left={`${dropdownPos.left}px`}
            width={`${dropdownPos.w}px`}
            px={'6px'}
            py={'6px'}
            border={'1px solid #fff'}
            boxShadow={
              '0px 4px 10px 0px rgba(19, 51, 107, 0.10), 0px 0px 1px 0px rgba(19, 51, 107, 0.10);'
            }
            maxH={'40vh'}
            overflowY={'auto'}
            bg={'white'}
            borderRadius={'md'}
            onMouseLeave={() => {
              if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
              }
            }}
          >
            {/* 搜索框 */}
            {searchable && (
              <Box px={'6px'} pt={'6px'} pb={'6px'}>
                <SearchInput
                  placeholder={searchPlaceholder || t('common:search')}
                  value={internalSearchKey}
                  onChange={(e) => setSearchKey?.(e.target.value)}
                />
              </Box>
            )}

            {setIsSelectAll && (
              <>
                <MenuItem
                  {...menuItemStyling}
                  color={isSelectAll ? 'primary.600' : 'myGray.900'}
                  gap={2}
                  _hover={{ backgroundColor: 'myGray.100' }}
                  closeOnSelect={false}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onSelectAll();
                  }}
                >
                  <Checkbox isChecked={isSelectAll} pointerEvents="none" />
                  <Box flex={'1 0 0'}>{t('common:All')}</Box>
                </MenuItem>

                <MyDivider my={1} />
              </>
            )}

            {ScrollData ? <ScrollData minH={20}>{ListRender}</ScrollData> : ListRender}

            {menuBottomSlot && (
              <>
                <MyDivider my={1} />
                <Box px={1} py={1}>
                  {menuBottomSlot}
                </Box>
              </>
            )}

            {isLoading && <MyLoading fixed={false} />}
          </Box>,
          document.body
        )}
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
