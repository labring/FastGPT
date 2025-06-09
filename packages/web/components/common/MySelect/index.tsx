import React, {
  useRef,
  forwardRef,
  useMemo,
  useEffect,
  useImperativeHandle,
  type ForwardedRef,
  useState
} from 'react';
import {
  Menu,
  MenuList,
  MenuItem,
  Button,
  useDisclosure,
  MenuButton,
  Box,
  Flex,
  Input
} from '@chakra-ui/react';
import type { ButtonProps, MenuItemProps } from '@chakra-ui/react';
import MyIcon from '../Icon';
import { useRequest2 } from '../../../hooks/useRequest';
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
  list: {
    alias?: string | React.ReactNode;
    icon?: string;
    iconSize?: string;
    label: string | React.ReactNode;
    description?: string;
    value: T;
    showBorder?: boolean;
  }[];
  isLoading?: boolean;
  onChange?: (val: T) => any | Promise<any>;
  ScrollData?: ReturnType<typeof useScrollPagination>['ScrollData'];
  customOnOpen?: () => void;
  customOnClose?: () => void;
};

export const menuItemStyles: MenuItemProps = {
  borderRadius: 'sm',
  py: 2,
  display: 'flex',
  alignItems: 'center',
  _hover: {
    backgroundColor: 'myGray.100'
  },
  _notLast: {
    mb: 1
  }
};

const MySelect = <T = any,>(
  {
    placeholder,
    value,
    valueLabel,
    isSearch = false,
    width = '100%',
    list = [],
    onChange,
    isLoading = false,
    ScrollData,
    customOnOpen,
    customOnClose,
    ...props
  }: SelectProps<T>,
  ref: ForwardedRef<{
    focus: () => void;
  }>
) => {
  const ButtonRef = useRef<HTMLButtonElement>(null);
  const MenuListRef = useRef<HTMLDivElement>(null);
  const SelectedItemRef = useRef<HTMLDivElement>(null);
  const SearchInputRef = useRef<HTMLInputElement>(null);

  const { isOpen, onOpen: defaultOnOpen, onClose: defaultOnClose } = useDisclosure();
  const selectItem = useMemo(() => list.find((item) => item.value === value), [list, value]);

  const onOpen = () => {
    defaultOnOpen();
    customOnOpen?.();
  };

  const onClose = () => {
    defaultOnClose();
    customOnClose?.();
  };

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

  // Auto scroll
  useEffect(() => {
    if (isOpen && MenuListRef.current && SelectedItemRef.current) {
      const menu = MenuListRef.current;
      const selectedItem = SelectedItemRef.current;
      menu.scrollTop = selectedItem.offsetTop - menu.offsetTop - 100;

      if (isSearch) {
        setSearch('');
      }
    }
  }, [isSearch, isOpen]);

  const { runAsync: onClickChange, loading } = useRequest2((val: T) => onChange?.(val));

  const ListRender = useMemo(() => {
    return (
      <>
        {filterList.length > 0 ? (
          filterList.map((item, i) => (
            <Box key={i}>
              <MenuItem
                {...menuItemStyles}
                {...(value === item.value
                  ? {
                      ref: SelectedItemRef,
                      color: 'primary.700',
                      bg: 'myGray.100'
                    }
                  : {
                      color: 'myGray.900'
                    })}
                onClick={() => {
                  if (value !== item.value) {
                    onClickChange(item.value);
                  }
                }}
                whiteSpace={'pre-wrap'}
                fontSize={'sm'}
                display={'block'}
                mb={0.5}
              >
                <Flex alignItems={'center'} fontWeight={value === item.value ? '600' : 'normal'}>
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
          <EmptyTip py={0} />
        )}
      </>
    );
  }, [filterList, onClickChange, value]);

  const isSelecting = loading || isLoading;

  return (
    <Box>
      <Menu
        autoSelect={false}
        isOpen={isOpen && !isSelecting}
        onOpen={onOpen}
        onClose={onClose}
        strategy={'fixed'}
        // matchWidth
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
          h={'auto'}
          whiteSpace={'pre-wrap'}
          wordBreak={'break-word'}
          _active={{
            transform: 'none'
          }}
          {...(isOpen
            ? {
                boxShadow: '0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)',
                borderColor: 'primary.600',
                color: 'primary.700'
              }
            : {})}
          {...props}
        >
          <Flex alignItems={'center'} justifyContent="space-between" w="100%">
            <Flex alignItems={'center'}>
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
                      {selectItem?.alias || selectItem?.label || placeholder}
                    </>
                  )}
                </>
              )}
            </Flex>
          </Flex>
        </MenuButton>

        <MenuList
          ref={MenuListRef}
          className={props.className}
          w={(() => {
            const w = ButtonRef.current?.clientWidth;
            if (w) {
              return `${w}px !important`;
            }
            return Array.isArray(width)
              ? width.map((item) => `${item} !important`)
              : `${width} !important`;
          })()}
          px={'6px'}
          py={'6px'}
          border={'1px solid #fff'}
          boxShadow={
            '0px 2px 4px rgba(161, 167, 179, 0.25), 0px 0px 1px rgba(121, 141, 159, 0.25);'
          }
          zIndex={99}
          maxH={'45vh'}
          overflowY={'auto'}
        >
          {ScrollData ? <ScrollData>{ListRender}</ScrollData> : ListRender}
        </MenuList>
      </Menu>
    </Box>
  );
};

export default forwardRef(MySelect) as <T>(
  props: SelectProps<T> & { ref?: React.Ref<HTMLSelectElement> }
) => JSX.Element;
