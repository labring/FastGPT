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
import React, { useRef } from 'react';
import MyTag from '../Tag/index';
import MyIcon from '../Icon';
import MyAvatar from '../Avatar';
import { useTranslation } from 'next-i18next';

export type SelectProps<T = any> = {
  value: T[];
  placeholder?: string;
  list: {
    icon?: string;
    label: string | React.ReactNode;
    value: T;
  }[];
  maxH?: number;
  itemWrap?: boolean;
  onSelect: (val: T[]) => void;
  closeable?: boolean;
} & Omit<ButtonProps, 'onSelect'>;

const MultipleSelect = <T = any,>({
  value = [],
  placeholder,
  list = [],
  maxH = 400,
  onSelect,
  closeable = false,
  itemWrap = true,
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

  const onclickItem = (val: T) => {
    if (val === 'all') {
      if (value.length === list.length) {
        onSelect([]);
      } else {
        onSelect(list.map((item) => item.value));
      }
      return;
    }

    if (value.includes(val)) {
      onSelect(value.filter((i) => i !== val));
    } else {
      onSelect([...value, val]);
    }
  };

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
                {value.map((item, i) => {
                  const listItem = list.find((i) => i.value === item);
                  if (!listItem) return null;

                  return (
                    <MyTag
                      className="tag-icon"
                      key={i}
                      color={'myGray.600'}
                      colorSchema="blue"
                      type={'fill'}
                      borderRadius={'full'}
                      px={2}
                      py={0.5}
                      flexShrink={0}
                    >
                      {listItem.label}
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
                            console.log(111);
                            e.stopPropagation();
                            onclickItem(item);
                          }}
                        />
                      )}
                    </MyTag>
                  );
                })}
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
            {...menuItemStyles}
            color={value.length === list.length ? 'primary.600' : 'myGray.900'}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onclickItem('all' as T);
            }}
            whiteSpace={'pre-wrap'}
            fontSize={'sm'}
            gap={2}
          >
            <Checkbox isChecked={value.length === list.length} />
            <Box>{t('common:common.All')}</Box>
          </MenuItem>

          {list.map((item, i) => (
            <MenuItem
              key={i}
              {...menuItemStyles}
              {...(value.includes(item.value)
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
            >
              <Checkbox isChecked={value.includes(item.value)} />
              {item.icon && <MyAvatar src={item.icon} w={'1rem'} borderRadius={'0'} />}
              <Box flex={'1 0 0'}>{item.label}</Box>
              <Box w={'0.8rem'} lineHeight={1}>
                {value.includes(item.value) && <MyIcon name={'price/right'} w={'1rem'} />}
              </Box>
            </MenuItem>
          ))}
        </MenuList>
      </Menu>
    </Box>
  );
};

export default MultipleSelect;
