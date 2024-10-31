import React, { useRef, useCallback, useState } from 'react';
import { Button, useDisclosure, Box, Flex, useOutsideClick, Checkbox } from '@chakra-ui/react';
import { MultipleSelectProps } from './type';
import EmptyTip from '../EmptyTip';
import { useTranslation } from 'next-i18next';
import MyIcon from '../../common/Icon';
import { ChevronDownIcon } from '@chakra-ui/icons';

const MultipleRowSelect = ({
  placeholder,
  label,
  value = [],
  list,
  emptyTip,
  maxH = 300,
  onSelect,
  popDirection = 'bottom',
  styles,
  isArray = false
}: MultipleSelectProps) => {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();

  const [navigationPath, setNavigationPath] = useState<string[]>([]);

  useOutsideClick({
    ref: ref,
    handler: onClose
  });

  const RenderList = useCallback(
    ({ index, list }: { index: number; list: MultipleSelectProps['list'] }) => {
      const currentNav = navigationPath[index];
      const selectedIndex = list.findIndex((item) => item.value === currentNav);
      const children = list[selectedIndex]?.children || [];
      const hasChildren = list.some((item) => item.children && item.children?.length > 0);

      const handleSelect = (item: any) => {
        if (hasChildren) {
          // Update parent menu path
          const newPath = [...navigationPath];
          newPath[index] = item.value;
          // Clear sub paths
          newPath.splice(index + 1);
          setNavigationPath(newPath);
        } else {
          if (!isArray) {
            onSelect([navigationPath[0], item.value]);
            onClose();
          } else {
            const parentValue = navigationPath[0];
            const newValues = [...value];
            const newValue = [parentValue, item.value];

            if (newValues.some((v) => v[0] === parentValue && v[1] === item.value)) {
              onSelect(newValues.filter((v) => !(v[0] === parentValue && v[1] === item.value)));
            } else {
              onSelect([...newValues, newValue]);
            }
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
              const isSelected = item.value === currentNav;
              const showCheckbox = isArray && index !== 0;
              const isChecked =
                showCheckbox &&
                value.some((v) => v[1] === item.value && v[0] === navigationPath[0]);

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
                  {showCheckbox && (
                    <Checkbox
                      isChecked={isChecked}
                      icon={<MyIcon name={'common/check'} w={'12px'} />}
                      mr={1}
                    />
                  )}
                  {item.label}
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
    [navigationPath, value, isArray, onSelect]
  );

  const onOpenSelect = useCallback(() => {
    setNavigationPath(isArray ? [] : [value[0]?.[0], value[0]?.[1]]);
    onOpen();
  }, [value, isArray, onOpen]);

  return (
    <Box ref={ref} position={'relative'}>
      <Flex
        justifyContent={'space-between'}
        alignItems={'center'}
        overflow={'auto'}
        width={'100%'}
        variant={'whitePrimaryOutline'}
        size={'lg'}
        fontSize={'sm'}
        px={3}
        py={1}
        minH={10}
        maxH={24}
        outline={'none'}
        rightIcon={<MyIcon name={'core/chat/chevronDown'} w={4} color={'myGray.500'} />}
        border={'1px solid'}
        borderRadius={'md'}
        bg={'white'}
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
        <Box>{label ?? placeholder}</Box>
        <Flex alignItems={'center'} ml={1}>
          <ChevronDownIcon />
        </Flex>
      </Flex>
      {isOpen && (
        <Box
          position={'absolute'}
          {...(popDirection === 'top'
            ? {
                bottom: '45px'
              }
            : {
                top: '45px'
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
