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
import type { ButtonProps, MenuItemProps, MenuProps } from '@chakra-ui/react';
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
export type SelectProps<T = any> = Omit<ButtonProps, 'onChange' | 'value'> & {
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
  menuPlacement?: MenuProps['placement'];

  isInvalid?: boolean;
  isDisabled?: boolean;
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

type SelectButtonContentProps = {
  isOpen: boolean;
  isSelecting: boolean;
  valueLabel?: string | React.ReactNode;
  selectItem?: SelectProps['list'][number];
  placeholder?: string;
  isSearch?: boolean;
  search?: string;
  searchInputRef?: React.Ref<HTMLInputElement>;
  onSearchChange?: React.ChangeEventHandler<HTMLInputElement>;
  onSearchKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  onSearchKeyUp?: React.KeyboardEventHandler<HTMLInputElement>;
  onSearchBlur?: React.FocusEventHandler<HTMLInputElement>;
};

const SelectButtonContent = React.memo(function SelectButtonContent({
  isOpen,
  isSelecting,
  valueLabel,
  selectItem,
  placeholder,
  isSearch = false,
  search = '',
  searchInputRef,
  onSearchChange,
  onSearchKeyDown,
  onSearchKeyUp,
  onSearchBlur
}: SelectButtonContentProps) {
  return (
    <Flex alignItems="center" justifyContent="space-between" w="100%" minW={0}>
      <Flex alignItems="center" flex="1 1 0" minW={0} overflow="hidden">
        {isSelecting && <MyIcon mr={2} name="common/loading" w="1rem" />}
        {valueLabel ? (
          <>{valueLabel}</>
        ) : (
          <>
            {isSearch && isOpen ? (
              <Input
                ref={searchInputRef}
                autoFocus
                variant="unstyled"
                value={search}
                onChange={onSearchChange}
                placeholder={
                  (typeof selectItem?.alias === 'string' ? selectItem.alias : '') ||
                  (typeof selectItem?.label === 'string' ? selectItem.label : placeholder)
                }
                _placeholder={{
                  color: 'myGray.500'
                }}
                size="sm"
                w="100%"
                color="myGray.700"
                onKeyDown={onSearchKeyDown}
                onKeyUp={onSearchKeyUp}
                onBlur={onSearchBlur}
              />
            ) : (
              <>
                {selectItem?.icon && (
                  <Avatar mr={2} src={selectItem.icon as any} w={selectItem.iconSize ?? '1rem'} />
                )}
                <Box
                  noOfLines={1}
                  {...(!selectItem
                    ? {
                        color: 'myGray.500'
                      }
                    : {})}
                >
                  {selectItem?.alias || selectItem?.label || placeholder}
                </Box>
              </>
            )}
          </>
        )}
      </Flex>
    </Flex>
  );
});

type SelectButtonProps = Omit<ButtonProps, 'onChange' | 'value'> & {
  bg?: ButtonProps['bg'];
  width?: ButtonProps['width'];
  selectOpen: boolean;
  isSelecting: boolean;
  isInvalid?: boolean;
  valueLabel?: string | React.ReactNode;
  selectItem?: SelectButtonContentProps['selectItem'];
  placeholder?: string;
  isSearch?: boolean;
  search?: string;
  searchInputRef?: React.Ref<HTMLInputElement>;
  onSearchChange?: React.ChangeEventHandler<HTMLInputElement>;
  onSearchKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  onSearchKeyUp?: React.KeyboardEventHandler<HTMLInputElement>;
  onSearchBlur?: React.FocusEventHandler<HTMLInputElement>;
};

const SelectButton = React.memo(
  forwardRef<HTMLButtonElement, SelectButtonProps>(function SelectButton(
    {
      bg = '#fff',
      width = '100%',
      selectOpen,
      isSelecting,
      valueLabel,
      selectItem,
      placeholder,
      isSearch,
      search,
      searchInputRef,
      onSearchChange,
      onSearchKeyDown,
      onSearchKeyUp,
      onSearchBlur,
      children,
      isInvalid,
      isDisabled,
      ...props
    },
    ref
  ) {
    return (
      <Button
        ref={ref}
        width={width}
        px={3}
        rightIcon={<MyIcon name="core/chat/chevronDown" w={4} color="myGray.500" />}
        variant="whitePrimaryOutline"
        size="md"
        fontSize="sm"
        textAlign="left"
        h="auto"
        whiteSpace="pre-wrap"
        wordBreak="break-word"
        transition="border-color 0.1s ease-in-out, box-shadow 0.1s ease-in-out"
        isDisabled={isDisabled}
        _active={{
          transform: 'none'
        }}
        bg={isDisabled ? 'myWhite.300' : bg ? (selectOpen ? '#fff' : bg) : '#fff'}
        color={isDisabled ? 'myGray.400' : selectOpen ? 'primary.700' : 'myGray.700'}
        fontWeight="normal"
        borderColor={isInvalid ? 'red.500' : selectOpen ? 'primary.300' : 'myGray.200'}
        boxShadow={
          selectOpen
            ? isInvalid
              ? '0px 0px 0px 2.4px rgba(255, 0, 0, 0.15)'
              : '0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)'
            : 'none'
        }
        opacity={isDisabled ? 0.4 : 1}
        _hover={isInvalid ? { borderColor: 'red.400' } : { borderColor: 'primary.300' }}
        {...props}
      >
        {children ?? (
          <SelectButtonContent
            isOpen={selectOpen}
            isSelecting={isSelecting}
            valueLabel={valueLabel}
            selectItem={selectItem}
            placeholder={placeholder}
            isSearch={isSearch}
            search={search}
            searchInputRef={searchInputRef}
            onSearchChange={onSearchChange}
            onSearchKeyDown={onSearchKeyDown}
            onSearchKeyUp={onSearchKeyUp}
            onSearchBlur={onSearchBlur}
          />
        )}
      </Button>
    );
  })
);

type SelectMenuProps = SelectProps & {
  selectItem?: SelectButtonContentProps['selectItem'];
  isSelecting: boolean;
  onClickChange: (value: any) => Promise<any>;
  onOpen: () => void;
  onClose: () => void;
};

/** 打开态菜单子树；关闭时整个组件卸载，使列表、监听器和 Popper 生命周期一致。 */
const SelectMenu = React.memo(function SelectMenu({
  bg = '#fff',
  placeholder,
  value,
  valueLabel,
  isSearch = false,
  width = '100%',
  list = [],
  isLoading = false,
  ScrollData,
  menuPlacement,
  isInvalid,
  isDisabled,
  selectItem,
  isSelecting,
  onClickChange,
  onOpen,
  onClose,
  ...props
}: SelectMenuProps) {
  const ButtonRef = useRef<HTMLButtonElement>(null);
  const MenuListRef = useRef<HTMLDivElement>(null);
  const SelectedItemRef = useRef<HTMLDivElement>(null);
  const SearchInputRef = useRef<HTMLInputElement>(null);
  const ignoreNextSearchSpaceClickRef = useRef(false);

  const [search, setSearch] = useState('');
  const isComposingSearch = (e: React.KeyboardEvent<HTMLInputElement>) =>
    e.nativeEvent.isComposing || e.keyCode === 229;

  const handleSearchSpaceKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isSearch || (e.key !== ' ' && e.code !== 'Space')) return;

    e.stopPropagation();
    ignoreNextSearchSpaceClickRef.current = true;

    if (isComposingSearch(e)) {
      return;
    }

    e.preventDefault();
    const input = e.currentTarget;
    const selectionStart = input.selectionStart ?? search.length;
    const selectionEnd = input.selectionEnd ?? selectionStart;
    const nextSearch = `${search.slice(0, selectionStart)} ${search.slice(selectionEnd)}`;

    setSearch(nextSearch);
    window.requestAnimationFrame(() => {
      const nextPosition = selectionStart + 1;
      input.setSelectionRange(nextPosition, nextPosition);
      ignoreNextSearchSpaceClickRef.current = false;
    });
  };

  const handleSearchSpaceKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isSearch || (e.key !== ' ' && e.code !== 'Space')) return;

    e.stopPropagation();
    ignoreNextSearchSpaceClickRef.current = true;

    if (!isComposingSearch(e)) {
      e.preventDefault();
    }

    window.setTimeout(() => {
      ignoreNextSearchSpaceClickRef.current = false;
    }, 0);
  };

  const handleSearchChange = useCallback<React.ChangeEventHandler<HTMLInputElement>>(
    (e) => setSearch(e.target.value),
    []
  );

  const handleSearchBlur = useCallback<React.FocusEventHandler<HTMLInputElement>>(() => {
    setTimeout(() => {
      SearchInputRef.current?.focus();
    }, 0);
  }, []);

  const handleMenuButtonClickCapture = (e: React.MouseEvent<HTMLButtonElement>) => {
    props.onClickCapture?.(e);
    if (e.isPropagationStopped() || !ignoreNextSearchSpaceClickRef.current) return;

    ignoreNextSearchSpaceClickRef.current = false;
    e.preventDefault();
    e.stopPropagation();
  };

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

  useEffect(() => {
    if (MenuListRef.current && SelectedItemRef.current) {
      const menu = MenuListRef.current;
      const selectedItem = SelectedItemRef.current;
      menu.scrollTop = selectedItem.offsetTop - menu.offsetTop - 100;
    }

    if (isSearch) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSearch('');
    }
  }, [isSearch]);

  useEffect(() => {
    if (!isSearch) {
      ButtonRef.current?.focus();
    }
  }, [isSearch]);

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
                onClick={(e) => {
                  e.stopPropagation();
                  if (value !== item.value) {
                    onClickChange(item.value);
                  }
                }}
                whiteSpace="pre-wrap"
                fontSize="sm"
                display="block"
                mb={0.5}
              >
                <Flex alignItems="center">
                  {item.icon && (
                    <Avatar mr={2} src={item.icon as any} w={item.iconSize ?? '1rem'} />
                  )}
                  {item.label}
                </Flex>
                {item.description && (
                  <Box color="myGray.500" fontSize="xs">
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

  return (
    <Box>
      <Menu
        autoSelect={false}
        isOpen={!isSelecting}
        onOpen={onOpen}
        onClose={onClose}
        strategy="fixed"
        placement={menuPlacement}
      >
        <MenuButton
          as={SelectButton}
          ref={ButtonRef}
          bg={bg}
          width={width}
          selectOpen
          isSelecting={isLoading}
          valueLabel={valueLabel}
          selectItem={selectItem}
          placeholder={placeholder}
          isSearch={isSearch}
          search={search}
          searchInputRef={SearchInputRef}
          onSearchChange={handleSearchChange}
          onSearchKeyDown={handleSearchSpaceKeyDown}
          onSearchKeyUp={handleSearchSpaceKeyUp}
          onSearchBlur={handleSearchBlur}
          isInvalid={isInvalid}
          isDisabled={isDisabled}
          {...props}
          onClickCapture={handleMenuButtonClickCapture}
        >
          <SelectButtonContent
            isOpen
            isSelecting={isLoading}
            valueLabel={valueLabel}
            selectItem={selectItem}
            placeholder={placeholder}
            isSearch={isSearch}
            search={search}
            searchInputRef={SearchInputRef}
            onSearchChange={handleSearchChange}
            onSearchKeyDown={handleSearchSpaceKeyDown}
            onSearchKeyUp={handleSearchSpaceKeyUp}
            onSearchBlur={handleSearchBlur}
          />
        </MenuButton>

        <MenuList
          ref={MenuListRef}
          className={props.className}
          minW={(() => {
            /* eslint-disable react-hooks/refs */
            const w = ButtonRef.current?.clientWidth;
            if (w) {
              return `${w}px !important`;
            }
            /* eslint-enable react-hooks/refs */
            return Array.isArray(width)
              ? width.map((item) => `${item} !important`)
              : `${width} !important`;
          })()}
          w="max-content"
          px="6px"
          py="6px"
          border="1px solid #fff"
          boxShadow="0px 2px 4px rgba(161, 167, 179, 0.25), 0px 0px 1px rgba(121, 141, 159, 0.25);"
          zIndex={99}
          maxH="45vh"
          overflowY="auto"
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          {ScrollData ? <ScrollData>{ListRender}</ScrollData> : ListRender}
        </MenuList>
      </Menu>
    </Box>
  );
});

const MySelect = <T = any,>(
  {
    bg = '#fff',
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
    menuPlacement,
    isInvalid,
    isDisabled,
    ...props
  }: SelectProps<T>,
  ref: ForwardedRef<{
    focus: () => void;
  }>
) => {
  const { isOpen, onOpen: defaultOnOpen, onClose: defaultOnClose } = useDisclosure();
  const selectItem = useMemo(() => list.find((item) => item.value === value), [list, value]);
  const { runAsync: onClickChange, loading } = useRequest((val: T) => onChange?.(val));
  const isSelecting = loading || isLoading;

  const StaticButtonRef = useRef<HTMLButtonElement>(null);

  const onOpen = useCallback(() => {
    defaultOnOpen();
    customOnOpen?.();
  }, [customOnOpen, defaultOnOpen]);

  const onClose = useCallback(() => {
    defaultOnClose();
    customOnClose?.();
    window.requestAnimationFrame(() => {
      StaticButtonRef.current?.focus();
    });
  }, [customOnClose, defaultOnClose]);

  useImperativeHandle(
    ref,
    () => ({
      focus() {
        onOpen();
      }
    }),
    [onOpen]
  );

  const customOnClick = props.onClick;

  const handleStaticButtonClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      customOnClick?.(e);
      if (!e.isPropagationStopped()) {
        onOpen();
      }
    },
    [customOnClick, onOpen]
  );

  return (
    <Box>
      {/* 关闭态保持纯按钮，避免构造菜单项和挂载 Popper。 */}
      {isOpen && !isSelecting ? (
        <SelectMenu
          bg={bg}
          placeholder={placeholder}
          value={value}
          valueLabel={valueLabel}
          isSearch={isSearch}
          width={width}
          list={list}
          isLoading={isLoading}
          ScrollData={ScrollData}
          menuPlacement={menuPlacement}
          isInvalid={isInvalid}
          isDisabled={isDisabled}
          selectItem={selectItem}
          isSelecting={isSelecting}
          onClickChange={onClickChange}
          onOpen={onOpen}
          onClose={onClose}
          {...props}
        />
      ) : (
        <SelectButton
          ref={StaticButtonRef}
          bg={bg}
          width={width}
          selectOpen={isOpen && !isSelecting}
          isSelecting={isSelecting}
          valueLabel={valueLabel}
          selectItem={selectItem}
          placeholder={placeholder}
          isSearch={false}
          isInvalid={isInvalid}
          isDisabled={isDisabled}
          {...props}
          onClick={handleStaticButtonClick}
        />
      )}
    </Box>
  );
};

export default forwardRef(MySelect) as <T>(
  props: SelectProps<T> & { ref?: React.Ref<HTMLSelectElement> }
) => JSX.Element;
