import React, {
  useRef,
  forwardRef,
  useMemo,
  useEffect,
  useImperativeHandle,
  ForwardedRef,
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
  css,
  Flex,
  Input
} from '@chakra-ui/react';
import type { ButtonProps, MenuItemProps } from '@chakra-ui/react';
import MyIcon from '../Icon';
import { useRequest2 } from '../../../hooks/useRequest';
import MyDivider from '../MyDivider';
import { useScrollPagination } from '../../../hooks/useScrollPagination';

/** 选择组件 Props 类型
 * value: 选中的值
 * placeholder: 占位符
 * list: 列表数据
 * isLoading: 是否加载中
 * ScrollData: 分页滚动数据控制器 [useScrollPagination] 的返回值
 * */
export type SelectProps<T = any> = ButtonProps & {
  value?: T;
  placeholder?: string;
  isSearch?: boolean;
  list: {
    alias?: string;
    icon?: string;
    label: string | React.ReactNode;
    description?: string;
    value: T;
    showBorder?: boolean;
  }[];
  isLoading?: boolean;
  onchange?: (val: T) => any | Promise<any>;
  ScrollData?: ReturnType<typeof useScrollPagination>['ScrollData'];
};

const MySelect = <T = any,>(
  {
    placeholder,
    value,
    isSearch = false,
    width = '100%',
    list = [],
    onchange,
    isLoading = false,
    ScrollData,
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

  const menuItemStyles: MenuItemProps = {
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
  const { isOpen, onOpen, onClose } = useDisclosure();
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

  const { runAsync: onChange, loading } = useRequest2((val: T) => onchange?.(val));

  const ListRender = useMemo(() => {
    return (
      <>
        {filterList.map((item, i) => (
          <Box key={i}>
            <MenuItem
              {...menuItemStyles}
              {...(value === item.value
                ? {
                    ref: SelectedItemRef,
                    color: 'primary.700',
                    bg: 'myGray.100',
                    fontWeight: '600'
                  }
                : {
                    color: 'myGray.900'
                  })}
              onClick={() => {
                if (onChange && value !== item.value) {
                  onChange(item.value);
                }
              }}
              whiteSpace={'pre-wrap'}
              fontSize={'sm'}
              display={'block'}
            >
              <Flex alignItems={'center'}>
                {item.icon && <MyIcon mr={2} name={item.icon as any} w={'1rem'} />}
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
        ))}
      </>
    );
  }, [filterList, value]);

  const isSelecting = loading || isLoading;

  return (
    <Box
      css={css({
        '& div': {
          width: 'auto !important'
        }
      })}
    >
      <Menu
        autoSelect={false}
        isOpen={isOpen && !isSelecting}
        onOpen={onOpen}
        onClose={onClose}
        strategy={'fixed'}
        matchWidth
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
          <Flex alignItems={'center'}>
            {isSelecting && <MyIcon mr={2} name={'common/loading'} w={'1rem'} />}
            {isSearch && isOpen ? (
              <Input
                ref={SearchInputRef}
                autoFocus
                variant={'unstyled'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  selectItem?.alias ||
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
                {selectItem?.icon && <MyIcon mr={2} name={selectItem.icon as any} w={'1rem'} />}
                {selectItem?.alias || selectItem?.label || placeholder}
              </>
            )}
          </Flex>
        </MenuButton>

        <MenuList
          ref={MenuListRef}
          className={props.className}
          minW={(() => {
            const w = ButtonRef.current?.clientWidth;
            if (w) {
              return `${w}px !important`;
            }
            return Array.isArray(width)
              ? width.map((item) => `${item} !important`)
              : `${width} !important`;
          })()}
          w={'auto'}
          px={'6px'}
          py={'6px'}
          border={'1px solid #fff'}
          boxShadow={
            '0px 2px 4px rgba(161, 167, 179, 0.25), 0px 0px 1px rgba(121, 141, 159, 0.25);'
          }
          zIndex={99}
          maxH={'40vh'}
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
