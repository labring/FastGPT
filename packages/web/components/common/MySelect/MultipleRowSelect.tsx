import React, { useRef, useCallback, useState, useMemo } from 'react';
import { Button, useDisclosure, Box, Flex, useOutsideClick, Checkbox } from '@chakra-ui/react';
import { ListItemType, MultipleArraySelectProps, MultipleSelectProps } from './type';
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
  popDirection = 'bottom',
  styles,
  changeOnEverySelect = false
}: MultipleSelectProps) => {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [cloneValue, setCloneValue] = useState(value);

  useOutsideClick({
    ref: ref,
    handler: onClose
  });

  const RenderList = useCallback(
    ({ index, list }: { index: number; list: MultipleSelectProps['list'] }) => {
      const selectedValue = cloneValue[index];
      const selectedIndex = list.findIndex((item) => item.value === selectedValue);
      const children = list[selectedIndex]?.children || [];
      const hasChildren = list.some((item) => item.children && item.children?.length > 0);

      return (
        <>
          <Box
            className="nowheel"
            flex={'1 0 auto'}
            // width={0}
            px={2}
            borderLeft={index !== 0 ? 'base' : 'none'}
            maxH={`${maxH}px`}
            overflowY={'auto'}
            whiteSpace={'nowrap'}
          >
            {list.map((item) => (
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
                      color: 'primary.600'
                    }
                  : {})}
              >
                {item.label}
              </Flex>
            ))}
            {list.length === 0 && (
              <EmptyTip
                text={emptyTip ?? t('common:common.MultipleRowSelect.No data')}
                pt={1}
                pb={3}
              />
            )}
          </Box>
          {children.length > 0 && <RenderList list={children} index={index + 1} />}
        </>
      );
    },
    [cloneValue]
  );

  const onOpenSelect = useCallback(() => {
    setCloneValue(value);
    onOpen();
  }, [value, onOpen]);

  return (
    <Box ref={ref} position={'relative'}>
      <Button
        justifyContent={'space-between'}
        width={'100%'}
        variant={'whitePrimaryOutline'}
        size={'lg'}
        fontSize={'sm'}
        px={3}
        outline={'none'}
        rightIcon={<MyIcon name={'core/chat/chevronDown'} w="1rem" color={'myGray.500'} />}
        _active={{
          transform: 'none'
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
        {...styles}
        onClick={() => (isOpen ? onClose() : onOpenSelect())}
      >
        <Box>{label ?? placeholder}</Box>
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
          zIndex={1}
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

export const MultipleRowArraySelect = ({
  placeholder,
  label,
  value = [],
  list,
  emptyTip,
  maxH = 300,
  onSelect,
  popDirection = 'bottom',
  styles
}: MultipleArraySelectProps) => {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();

  const [navigationPath, setNavigationPath] = useState<string[]>([]);

  const formatValue = useMemo(() => {
    return Array.isArray(value) ? value : [];
  }, [value]);

  // Close when clicking outside
  useOutsideClick({
    ref: ref,
    handler: onClose
  });

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
            onSelect(newValues.filter((v) => !(v[0] === parentValue && v[1] === item.value)));
          } else {
            onSelect([...newValues, newValue]);
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
              <EmptyTip
                text={emptyTip ?? t('common:common.MultipleRowSelect.No data')}
                pt={1}
                pb={3}
              />
            )}
          </Box>
          {children.length > 0 && <RenderList list={children} index={index + 1} />}
        </>
      );
    },
    [navigationPath, formatValue, onSelect]
  );

  const onOpenSelect = useCallback(() => {
    setNavigationPath([]);
    onOpen();
  }, []);

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
        {...styles}
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
          zIndex={1}
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
