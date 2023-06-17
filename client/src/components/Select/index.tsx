import React from 'react';
import { Menu, MenuButton, MenuList, MenuItem, Button, useDisclosure } from '@chakra-ui/react';
import type { ButtonProps } from '@chakra-ui/react';
import { ChevronDownIcon } from '@chakra-ui/icons';
interface Props extends ButtonProps {
  value?: string;
  placeholder?: string;
  list: {
    label: string;
    id: string;
  }[];
  onchange?: (val: string) => void;
}

const MySelect = ({ placeholder, value, width = 'auto', list, onchange, ...props }: Props) => {
  const menuItemStyles = {
    borderRadius: 'sm',
    py: 2,
    display: 'flex',
    alignItems: 'center',
    _hover: {
      backgroundColor: 'myWhite.600'
    }
  };
  const { isOpen, onOpen, onClose } = useDisclosure();

  return (
    <Menu autoSelect={false} onOpen={onOpen} onClose={onClose}>
      <MenuButton as={'span'}>
        <Button
          width={width}
          px={3}
          variant={'base'}
          display={'flex'}
          alignItems={'center'}
          justifyContent={'space-between'}
          {...(isOpen
            ? {
                boxShadow: '0px 0px 4px #A8DBFF',
                borderColor: 'myBlue.600'
              }
            : {})}
          {...props}
        >
          {list.find((item) => item.id === value)?.label || placeholder}
          <ChevronDownIcon />
        </Button>
      </MenuButton>
      <MenuList
        minW={
          Array.isArray(width) ? width.map((item) => `${item} !important`) : `${width} !important`
        }
        p={'6px'}
        border={'1px solid #fff'}
        boxShadow={'0px 2px 4px rgba(161, 167, 179, 0.25), 0px 0px 1px rgba(121, 141, 159, 0.25);'}
        zIndex={99}
      >
        {list.map((item) => (
          <MenuItem
            key={item.id}
            {...menuItemStyles}
            {...(value === item.id
              ? {
                  color: 'myBlue.600'
                }
              : {})}
            onClick={() => {
              if (onchange && value !== item.id) {
                onchange(item.id);
              }
            }}
          >
            {item.label}
          </MenuItem>
        ))}
      </MenuList>
    </Menu>
  );
};

export default MySelect;
