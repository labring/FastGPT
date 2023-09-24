import React, { useRef, forwardRef } from 'react';
import {
  Menu,
  Box,
  MenuList,
  MenuItem,
  Button,
  useDisclosure,
  useOutsideClick
} from '@chakra-ui/react';
import type { ButtonProps } from '@chakra-ui/react';
import { ChevronDownIcon } from '@chakra-ui/icons';
interface Props extends ButtonProps {
  value?: string;
  placeholder?: string;
  list: {
    label: string;
    value: string;
  }[];
  onchange?: (val: string) => void;
}

const MySelect = (
  { placeholder, value, width = '100%', list, onchange, ...props }: Props,
  selectRef: any
) => {
  const ref = useRef<HTMLButtonElement>(null);
  const SelectRef = useRef<HTMLDivElement>(null);
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

  useOutsideClick({
    ref: SelectRef,
    handler: () => {
      onClose();
    }
  });

  return (
    <Menu autoSelect={false} isOpen={isOpen} onOpen={onOpen} onClose={onClose}>
      <Box
        ref={SelectRef}
        position={'relative'}
        onClick={() => {
          isOpen ? onClose() : onOpen();
        }}
      >
        <Button
          ref={ref}
          width={width}
          px={3}
          variant={'base'}
          display={'flex'}
          alignItems={'center'}
          justifyContent={'space-between'}
          _active={{
            transform: ''
          }}
          {...(isOpen
            ? {
                boxShadow: '0px 0px 4px #A8DBFF',
                borderColor: 'myBlue.600'
              }
            : {})}
          {...props}
        >
          {list.find((item) => item.value === value)?.label || placeholder}
          <Box flex={1} />
          <ChevronDownIcon />
        </Button>

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
          boxShadow={
            '0px 2px 4px rgba(161, 167, 179, 0.25), 0px 0px 1px rgba(121, 141, 159, 0.25);'
          }
          zIndex={99}
          transform={'translateY(35px) !important'}
          maxH={'40vh'}
          overflowY={'auto'}
        >
          {list.map((item) => (
            <MenuItem
              key={item.value}
              {...menuItemStyles}
              {...(value === item.value
                ? {
                    color: 'myBlue.600'
                  }
                : {})}
              onClick={() => {
                if (onchange && value !== item.value) {
                  onchange(item.value);
                }
              }}
            >
              {item.label}
            </MenuItem>
          ))}
        </MenuList>
      </Box>
    </Menu>
  );
};

export default React.memo(forwardRef(MySelect));
