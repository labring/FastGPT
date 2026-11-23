import React, { useRef, useCallback, useState, useMemo, useEffect } from 'react';
import {
  Button,
  useDisclosure,
  Box,
  Flex,
  MenuItem,
  MenuItemOption,
  css,
  Menu,
  MenuButton,
  type ButtonProps as ChakraButtonProps
} from '@chakra-ui/react';
import { type ListItemType, type MultipleArraySelectProps, type MultipleSelectProps } from './type';
import EmptyTip from '../EmptyTip';
import MyLoading from '../MyLoading';
import { useTranslation } from 'next-i18next';
import MyIcon from '../../common/Icon';
import FilterSearchInput, { filterSelectOptionsBySearch } from '../TagFilter/FilterSearchInput';
import { useMenuListPresence } from './useMenuListPresence';
import { CanvasMenuList, useCanvasMenuModifiers } from './CanvasMenuList';
import { useCloseOnFlowNodeDragAreaPointerDown } from '../../../hooks/useCloseOnFlowNodeDragAreaPointerDown';

type RenderListProps = {
  isOpen: boolean;
  index: number;
  list: MultipleSelectProps['list'];
  cloneValue: (string | undefined)[];
  setCloneValue: React.Dispatch<React.SetStateAction<(string | undefined)[]>>;
  onSelect: (val: (string | undefined)[]) => void;
  onClose: () => void;
  changeOnEverySelect: boolean;
  emptyTip?: string;
  maxH: number;
  rowMinWidth: string;
  MenuRef: React.MutableRefObject<(HTMLDivElement | null)[]>;
  SelectedItemRef: React.MutableRefObject<(HTMLButtonElement | null)[]>;
};

const RenderList = React.memo(function RenderList({
  isOpen,
  index,
  list,
  cloneValue,
  setCloneValue,
  onSelect,
  onClose,
  changeOnEverySelect,
  emptyTip,
  maxH,
  rowMinWidth,
  MenuRef,
  SelectedItemRef
}: RenderListProps) {
  const { t } = useTranslation();
  const safeCloneValue = Array.isArray(cloneValue) ? cloneValue : [];
  const selectedValue = safeCloneValue[index];
  const selectedIndex = list.findIndex((item) => item.value === selectedValue);
  const children = list[selectedIndex]?.children || [];

  const currentScrollTop = MenuRef.current[index]?.scrollTop;
  useEffect(() => {
    if (currentScrollTop !== undefined && MenuRef.current[index]) {
      MenuRef.current[index]!.scrollTop = currentScrollTop;
    }
  }, [currentScrollTop, index, MenuRef]);

  useEffect(() => {
    if (!isOpen || selectedIndex < 0) return;
    const menu = MenuRef.current[index];
    const selectedItem = SelectedItemRef.current[index];
    if (menu && selectedItem) {
      menu.scrollTop = selectedItem.offsetTop - menu.offsetTop - 100;
    }
  }, [isOpen, selectedValue, selectedIndex, index, MenuRef, SelectedItemRef]);

  return (
    <>
      <Box
        ref={(ref) => {
          MenuRef.current[index] = ref;
        }}
        className="nowheel"
        flex={'1 1 auto'}
        px={2}
        borderLeft={index !== 0 ? 'base' : 'none'}
        minW={index !== 0 ? '80px' : rowMinWidth === 'auto' ? 0 : rowMinWidth}
        maxH={`${maxH}px`}
        overflowY={'auto'}
        whiteSpace={'nowrap'}
      >
        {list.map((item) => {
          const hasChildren = item.children && item.children.length > 0;

          return (
            <MenuItem
              key={item.value}
              ref={(ref) => {
                if (item.value === selectedValue) {
                  SelectedItemRef.current[index] = ref;
                }
              }}
              py={1.5}
              _notLast={{ mb: 1 }}
              cursor={'pointer'}
              px={1.5}
              borderRadius={'sm'}
              _hover={{ bg: 'primary.50' }}
              _focusVisible={{ bg: 'primary.50' }}
              onClick={() => {
                if (item.value === selectedValue && !changeOnEverySelect) {
                  if (!hasChildren) onClose();
                  return;
                }

                const newValue = [...safeCloneValue];
                // 父级节点只负责展开列，不能被当成叶子清空；这样单选可重新进入当前来源。
                if (hasChildren) {
                  newValue[index] = item.value;
                  for (let i = index + 1; i < newValue.length; i++) {
                    newValue[i] = undefined;
                  }
                  setCloneValue(newValue);
                  if (changeOnEverySelect) onSelect(newValue);
                } else if (item.value === selectedValue) {
                  for (let i = index; i < newValue.length; i++) {
                    newValue[i] = undefined;
                  }
                  setCloneValue(newValue);
                  onSelect(newValue);
                } else {
                  newValue[index] = item.value;
                  setCloneValue(newValue);

                  if (changeOnEverySelect || !hasChildren) {
                    onSelect(newValue);
                  }

                  onClose();
                }
              }}
              {...(item.value === selectedValue
                ? {
                    bg: 'primary.50',
                    color: 'primary.600'
                  }
                : {})}
            >
              {item.label}
            </MenuItem>
          );
        })}
        {list.length === 0 && (
          <EmptyTip text={emptyTip ?? t('common:no_select_data')} pt={1} pb={3} />
        )}
      </Box>
      {children.length > 0 && (
        <RenderList
          isOpen={isOpen}
          list={children}
          index={index + 1}
          cloneValue={cloneValue}
          setCloneValue={setCloneValue}
          onSelect={onSelect}
          onClose={onClose}
          changeOnEverySelect={changeOnEverySelect}
          emptyTip={emptyTip}
          maxH={maxH}
          rowMinWidth={rowMinWidth}
          MenuRef={MenuRef}
          SelectedItemRef={SelectedItemRef}
        />
      )}
    </>
  );
});

type ArrayRenderListProps = {
  index: number;
  list: MultipleSelectProps['list'];
  navigationPath: string[];
  setNavigationPath: React.Dispatch<React.SetStateAction<string[]>>;
  formatValue: any[][];
  maxH: number;
  emptyTip?: string;
  onChange: (val: any[][]) => void;
};

const ArrayRenderList = React.memo(function ArrayRenderList({
  index,
  list,
  navigationPath,
  setNavigationPath,
  formatValue,
  maxH,
  emptyTip,
  onChange
}: ArrayRenderListProps) {
  const { t } = useTranslation();

  const renderList = (
    currentList: MultipleSelectProps['list'],
    currentIndex: number
  ): React.ReactNode => {
    const currentNavValue = navigationPath[currentIndex];
    const selectedIndex = currentList.findIndex((item) => item.value === currentNavValue);
    const children = currentList[selectedIndex]?.children || [];
    const hasChildren = currentList.some((item) => item.children && item.children.length > 0);

    const handleSelect = (item: ListItemType) => {
      // Has children, set parent value
      if (hasChildren) {
        const newPath = [...navigationPath];
        newPath[currentIndex] = item.value;
        setNavigationPath(newPath);
      } else {
        const parentValue = navigationPath[0];
        const newValues = [...formatValue];
        const newValue = [parentValue, item.value];

        if (newValues.some((v) => v[0] === parentValue && v[1] === item.value)) {
          onChange(newValues.filter((v) => !(v[0] === parentValue && v[1] === item.value)));
        } else {
          onChange([...newValues, newValue]);
        }
      }
    };

    return (
      <React.Fragment key={currentIndex}>
        <Box
          className="nowheel"
          flex={'1 0 auto'}
          px={2}
          borderLeft={currentIndex !== 0 ? 'base' : 'none'}
          maxH={`${maxH}px`}
          overflowY={'auto'}
          whiteSpace={'nowrap'}
        >
          {currentList.map((item) => {
            const isSelected = item.value === currentNavValue;
            const showCheckbox = !hasChildren;
            const isChecked =
              showCheckbox &&
              formatValue.some((v) => v[1] === item.value && v[0] === navigationPath[0]);

            const itemProps = {
              key: item.value,
              py: 2,
              px: 2,
              borderRadius: 'md',
              _hover: {
                bg: 'primary.50',
                color: 'primary.600'
              },
              onClick: () => handleSelect(item),
              onKeyDownCapture: (event: React.KeyboardEvent<HTMLButtonElement>) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;

                event.stopPropagation();
                event.preventDefault();
                handleSelect(item);
              },
              ...(isSelected ? { color: 'primary.600' } : {})
            };

            return showCheckbox ? (
              <MenuItemOption
                {...itemProps}
                type="checkbox"
                isChecked={isChecked}
                icon={
                  <Box
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    w="14px"
                    h="14px"
                    border="1px solid"
                    borderColor={isChecked ? 'primary.500' : 'myGray.300'}
                    borderRadius="xs"
                    bg={isChecked ? 'primary.50' : 'transparent'}
                  >
                    {isChecked && <MyIcon name="common/check" w="12px" />}
                  </Box>
                }
                iconSpacing="0.25rem"
              >
                {item.label}
              </MenuItemOption>
            ) : (
              <MenuItem {...itemProps} aria-expanded={isSelected}>
                {item.label}
              </MenuItem>
            );
          })}
          {currentList.length === 0 && (
            <EmptyTip text={emptyTip ?? t('common:no_select_data')} pt={1} pb={3} />
          )}
        </Box>
        {children.length > 0 && renderList(children, currentIndex + 1)}
      </React.Fragment>
    );
  };

  return renderList(list, index);
});

type MultipleRowSelectProps = MultipleSelectProps & {
  rowMinWidth?: string;
  isSearch?: boolean;
};

const MultipleRowSelect = React.memo(function MultipleRowSelect({
  placeholder,
  label,
  value = [],
  list,
  emptyTip,
  isLoading = false,
  maxH = 300,
  onSelect,
  ButtonProps,
  onOpenFunc,
  onCloseFunc,
  changeOnEverySelect = false,
  rowMinWidth = 'auto',
  isSearch = false
}: MultipleRowSelectProps) {
  const { t } = useTranslation();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const ButtonRef = useRef<HTMLButtonElement>(null);
  const OutsideClickRef = useRef<HTMLDivElement>(null);

  const { isOpen, onOpen, onClose } = useDisclosure({
    onClose: () => {
      setSearch('');
      onCloseFunc?.();
    }
  });
  const [cloneValue, setCloneValue] = useState<(string | undefined)[]>(() =>
    Array.isArray(value) ? value : []
  );

  const MenuRef = useRef<(HTMLDivElement | null)[]>([]);
  const SelectedItemRef = useRef<(HTMLButtonElement | null)[]>([]);
  const MenuListRef = useRef<HTMLDivElement>(null);
  const [menuWidth, setMenuWidth] = useState<number>();
  const [triggerWidth, setTriggerWidth] = useState(0);
  const visibleList = useMemo(() => {
    if (!search.trim()) return list;

    return list.flatMap((item) => {
      if (!item.children?.length) return filterSelectOptionsBySearch([item], search);
      const children = filterSelectOptionsBySearch(item.children, search);
      return children.length ? [{ ...item, children }] : [];
    });
  }, [list, search]);

  // 异步列表加载完成或从单列切换为分组时，使用外部 value 恢复完整路径；有效的手动路径保持不变。
  const safeValue = Array.isArray(value) ? value : [];
  const safeCloneValue = Array.isArray(cloneValue) ? cloneValue : [];
  const selectedFirstColumn = visibleList.find((item) => item.value === safeCloneValue[0]);
  const valueFirstColumn = visibleList.find((item) => item.value === safeValue[0]);
  // 列表原地刷新后旧路径可能失效；优先恢复外部值的完整路径，再回落到新列表首项。
  const resolvedCloneValue = (() => {
    if (!isOpen || selectedFirstColumn) return safeCloneValue;
    if (valueFirstColumn) return safeValue;
    if ((safeCloneValue[0] || search.trim()) && visibleList[0]) return [visibleList[0].value];
    return safeCloneValue;
  })();
  const { isMounted, mount, onAnimationComplete, modifiers } = useMenuListPresence(isOpen);
  const canvasModifiers = useCanvasMenuModifiers({ isOpen, triggerRef: ButtonRef, modifiers });

  const onOpenSelect = useCallback(() => {
    setCloneValue(Array.isArray(value) ? value : []);
    onOpen();
    onOpenFunc?.();
  }, [value, onOpen, onOpenFunc]);

  const handleOpen = useCallback(() => {
    setTriggerWidth(ButtonRef.current?.clientWidth ?? 0);
    setMenuWidth(undefined);
    mount();
    onOpenSelect();
  }, [mount, onOpenSelect]);

  const onCloseSelect = useCallback(() => {
    const width = MenuListRef.current?.scrollWidth;
    if (width) {
      setMenuWidth(width);
    }
    onClose();
  }, [onClose]);

  const menuListAnimationProps = { onAnimationComplete } as {
    onAnimationComplete: () => void;
  };

  const triggerProps: ChakraButtonProps = {
    width: '100%',
    px: 3,
    variant: 'whitePrimaryOutline',
    size: 'lg',
    fontSize: 'sm',
    textAlign: 'left',
    overflow: 'hidden',
    _active: {
      transform: 'none'
    },
    ...ButtonProps,
    ...(isOpen
      ? {
          boxShadow: '0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)',
          borderColor: 'primary.600',
          color: 'primary.700',
          bg: 'white !important'
        }
      : {})
  };

  const buttonContent = (
    <Flex alignItems={'center'} minW={0} w={'100%'} overflow={'hidden'} data-preserve-width>
      <Box
        data-preserve-width
        flex={'1 1 auto'}
        minW={0}
        overflow={'hidden'}
        textOverflow={'ellipsis'}
        whiteSpace={'nowrap'}
      >
        {label ?? placeholder}
      </Box>
      <MyIcon name={'core/chat/chevronDown'} w={4} flexShrink={0} color={'myGray.500'} />
    </Flex>
  );

  const menuOptions = (
    <RenderList
      isOpen={isOpen}
      list={visibleList}
      index={0}
      cloneValue={resolvedCloneValue}
      setCloneValue={setCloneValue}
      onSelect={onSelect}
      onClose={onCloseSelect}
      changeOnEverySelect={changeOnEverySelect}
      emptyTip={emptyTip}
      maxH={maxH}
      rowMinWidth={rowMinWidth}
      MenuRef={MenuRef}
      SelectedItemRef={SelectedItemRef}
    />
  );
  const menuList = isMounted ? (
    <CanvasMenuList
      ref={MenuListRef}
      className={ButtonProps?.className}
      w={'max-content'}
      maxW={'calc(100vw - 24px)'}
      py={'6px'}
      border={'1px solid #fff'}
      boxShadow={'0px 2px 4px rgba(161, 167, 179, 0.25), 0px 0px 1px rgba(121, 141, 159, 0.25);'}
      zIndex={99}
      maxH={'40vh'}
      overflowX={'hidden'}
      overflowY={'auto'}
      display={'flex'}
      flexDirection={isSearch ? 'column' : undefined}
      userSelect={'none'}
      minW={`min(${menuWidth ?? triggerWidth}px, calc(100vw - 24px))`}
      rootProps={
        {
          'data-preserve-width': true,
          style: {
            width: menuWidth ? `${menuWidth}px` : 'max-content',
            visibility: 'visible',
            pointerEvents: isOpen ? undefined : 'none'
          }
        } as any
      }
      motionProps={{ initial: 'exit' }}
      {...menuListAnimationProps}
    >
      {isSearch && (
        <Box mx={2} mb={1} flexShrink={0}>
          <FilterSearchInput
            ref={searchInputRef}
            value={search}
            placeholder={t('common:Search')}
            onChange={setSearch}
          />
        </Box>
      )}
      {isLoading ? (
        <Box
          data-preserve-width
          role="status"
          position="relative"
          minH="96px"
          minW={rowMinWidth}
          flex={1}
        >
          <MyLoading fixed={false} size="md" bg="transparent" />
        </Box>
      ) : isSearch ? (
        <Flex minW={0}>{menuOptions}</Flex>
      ) : (
        menuOptions
      )}
    </CanvasMenuList>
  ) : null;
  useCloseOnFlowNodeDragAreaPointerDown(OutsideClickRef, onClose, isOpen);

  return (
    // 保留标签自身的截断宽度，避免长名称撑大控件和后续音色列。
    <Box
      ref={OutsideClickRef}
      minW={0}
      maxW={'100%'}
      css={css({
        '& div:not([data-preserve-width])': {
          width: 'auto !important'
        }
      })}
    >
      <Menu
        autoSelect={isSearch}
        initialFocusRef={isSearch ? searchInputRef : undefined}
        isOpen={isOpen}
        onOpen={handleOpen}
        onClose={onCloseSelect}
        strategy={'fixed'}
        modifiers={canvasModifiers}
        closeOnSelect={false}
      >
        <MenuButton as={Button} ref={ButtonRef} {...triggerProps}>
          {buttonContent}
        </MenuButton>
        {menuList}
      </Menu>
    </Box>
  );
});

const MultipleRowArraySelect = React.memo(function MultipleRowArraySelect({
  placeholder,
  label,
  value = [],
  list,
  emptyTip,
  maxH = 300,
  onSelect,
  popDirection = 'bottom',
  ButtonProps,
  onOpenFunc,
  labelActions
}: MultipleArraySelectProps) {
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const modifiers = useCanvasMenuModifiers({ isOpen, triggerRef: buttonRef });
  const [triggerWidth, setTriggerWidth] = useState(0);
  const isTriggerDisabled = Boolean(
    ButtonProps?.isDisabled || (ButtonProps && 'disabled' in ButtonProps && ButtonProps.disabled)
  );

  const [navigationPath, setNavigationPath] = useState<string[]>([]);

  const formatValue = useMemo(() => {
    return Array.isArray(value) ? value.filter((v) => Array.isArray(v)) : [];
  }, [value]);

  const onOpenSelect = useCallback(() => {
    setTriggerWidth(buttonRef.current?.clientWidth ?? 0);
    setNavigationPath([]);
    onOpen();
    onOpenFunc?.();
  }, [onOpen, onOpenFunc]);

  useCloseOnFlowNodeDragAreaPointerDown(ref, onClose, isOpen);

  return (
    <Box
      ref={ref}
      position="relative"
      _hover={{ '.array-select-label-action': { opacity: 1, pointerEvents: 'auto' } }}
      _focusWithin={{ '.array-select-label-action': { opacity: 1, pointerEvents: 'auto' } }}
    >
      <Menu
        autoSelect={false}
        isOpen={isOpen}
        onOpen={onOpenSelect}
        onClose={onClose}
        strategy="fixed"
        modifiers={modifiers}
        placement={popDirection === 'top' ? 'top-start' : 'bottom-start'}
        closeOnSelect={false}
      >
        <MenuButton
          as={Button}
          ref={buttonRef}
          width="100%"
          aria-expanded={isOpen}
          variant="whitePrimaryOutline"
          size="lg"
          fontSize="sm"
          px={3}
          outline="none"
          rightIcon={<MyIcon name="core/chat/chevronDown" w="1rem" color="myGray.500" />}
          iconSpacing={2}
          h="auto"
          _active={{ transform: 'none' }}
          _hover={{ borderColor: 'primary.500' }}
          {...ButtonProps}
          {...(isOpen
            ? {
                borderColor: 'primary.600',
                color: 'primary.700',
                boxShadow: '0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)',
                bg: 'white !important'
              }
            : {
                borderColor: 'myGray.200',
                boxShadow: 'none'
              })}
          className={[ButtonProps?.className, 'nowheel'].filter(Boolean).join(' ')}
        >
          <Box w="100%" textAlign="left">
            {label ?? placeholder}
          </Box>
        </MenuButton>
        <CanvasMenuList
          py={2}
          bg="white"
          border="1px solid #fff"
          boxShadow="5"
          borderRadius="md"
          zIndex={1000}
          minW={`min(${triggerWidth}px, calc(100vw - 24px))`}
          w="max-content"
          maxW="calc(100vw - 24px)"
          overflowX="auto"
        >
          <Flex>
            <ArrayRenderList
              list={list}
              index={0}
              navigationPath={navigationPath}
              setNavigationPath={setNavigationPath}
              formatValue={formatValue}
              maxH={maxH}
              emptyTip={emptyTip}
              onChange={onSelect}
            />
          </Flex>
        </CanvasMenuList>
      </Menu>
      {labelActions && !isTriggerDisabled && (
        <Box position="absolute" inset={0} zIndex={1} pointerEvents="none">
          {labelActions}
        </Box>
      )}
    </Box>
  );
});

export { MultipleRowSelect, MultipleRowArraySelect };

export default MultipleRowSelect;
