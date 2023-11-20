import React, { useRef, forwardRef, useMemo } from 'react';
import {
  Menu,
  Box,
  MenuList,
  MenuItem,
  Button,
  useDisclosure,
  useOutsideClick,
  MenuButton
} from '@chakra-ui/react';
import type { ButtonProps } from '@chakra-ui/react';
import { ChevronDownIcon } from '@chakra-ui/icons';
interface Props extends ButtonProps {
  value?: string;
  placeholder?: string;
  list: {
    alias?: string;
    label: string | React.ReactNode;
    value: string;
  }[];
  onchange?: (val: any) => void;
}

const MySelect = (
  { placeholder, value, width = '100%', list, onchange, ...props }: Props,
  selectRef: any
) => {
  const ref = useRef<HTMLButtonElement>(null);
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
  const selectItem = useMemo(() => list.find((item) => item.value === value), [list, value]);

  return (
    <Menu
      autoSelect={false}
      isOpen={isOpen}
      onOpen={onOpen}
      onClose={onClose}
      strategy={'fixed'}
      matchWidth
    >
      <MenuButton
        as={Button}
        ref={ref}
        width={width}
        px={3}
        rightIcon={<ChevronDownIcon />}
        variant={'base'}
        textAlign={'left'}
        _active={{
          transform: 'none'
        }}
        {...(isOpen
          ? {
              boxShadow: '0px 0px 4px #A8DBFF',
              borderColor: 'myBlue.600'
            }
          : {})}
        {...props}
      >
        {selectItem?.alias || selectItem?.label || placeholder}
      </MenuButton>

      <MenuList
        minW={(() => {
          const w = ref.current?.clientWidth;
          if (w) {
            return `${w}px !important`;
          }
          return Array.isArray(width)
            ? width.map((item) => `${item} !important`)
            : `${width} !important`;
        })()}
        p={'6px'}
        border={'1px solid #fff'}
        boxShadow={'0px 2px 4px rgba(161, 167, 179, 0.25), 0px 0px 1px rgba(121, 141, 159, 0.25);'}
        zIndex={99}
        maxH={'40vh'}
        overflowY={'auto'}
      >
        {list.map((item) => (
          <MenuItem
            key={item.value}
            {...menuItemStyles}
            {...(value === item.value
              ? {
                  color: 'myBlue.600',
                  bg: 'myWhite.300'
                }
              : {})}
            onClick={() => {
              if (onchange && value !== item.value) {
                onchange(item.value);
              }
            }}
            whiteSpace={'pre-wrap'}
          >
            {item.label}
          </MenuItem>
        ))}
      </MenuList>
    </Menu>
  );
};

export default React.memo(forwardRef(MySelect));
