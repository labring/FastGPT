import {
  Box,
  ButtonProps,
  Checkbox,
  Flex,
  Menu,
  MenuButton,
  MenuItem,
  MenuItemProps,
  MenuList,
  useDisclosure
} from '@chakra-ui/react';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import MyTag from '../Tag/index';
import MyIcon from '../Icon';
import MyAvatar from '../Avatar';
import { useTranslation } from 'next-i18next';
import { useScrollPagination } from '../../../hooks/useScrollPagination';
import MyDivider from '../MyDivider';

export type SelectProps<T = any> = {
  list: {
    icon?: string;
    label: string | React.ReactNode;
    value: T;
  }[];
  value: T[];
  isSelectAll: boolean;
  setIsSelectAll: React.Dispatch<React.SetStateAction<boolean>>;

  placeholder?: string;
  maxH?: number;
  itemWrap?: boolean;
  onSelect: (val: T[]) => void;
  closeable?: boolean;
  ScrollData?: ReturnType<typeof useScrollPagination>['ScrollData'];
} & Omit<ButtonProps, 'onSelect'>;

const MultipleSelect = <T = any,>({
  value = [],
  placeholder,
  list = [],
  maxH = 400,
  onSelect,
  closeable = false,
  itemWrap = true,
  ScrollData,
  isSelectAll,
  setIsSelectAll,
  ...props
}: SelectProps<T>) => {
  const ref = useRef<HTMLButtonElement>(null);
  const { t } = useTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const menuItemStyles: MenuItemProps = {
    borderRadius: 'sm',
    py: 2,
    display: 'flex',
    alignItems: 'center',
    _hover: {
      backgroundColor: 'myGray.100'
    },
    _notLast: {
      mb: 2
    }
  };

  const onclickItem = useCallback(
    (val: T) => {
      // 全选状态下，value 实际上上空。
      if (isSelectAll) {
        onSelect(list.map((item) => item.value).filter((i) => i !== val));
        setIsSelectAll(false);
        return;
      }

      if (value.includes(val)) {
        onSelect(value.filter((i) => i !== val));
      } else {
        onSelect([...value, val]);
      }
    },
    [value, isSelectAll, onSelect, setIsSelectAll]
  );

  const onSelectAll = useCallback(() => {
    const hasSelected = isSelectAll || value.length > 0;
    onSelect(hasSelected ? [] : list.map((item) => item.value));

    setIsSelectAll((state) => !state);
  }, [value, list, setIsSelectAll, onSelect]);

  const ListRender = useMemo(() => {
    return (
      <>
        {list.map((item, i) => {
          const isSelected = isSelectAll || value.includes(item.value);
          return (
            <MenuItem
              key={i}
              {...(isSelected
                ? {
                    color: 'primary.600'
                  }
                : {
                    color: 'myGray.900'
                  })}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onclickItem(item.value);
              }}
              whiteSpace={'pre-wrap'}
              fontSize={'sm'}
              gap={2}
              {...menuItemStyles}
            >
              <Checkbox isChecked={isSelected} />
              {item.icon && <MyAvatar src={item.icon} w={'1rem'} borderRadius={'0'} />}
              <Box flex={'1 0 0'}>{item.label}</Box>
            </MenuItem>
          );
        })}
      </>
    );
  }, [value, list, isSelectAll]);

  return (
    <Box>
      <Menu
        autoSelect={false}
        isOpen={isOpen}
        onOpen={onOpen}
        onClose={onClose}
        strategy={'fixed'}
        matchWidth
        closeOnSelect={false}
      >
        <MenuButton
          as={Flex}
          alignItems={'center'}
          ref={ref}
          px={3}
          borderRadius={'md'}
          border={'base'}
          userSelect={'none'}
          cursor={'pointer'}
          _active={{
            transform: 'none'
          }}
          _hover={{
            borderColor: 'primary.300'
          }}
          {...props}
          {...(isOpen
            ? {
                boxShadow: '0px 0px 4px #A8DBFF',
                borderColor: 'primary.500',
                bg: 'white'
              }
            : {})}
        >
          {value.length === 0 && placeholder ? (
            <Box color={'myGray.500'} fontSize={'sm'}>
              {placeholder}
            </Box>
          ) : (
            <Flex alignItems={'center'} gap={2}>
              <Flex
                alignItems={'center'}
                gap={2}
                flexWrap={itemWrap ? 'wrap' : 'nowrap'}
                overflow={'hidden'}
                flex={1}
              >
                {isSelectAll ? (
                  <Box fontSize={'mini'} color={'myGray.900'}>
                    {t('common:common.All')}
                  </Box>
                ) : (
                  list
                    .filter((item) => value.includes(item.value))
                    .map((item, i) => (
                      <MyTag
                        className="tag-icon"
                        key={i}
                        bg={'primary.100'}
                        color={'primary.700'}
                        type={'fill'}
                        borderRadius={'full'}
                        px={2}
                        py={0.5}
                        flexShrink={0}
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
                    ))
                )}
              </Flex>
              <MyIcon name={'core/chat/chevronDown'} color={'myGray.600'} w={4} h={4} />
            </Flex>
          )}
        </MenuButton>

        <MenuList
          className={props.className}
          px={'6px'}
          py={'6px'}
          border={'1px solid #fff'}
          boxShadow={
            '0px 4px 10px 0px rgba(19, 51, 107, 0.10), 0px 0px 1px 0px rgba(19, 51, 107, 0.10);'
          }
          zIndex={99}
          maxH={'40vh'}
          overflowY={'auto'}
        >
          <MenuItem
            color={isSelectAll ? 'primary.600' : 'myGray.900'}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onSelectAll();
            }}
            whiteSpace={'pre-wrap'}
            fontSize={'sm'}
            gap={2}
            mb={1}
            {...menuItemStyles}
          >
            <Checkbox isChecked={isSelectAll} />
            <Box flex={'1 0 0'}>{t('common:common.All')}</Box>
          </MenuItem>

          <MyDivider my={1} />

          {ScrollData ? <ScrollData>{ListRender}</ScrollData> : ListRender}
        </MenuList>
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
