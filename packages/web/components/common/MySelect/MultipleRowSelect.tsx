import React, { useRef, useCallback, useState, useMemo, useEffect } from 'react';
import {
  Button,
  useDisclosure,
  Box,
  Flex,
  useOutsideClick,
  Checkbox,
  css,
  Menu,
  MenuButton,
  MenuList
} from '@chakra-ui/react';
import { type ListItemType, type MultipleArraySelectProps, type MultipleSelectProps } from './type';
import EmptyTip from '../EmptyTip';
import { useTranslation } from 'next-i18next';
import MyIcon from '../../common/Icon';

export const MultipleRowSelect = ({
  placeholder,
  label,
  value = [],
  list,
  emptyTip,
  maxH = 300,
  onSelect,
  ButtonProps,
  changeOnEverySelect = false,
  rowMinWidth = 'auto'
}: MultipleSelectProps & {
  rowMinWidth?: string;
}) => {
  const { t } = useTranslation();
  const ButtonRef = useRef<HTMLButtonElement>(null);

  const { isOpen, onOpen, onClose } = useDisclosure();
  const [cloneValue, setCloneValue] = useState(value);

  const MenuRef = useRef<(HTMLDivElement | null)[]>([]);
  const SelectedItemRef = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (isOpen) {
      for (let i = 0; i < MenuRef.current.length; i++) {
        const menu = MenuRef.current[i];
        const selectedItem = SelectedItemRef.current[i];
        if (menu && selectedItem) {
          menu.scrollTop = selectedItem.offsetTop - menu.offsetTop - 100;
        }
      }
    }
  }, [isOpen]);

  const minWidth = `${MenuRef.current?.[0]?.offsetWidth || 0}px`;

  const RenderList = useCallback(
    ({ index, list }: { index: number; list: MultipleSelectProps['list'] }) => {
      const selectedValue = cloneValue[index];
      const selectedIndex = list.findIndex((item) => item.value === selectedValue);
      const children = list[selectedIndex]?.children || [];

      // Store current scroll position before update
      const currentScrollTop = MenuRef.current[index]?.scrollTop;
      // Use useEffect to restore scroll position after render
      useEffect(() => {
        if (currentScrollTop !== undefined && MenuRef.current[index]) {
          MenuRef.current[index]!.scrollTop = currentScrollTop;
        }
      }, [currentScrollTop, index]);

      return (
        <>
          <Box
            ref={(ref) => {
              MenuRef.current[index] = ref;
            }}
            className="nowheel"
            flex={'1 0 auto'}
            px={2}
            borderLeft={index !== 0 ? 'base' : 'none'}
            minW={index !== 0 ? minWidth : rowMinWidth}
            maxH={`${maxH}px`}
            overflowY={'auto'}
            whiteSpace={'nowrap'}
          >
            {list.map((item) => {
              const hasChildren = item.children && item.children.length > 0;

              return (
                <Flex
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
                  _hover={{
                    bg: 'primary.50'
                  }}
                  onClick={() => {
                    const newValue = [...cloneValue];

                    if (item.value === selectedValue) {
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

                      if (!hasChildren) {
                        onClose();
                      }
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
                </Flex>
              );
            })}
            {list.length === 0 && (
              <EmptyTip text={emptyTip ?? t('common:no_select_data')} pt={1} pb={3} />
            )}
          </Box>
          {children.length > 0 && <RenderList list={children} index={index + 1} />}
        </>
      );
    },
    [changeOnEverySelect, cloneValue, emptyTip, maxH, minWidth, onClose, onSelect, rowMinWidth, t]
  );

  const onOpenSelect = useCallback(() => {
    setCloneValue(Array.isArray(value) ? value : []);
    onOpen();
  }, [value, onOpen]);

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
        isOpen={isOpen}
        onOpen={onOpenSelect}
        onClose={onClose}
        strategy={'fixed'}
        matchWidth
      >
        <MenuButton
          as={Button}
          ref={ButtonRef}
          width={'100%'}
          px={3}
          variant={'whitePrimaryOutline'}
          size={'lg'}
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
          {...ButtonProps}
        >
          <Flex alignItems={'center'}>
            <Box flex="1" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
              {label ?? placeholder}
            </Box>
            <MyIcon name={'core/chat/chevronDown'} w={4} flexShrink={0} color={'myGray.500'} />
          </Flex>
        </MenuButton>
        <MenuList
          className={ButtonProps?.className}
          minW={(() => {
            const w = ButtonRef.current?.clientWidth;
            if (w) {
              return `${w}px !important`;
            }

            const width = ButtonProps?.width;
            return Array.isArray(width)
              ? width.map((item) => `${item} !important`)
              : `${width} !important`;
          })()}
          w={'auto'}
          py={'6px'}
          border={'1px solid #fff'}
          boxShadow={
            '0px 2px 4px rgba(161, 167, 179, 0.25), 0px 0px 1px rgba(121, 141, 159, 0.25);'
          }
          zIndex={99}
          maxH={'40vh'}
          overflowY={'auto'}
          display={'flex'}
          userSelect={'none'}
        >
          <RenderList list={list} index={0} />
        </MenuList>
      </Menu>
    </Box>
  );
};

export const MultipleRowArraySelect = ({
  placeholder,
  label,
  value = [],
  list,
  emptyTip,
  maxH = 300,
  onSelect,
  popDirection = 'bottom',
  ButtonProps
}: MultipleArraySelectProps) => {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();

  const [navigationPath, setNavigationPath] = useState<string[]>([]);

  // Make sure the value is an array of arrays
  const formatValue = useMemo(() => {
    return Array.isArray(value) ? value.filter((v) => Array.isArray(v)) : [];
  }, [value]);

  // Close when clicking outside
  useOutsideClick({
    ref: ref,
    handler: onClose
  });
  const onChange = useCallback(
    (val: any[][]) => {
      // Filter invalid value
      const validList = val.filter((item) => {
        const listItem = list.find((v) => v.value === item[0]);
        if (!listItem) return false;
        return listItem.children?.some((v) => v.value === item[1]);
      });
      onSelect(validList);
    },
    [list, onSelect]
  );

  const RenderList = useCallback(
    ({ index, list }: { index: number; list: MultipleSelectProps['list'] }) => {
      const currentNavValue = navigationPath[index];
      const selectedIndex = list.findIndex((item) => item.value === currentNavValue);
      const children = list[selectedIndex]?.children || [];
      const hasChildren = list.some((item) => item.children && item.children?.length > 0);

      const handleSelect = (item: ListItemType) => {
        // Has children, set parent value
        if (hasChildren) {
          const newPath = [...navigationPath];
          newPath[index] = item.value;
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
        <>
          <Box
            className="nowheel"
            flex={'1 0 auto'}
            px={2}
            borderLeft={index !== 0 ? 'base' : 'none'}
            maxH={`${maxH}px`}
            overflowY={'auto'}
            whiteSpace={'nowrap'}
          >
            {list.map((item) => {
              const isSelected = item.value === currentNavValue;
              const showCheckbox = !hasChildren;
              const isChecked =
                showCheckbox &&
                formatValue.some((v) => v[1] === item.value && v[0] === navigationPath[0]);

              return (
                <Flex
                  key={item.value}
                  py={2}
                  cursor={'pointer'}
                  px={2}
                  borderRadius={'md'}
                  _hover={{
                    bg: 'primary.50',
                    color: 'primary.600'
                  }}
                  onClick={() => handleSelect(item)}
                  {...(isSelected ? { color: 'primary.600' } : {})}
                >
                  {showCheckbox && <Checkbox isChecked={isChecked} mr={1} />}
                  <Box>{item.label}</Box>
                </Flex>
              );
            })}
            {list.length === 0 && (
              <EmptyTip text={emptyTip ?? t('common:no_select_data')} pt={1} pb={3} />
            )}
          </Box>
          {children.length > 0 && <RenderList list={children} index={index + 1} />}
        </>
      );
    },
    [navigationPath, maxH, emptyTip, t, formatValue, onChange]
  );

  const onOpenSelect = useCallback(() => {
    setNavigationPath([]);
    onOpen();
  }, [onOpen]);

  return (
    <Box ref={ref} position={'relative'}>
      <Button
        width={'100%'}
        variant={'whitePrimaryOutline'}
        size={'lg'}
        fontSize={'sm'}
        px={3}
        outline={'none'}
        rightIcon={<MyIcon name={'core/chat/chevronDown'} w="1rem" color={'myGray.500'} />}
        iconSpacing={2}
        h={'auto'}
        _active={{
          transform: 'none'
        }}
        _hover={{
          borderColor: 'primary.500'
        }}
        {...(isOpen
          ? {
              borderColor: 'primary.600',
              color: 'primary.700',
              boxShadow: '0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)'
            }
          : {
              borderColor: 'myGray.200',
              boxShadow: 'none'
            })}
        {...ButtonProps}
        onClick={() => (isOpen ? onClose() : onOpenSelect())}
        className="nowheel"
      >
        <Box w={'100%'} textAlign={'left'}>
          {label ?? placeholder}
        </Box>
      </Button>
      {isOpen && (
        <Box
          position={'absolute'}
          {...(popDirection === 'top'
            ? {
                transform: 'translateY(-105%)',
                top: '0'
              }
            : {
                transform: 'translateY(105%)',
                bottom: '0'
              })}
          py={2}
          bg={'white'}
          border={'1px solid #fff'}
          boxShadow={'5'}
          borderRadius={'md'}
          zIndex={1000}
          minW={'100%'}
          w={'max-content'}
        >
          <Flex>
            <RenderList list={list} index={0} />
          </Flex>
        </Box>
      )}
    </Box>
  );
};

export default React.memo(MultipleRowSelect);
