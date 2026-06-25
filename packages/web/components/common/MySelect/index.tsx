import React, {
  useRef,
  forwardRef,
  useMemo,
  useEffect,
  useImperativeHandle,
  type ForwardedRef,
  useState,
  useCallback
} from 'react';
import { createPortal } from 'react-dom';
import {
  Menu,
  MenuButton,
  MenuItem,
  Button,
  useDisclosure,
  Box,
  Flex,
  Input
} from '@chakra-ui/react';
import type { ButtonProps, MenuItemProps } from '@chakra-ui/react';
import MyIcon from '../Icon';
import { useRequest } from '../../../hooks/useRequest';
import MyDivider from '../MyDivider';
import type { useScrollPagination } from '../../../hooks/useScrollPagination';
import Avatar from '../Avatar';
import EmptyTip from '../EmptyTip';

/** 选择组件 Props 类型
 * value: 选中的值
 * placeholder: 占位符
 * list: 列表数据
 * isLoading: 是否加载中
 * ScrollData: 分页滚动数据控制器 [useScrollPagination] 的返回值
 * customOnOpen: 自定义打开回调
 * customOnClose: 自定义关闭回调
 * */
export type SelectProps<T = any> = Omit<ButtonProps, 'onChange'> & {
  value?: T;
  valueLabel?: string | React.ReactNode;
  placeholder?: string;
  isSearch?: boolean;
  formLabel?: string;
  list: {
    alias?: string | React.ReactNode;
    icon?: string;
    iconSize?: string;
    label: string | React.ReactNode;
    description?: string;
    value: T;
    showBorder?: boolean;
    isDisabled?: boolean;
  }[];
  isLoading?: boolean;
  onChange?: (val: T) => any | Promise<any>;
  ScrollData?: ReturnType<typeof useScrollPagination>['ScrollData'];
  customOnOpen?: () => void;
  customOnClose?: () => void;
  footer?: (closeMenu: () => void) => React.ReactNode;

  isInvalid?: boolean;
  isDisabled?: boolean;
  clearable?: boolean;
};

const menuItemStyling: MenuItemProps = {
  borderRadius: 'sm',
  py: 2,
  px: 2,
  display: 'flex',
  alignItems: 'center',
  fontSize: 'sm',
  whiteSpace: 'pre-wrap',
  mb: 0.5
};

const MySelect = <T = any,>(
  {
    bg = '#fff',
    placeholder,
    value,
    valueLabel,
    isSearch = false,
    formLabel,
    width = '100%',
    list = [],
    onChange,
    isLoading = false,
    ScrollData,
    customOnOpen,
    customOnClose,
    footer,
    isInvalid,
    isDisabled,
    clearable,
    h,
    minH,
    ...props
  }: SelectProps<T>,
  ref: ForwardedRef<{
    focus: () => void;
  }>
) => {
  const ButtonRef = useRef<HTMLButtonElement>(null);
  const DropdownRef = useRef<HTMLDivElement>(null);
  const SelectedItemRef = useRef<HTMLDivElement>(null);
  const SearchInputRef = useRef<HTMLInputElement>(null);

  const { isOpen: rawIsOpen, onOpen: rawOnOpen, onClose: rawOnClose } = useDisclosure();

  const onOpen = useCallback(() => {
    rawOnOpen();
    customOnOpen?.();
  }, [rawOnOpen, customOnOpen]);

  const onClose = useCallback(() => {
    rawOnClose();
    customOnClose?.();
  }, [rawOnClose, customOnClose]);

  const selectItem = useMemo(() => list.find((item) => item.value === value), [list, value]);

  const [search, setSearch] = useState('');
  const filterList = useMemo(() => {
    if (!isSearch || !search) {
      return list;
    }
    return list.filter((item) => {
      const text = `${item.label?.toString()}${item.alias}${item.value}`;
      const regx = new RegExp(search, 'gi');
      return regx.test(text);
    });
  }, [list, search, isSearch]);

  useImperativeHandle(ref, () => ({
    focus() {
      onOpen();
    }
  }));

  const { runAsync: onClickChange, loading } = useRequest((val: T) => onChange?.(val));

  const isSelecting = loading || isLoading;
  const isOpen = rawIsOpen && !isSelecting;

  // Auto scroll to selected item when dropdown opens
  useEffect(() => {
    if (isOpen && DropdownRef.current && SelectedItemRef.current) {
      const menu = DropdownRef.current;
      const selectedItem = SelectedItemRef.current;
      menu.scrollTop = selectedItem.offsetTop - menu.offsetTop - 100;

      if (isSearch) {
        setSearch('');
      }
    }
  }, [isSearch, isOpen]);

  // Close on outside click (mousedown for Chrome 109 compat, matching DateTimePicker pattern)
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        ButtonRef.current &&
        !ButtonRef.current.contains(target) &&
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
        ButtonRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const ListRender = useMemo(() => {
    return (
      <>
        {filterList.length > 0 ? (
          filterList.map((item, i) => (
            <Box key={i}>
              <MenuItem
                ref={value === item.value ? (SelectedItemRef as any) : undefined}
                {...menuItemStyling}
                color={item.isDisabled ? 'myGray.400' : value === item.value ? 'primary.700' : 'myGray.900'}
                bg={value === item.value ? 'myGray.100' : undefined}
                opacity={item.isDisabled ? 0.6 : 1}
                cursor={item.isDisabled ? 'not-allowed' : 'pointer'}
                _hover={
                  item.isDisabled
                    ? undefined
                    : { backgroundColor: 'myGray.100' }
                }
                closeOnSelect={false}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!item.isDisabled && value !== item.value) {
                    onClickChange(item.value);
                    onClose();
                  }
                }}
              >
                <Flex alignItems={'center'} minW={0} overflow={'hidden'}>
                  {item.icon && (
                    <Avatar mr={2} src={item.icon as any} w={item.iconSize ?? '1rem'} />
                  )}
                  {item.label}
                </Flex>
                {item.description && (
                  <Box color={'myGray.500'} fontSize={'xs'}>
                    {item.description}
                  </Box>
                )}
              </MenuItem>
              {item.showBorder && <MyDivider my={2} />}
            </Box>
          ))
        ) : (
          <EmptyTip py={0} mb={5} />
        )}
      </>
    );
  }, [filterList, onClickChange, value, onClose]);

  const isShowClearable = clearable && value !== undefined && value !== '';

  // Calculate dropdown position relative to viewport
  const getDropdownPosition = (): {
    top?: number;
    bottom?: number;
    left: number;
    w: number;
  } => {
    if (typeof window === 'undefined') return { top: 0, left: 0, w: 0 };
    const rect = ButtonRef.current?.getBoundingClientRect();
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

  return (
    <Box position="relative">
      <Menu
        autoSelect={false}
        isOpen={isOpen}
        onOpen={onOpen}
        onClose={onClose}
        closeOnBlur={false}
      >
        <MenuButton
          as={Button}
          ref={ButtonRef}
          width={width}
          px={3}
          rightIcon={<MyIcon name={'core/chat/chevronDown'} w={4} color={'myGray.500'} />}
          variant={'whitePrimaryOutline'}
          size={'md'}
          fontSize={'sm'}
          textAlign={'left'}
          h={h}
          minH={minH ?? h}
          whiteSpace={'pre-wrap'}
          wordBreak={'break-word'}
          transition={'border-color 0.1s ease-in-out, box-shadow 0.1s ease-in-out'}
          isDisabled={isDisabled}
          _active={{
            transform: 'none'
          }}
          bg={bg ? (isOpen ? '#fff' : bg) : '#fff'}
          color={isOpen ? 'primary.700' : 'myGray.700'}
          borderColor={isInvalid ? 'red.500' : isOpen ? 'primary.300' : 'myGray.200'}
          boxShadow={
            isOpen
              ? isInvalid
                ? '0px 0px 0px 2.4px rgba(255, 0, 0, 0.15)'
                : '0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)'
              : 'none'
          }
          _hover={isInvalid ? { borderColor: 'red.400' } : { borderColor: 'primary.300' }}
          {...props}
        >
          <Flex alignItems={'center'} justifyContent="space-between" w="100%">
            {formLabel && (
              <>
                <Box fontSize={'sm'} color={'myGray.600'} whiteSpace={'nowrap'} flexShrink={0}>
                  {formLabel}
                </Box>
                <Box w={'1px'} h={'12px'} bg={'myGray.200'} mx={2} flexShrink={0} />
              </>
            )}
            <Flex alignItems={'center'} flex="1" minW={0} overflow={'hidden'}>
              {isSelecting && <MyIcon mr={2} name={'common/loading'} w={'1rem'} />}
              {valueLabel ? (
                <>{valueLabel}</>
              ) : (
                <>
                  {isSearch && isOpen ? (
                    <Input
                      ref={SearchInputRef}
                      autoFocus
                      variant={'unstyled'}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={
                        (typeof selectItem?.alias === 'string' ? selectItem?.alias : '') ||
                        (typeof selectItem?.label === 'string' ? selectItem?.label : placeholder)
                      }
                      size={'sm'}
                      w={'100%'}
                      color={'myGray.700'}
                      onBlur={() => {
                        setTimeout(() => {
                          SearchInputRef?.current?.focus();
                        }, 0);
                      }}
                    />
                  ) : (
                    <>
                      {selectItem?.icon && (
                        <Avatar
                          mr={2}
                          src={selectItem.icon as any}
                          w={selectItem.iconSize ?? '1rem'}
                        />
                      )}
                      {
                        <Box noOfLines={1}>
                          {selectItem?.alias || selectItem?.label || placeholder}
                        </Box>
                      }
                    </>
                  )}
                </>
              )}
            </Flex>
            {isShowClearable && (
              <Box
                flexShrink={0}
                ml={1}
                cursor={'pointer'}
                role={'button'}
                aria-label={'clear selection'}
                pointerEvents={'auto'}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  (onChange as any)?.(undefined);
                }}
              >
                <MyIcon name={'close'} w={4} color={'myGray.400'} />
              </Box>
            )}
          </Flex>
        </MenuButton>

      {isOpen &&
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
              '0px 2px 4px rgba(161, 167, 179, 0.25), 0px 0px 1px rgba(121, 141, 159, 0.25);'
            }
            maxH={'45vh'}
            overflowY={'auto'}
            bg={'white'}
            borderRadius={'md'}
            onClick={(e) => {
              e.stopPropagation();
            }}
            onMouseLeave={() => {
              if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
              }
            }}
          >
            {ScrollData ? <ScrollData>{ListRender}</ScrollData> : ListRender}
            {footer && footer(onClose)}
          </Box>,
          document.body
        )}
      </Menu>
    </Box>
  );
};

export default forwardRef(MySelect) as <T>(
  props: SelectProps<T> & { ref?: React.Ref<HTMLSelectElement> }
) => JSX.Element;
