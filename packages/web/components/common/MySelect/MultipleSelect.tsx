import {
  Box,
  Button,
  ButtonProps,
  Flex,
  Menu,
  MenuButton,
  MenuItem,
  MenuItemProps,
  MenuList,
  useDisclosure,
  useOutsideClick
} from '@chakra-ui/react';
import React, { useRef } from 'react';
import { useTranslation } from 'next-i18next';
import MyTag from '../Tag/index';
import MyIcon from '../Icon';

export type SelectProps<T = any> = {
  value: T[];
  placeholder?: string;
  list: {
    icon?: string;
    label: string | React.ReactNode;
    value: T;
  }[];
  maxH?: number;
  onSelect: (val: T[]) => void;
} & Omit<ButtonProps, 'onSelect'>;

const MultipleSelect = <T = any,>({
  value = [],
  placeholder,
  list = [],
  width = '100%',
  maxH = 400,
  onSelect,
  ...props
}: SelectProps<T>) => {
  const { t } = useTranslation();
  const ref = useRef<HTMLButtonElement>(null);
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
          as={Box}
          ref={ref}
          width={width}
          minH={'40px'}
          px={3}
          py={2}
          borderRadius={'md'}
          border={'base'}
          userSelect={'none'}
          cursor={'pointer'}
          _active={{
            transform: 'none'
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
            <Flex alignItems={'center'} gap={2} flexWrap={'wrap'}>
              {value.map((item, i) => {
                const listItem = list.find((i) => i.value === item);
                if (!listItem) return null;

                return (
                  <MyTag key={i} colorSchema="blue" type={'borderFill'}>
                    {listItem.label}
                    {/* <MyIcon
                      name={'common/closeLight'}
                      ml={1}
                      w="14px"
                      cursor={'pointer'}
                      onClickCapture={(e) => {
                        console.log(111);
                        e.stopPropagation();
                        onclickItem(item);
                      }}
                    /> */}
                  </MyTag>
                );
              })}
            </Flex>
          )}
        </MenuButton>

        <MenuList
          className={props.className}
          minW={(() => {
            const w = ref.current?.clientWidth;
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
              onClick={() => onclickItem(item.value)}
              whiteSpace={'pre-wrap'}
              fontSize={'sm'}
              gap={2}
            >
              <Box w={'0.8rem'} lineHeight={1}>
                {value.includes(item.value) && <MyIcon name={'price/right'} w={'1rem'} />}
              </Box>
              <Box>{item.label}</Box>
            </MenuItem>
          ))}
        </MenuList>
      </Menu>
    </Box>
  );
};

export default MultipleSelect;
