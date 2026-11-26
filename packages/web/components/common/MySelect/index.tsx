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
import { useCloseOnFlowNodeDragAreaPointerDown } from '../../../hooks/useCloseOnFlowNodeDragAreaPointerDown';
import MyDivider from '../MyDivider';
import type { useScrollPagination } from '../../../hooks/useScrollPagination';
import Avatar from '../Avatar';
import EmptyTip from '../EmptyTip';
import {
  filterSelectOptionsBySearch,
  useComposedSearchInput
} from '../TagFilter/FilterSearchInput';
import { useMenuListPresence } from './useMenuListPresence';
import { CanvasMenuList, useCanvasMenuModifiers } from './CanvasMenuList';

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
  onSearchChange?: (val: string) => void;
  list: {
    alias?: string | React.ReactNode;
    icon?: string;
    iconSize?: string;
    label: string | React.ReactNode;
    description?: string;
    value: T;
    showBorder?: boolean;
    searchText?: string;
  }[];
  isLoading?: boolean;
  /** 远程分页或搜索初始化加载态；与触发器切换态 isLoading 分离，不会关闭已展开菜单。 */
  isListLoading?: boolean;
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
  isSelecting: boolean;
  valueLabel?: string | React.ReactNode;
  selectItem?: SelectProps['list'][number];
  placeholder?: string;
};

const SelectButtonContent = React.memo(function SelectButtonContent({
  isSelecting,
  valueLabel,
  selectItem,
  placeholder
}: SelectButtonContentProps) {
  return (
    <Flex alignItems="center" w="100%" minW={0} overflow="hidden">
      {isSelecting && <MyIcon mr={2} name="common/loading" w="1rem" />}
      {valueLabel ? (
        <>{valueLabel}</>
      ) : (
        <>
          {selectItem?.icon && (
            <Avatar mr={2} src={selectItem.icon} w={selectItem.iconSize ?? '1rem'} flexShrink={0} />
          )}
          <Box
            flex="1 1 auto"
            minW={0}
            isTruncated
            wordBreak="normal"
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
    </Flex>
  );
});

type SelectButtonProps = Omit<ButtonProps, 'onChange' | 'value'> & {
  bg?: ButtonProps['bg'];
  width?: ButtonProps['width'];
  selectOpen: boolean;
  isInvalid?: boolean;
  triggerId?: string;
};

const SelectButton = React.memo(
  forwardRef<HTMLButtonElement, SelectButtonProps>(function SelectButton(
    {
      bg = '#fff',
      width = '100%',
      selectOpen,
      children,
      isInvalid,
      isDisabled,
      triggerId,
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
        id={triggerId ?? props.id}
      >
        {children}
      </Button>
    );
  })
);

type SelectMenuProps = SelectProps & {
  isOpen: boolean;
  selectItem?: SelectButtonContentProps['selectItem'];
  isSelecting: boolean;
  onClickChange: (value: any) => Promise<any>;
  onOpen: () => void;
  onClose: () => void;
};

/** 保留 Chakra 菜单触发器。列表只在展开和退出动画时挂载。 */
const SelectMenu = React.memo(function SelectMenu({
  isOpen,
  bg = '#fff',
  placeholder,
  value,
  valueLabel,
  isSearch = false,
  onSearchChange,
  isListLoading = false,
  width = '100%',
  list = [],
  isLoading: _isLoading = false,
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
  const MenuRef = useRef<HTMLDivElement>(null);
  const MenuListRef = useRef<HTMLDivElement>(null);
  const SelectedItemRef = useRef<HTMLDivElement>(null);
  const SearchInputRef = useRef<HTMLInputElement>(null);
  const closingRef = useRef(false);
  const blurCloseFrame = useRef<number>();
  const [menuWidth, setMenuWidth] = useState<number>();
  const { isMounted, mount, onAnimationComplete, modifiers } = useMenuListPresence(isOpen);
  const canvasModifiers = useCanvasMenuModifiers({ isOpen, triggerRef: ButtonRef, modifiers });
  const menuListAnimationProps = { onAnimationComplete } as {
    onAnimationComplete: () => void;
  };

  useEffect(() => {
    if (isOpen) closingRef.current = false;
    return () => {
      if (blurCloseFrame.current === undefined) return;
      cancelAnimationFrame(blurCloseFrame.current);
      blurCloseFrame.current = undefined;
    };
  }, [isOpen]);

  const [search, setSearch] = useState('');
  const { inputValue, isComposingRef, resetInput, updateInput, compositionProps } =
    useComposedSearchInput(search, (next) => {
      setSearch(next);
      onSearchChange?.(next);
    });

  const handleOpen = useCallback(() => {
    resetInput();
    closingRef.current = false;
    const width =
      ButtonRef.current?.offsetWidth ||
      ButtonRef.current?.clientWidth ||
      ButtonRef.current?.getBoundingClientRect().width;
    if (width) {
      setMenuWidth(width);
    }
    mount();
    onOpen();
  }, [mount, onOpen, resetInput]);

  const handleClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    resetInput();
    onClose();
  }, [onClose, resetInput]);

  const isComposingSearch = (e: React.KeyboardEvent<HTMLInputElement>) =>
    isComposingRef.current || e.nativeEvent.isComposing || e.keyCode === 229;

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const composing = isComposingSearch(e);
    if (!composing && e.key !== ' ' && e.code !== 'Space') return;

    e.stopPropagation();
    // 输入法候选框接管方向键、确认键和 Escape，菜单不应处理这些事件。
    if (composing) return;

    e.preventDefault();
    const input = e.currentTarget;
    const selectionStart = input.selectionStart ?? inputValue.length;
    const selectionEnd = input.selectionEnd ?? selectionStart;
    const nextSearch = `${inputValue.slice(0, selectionStart)} ${inputValue.slice(selectionEnd)}`;

    updateInput(nextSearch);
    window.requestAnimationFrame(() => {
      const nextPosition = selectionStart + 1;
      input.setSelectionRange(nextPosition, nextPosition);
    });
  };

  const handleSearchSpaceKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isSearch || (e.key !== ' ' && e.code !== 'Space')) return;

    e.stopPropagation();

    if (!isComposingSearch(e)) {
      e.preventDefault();
    }
  };

  const handleMenuBlur = useCallback<React.FocusEventHandler<HTMLDivElement>>(
    (e) => {
      if (!isSearch || !isOpen || blurCloseFrame.current !== undefined) return;
      if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;

      // 等浏览器提交 Tab 或点击后的焦点，Chakra 关闭菜单时才能识别外部焦点。
      blurCloseFrame.current = requestAnimationFrame(() => {
        blurCloseFrame.current = undefined;
        const menu = MenuListRef.current;
        if (menu && !menu.contains(menu.ownerDocument.activeElement)) handleClose();
      });
    },
    [handleClose, isOpen, isSearch]
  );

  useCloseOnFlowNodeDragAreaPointerDown(MenuRef, handleClose, isOpen);

  const filterList = useMemo(() => {
    // 传入 onSearchChange 时由远程分页/搜索接口作为唯一过滤源，避免前端二次过滤抢数据。
    if (!isSearch || !search || onSearchChange) {
      return list;
    }
    const searchableList = list.map((item) => ({
      ...item,
      searchText: [
        item.searchText,
        typeof item.label === 'string' ? item.label : '',
        typeof item.alias === 'string' ? item.alias : '',
        typeof item.value === 'string' || typeof item.value === 'number' ? item.value : ''
      ]
        .filter((value) => value !== undefined && value !== null && value !== '')
        .join(' ')
    }));
    return filterSelectOptionsBySearch(searchableList, search);
  }, [list, onSearchChange, search, isSearch]);

  useEffect(() => {
    if (isOpen && !ScrollData && MenuListRef.current && SelectedItemRef.current) {
      const menu = MenuListRef.current;
      const selectedItem = SelectedItemRef.current;
      menu.scrollTop = selectedItem.offsetTop - menu.offsetTop - 100;
    }

    if (!isOpen && isSearch) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSearch('');
    }
  }, [ScrollData, isOpen, isSearch]);

  const ListRender = useMemo(() => {
    if (!isMounted) return null;
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
        ) : isListLoading ? (
          <Flex justifyContent={'center'} py={2}>
            <MyIcon name={'common/loading'} w={'1rem'} />
          </Flex>
        ) : (
          <EmptyTip py={0} />
        )}
      </>
    );
  }, [filterList, isListLoading, isMounted, onClickChange, value]);

  const selectButtonProps = {
    ref: ButtonRef,
    // Chakra 生成触发器 ID 时仍保留调用方用于关联 label 的 ID。
    triggerId: props.id,
    bg,
    width,
    selectOpen: isOpen,
    isInvalid,
    isDisabled,
    ...props
  };

  const buttonContent = (
    <SelectButtonContent
      isSelecting={isSelecting}
      valueLabel={valueLabel}
      selectItem={selectItem}
      placeholder={placeholder}
    />
  );

  return (
    <Box ref={MenuRef}>
      <Menu
        autoSelect={false}
        isOpen={isOpen}
        initialFocusRef={isSearch ? SearchInputRef : undefined}
        onOpen={handleOpen}
        onClose={handleClose}
        strategy="fixed"
        placement={menuPlacement}
        modifiers={canvasModifiers}
        matchWidth
      >
        <MenuButton {...selectButtonProps} as={SelectButton}>
          {buttonContent}
        </MenuButton>

        {isMounted && (
          <CanvasMenuList
            ref={MenuListRef}
            className={props.className}
            w="100%"
            minW={menuWidth ? `${menuWidth}px` : undefined}
            px="6px"
            py="6px"
            border="1px solid #fff"
            boxShadow="0px 2px 4px rgba(161, 167, 179, 0.25), 0px 0px 1px rgba(121, 141, 159, 0.25);"
            zIndex={99}
            maxH="45vh"
            overflowX="hidden"
            display={ScrollData ? 'flex' : undefined}
            flexDirection={ScrollData ? 'column' : undefined}
            overflowY={ScrollData ? 'hidden' : 'auto'}
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
            onClick={(e) => {
              e.stopPropagation();
            }}
            onKeyDownCapture={(e) => {
              // Chakra 在冒泡阶段拦截 Tab；搜索菜单使用浏览器原生焦点顺序。
              if (isSearch && e.key === 'Tab') e.stopPropagation();
            }}
            onBlur={handleMenuBlur}
            onFocus={(e) => {
              const previous = e.relatedTarget;
              if (closingRef.current || blurCloseFrame.current !== undefined || !isOpen) {
                // Tab 可先离开搜索框，Chakra 的开菜单焦点帧随后才执行。
                if (previous instanceof HTMLElement && !e.currentTarget.contains(previous)) {
                  previous.focus({ preventScroll: true });
                }
                return;
              }
              if (e.target !== e.currentTarget) return;

              // 保留已在菜单内聚焦的控件，避免开菜单焦点帧打断键盘导航。
              if (previous instanceof HTMLElement && e.currentTarget.contains(previous)) {
                previous.focus({ preventScroll: true });
              } else if (isSearch) {
                SearchInputRef.current?.focus();
              }
            }}
          >
            {isSearch && (
              <Input
                ref={SearchInputRef}
                flexShrink={0}
                autoFocus
                variant="unstyled"
                value={inputValue}
                {...compositionProps}
                placeholder={
                  (typeof selectItem?.alias === 'string' ? selectItem.alias : '') ||
                  (typeof selectItem?.label === 'string' ? selectItem.label : placeholder)
                }
                _placeholder={{ color: 'myGray.500' }}
                size="sm"
                w="100%"
                color="myGray.700"
                onKeyDown={handleSearchKeyDown}
                onKeyUp={handleSearchSpaceKeyUp}
                onClick={(e) => e.stopPropagation()}
              />
            )}
            {ScrollData ? (
              <ScrollData
                flex={'1 1 auto'}
                minH={0}
                h={'auto'}
                overflowY={'auto'}
                overflowX={'hidden'}
              >
                {ListRender}
              </ScrollData>
            ) : (
              ListRender
            )}
          </CanvasMenuList>
        )}
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
    onSearchChange,
    isListLoading = false,
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

  const onOpen = useCallback(() => {
    defaultOnOpen();
    customOnOpen?.();
  }, [customOnOpen, defaultOnOpen]);

  const onClose = useCallback(() => {
    defaultOnClose();
    if (isSearch) onSearchChange?.('');
    customOnClose?.();
  }, [customOnClose, defaultOnClose, isSearch, onSearchChange]);

  useImperativeHandle(
    ref,
    () => ({
      focus() {
        onOpen();
      }
    }),
    [onOpen]
  );

  return (
    <Box>
      <SelectMenu
        isOpen={isOpen && !isSelecting}
        bg={bg}
        placeholder={placeholder}
        value={value}
        valueLabel={valueLabel}
        isSearch={isSearch}
        onSearchChange={onSearchChange}
        isListLoading={isListLoading}
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
    </Box>
  );
};

export default forwardRef(MySelect) as <T>(
  props: SelectProps<T> & { ref?: React.Ref<HTMLSelectElement> }
) => JSX.Element;
