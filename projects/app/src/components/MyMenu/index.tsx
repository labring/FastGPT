import React, { useRef, useState } from 'react';
import { Menu, MenuList, MenuItem, Box, useOutsideClick, MenuButton } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';

interface Props {
  width?: number | string;
  offset?: [number, number];
  Button: React.ReactNode;
  trigger?: 'hover' | 'click';
  menuList: {
    isActive?: boolean;
    label: string | React.ReactNode;
    icon?: string;
    onClick: () => any;
  }[];
}

const MyMenu = ({
  width = 'auto',
  trigger = 'hover',
  offset = [0, 5],
  Button,
  menuList
}: Props) => {
  const menuItemStyles = {
    borderRadius: 'sm',
    py: 3,
    display: 'flex',
    alignItems: 'center',
    _hover: {
      backgroundColor: 'myGray.05',
      color: 'primary.600'
    }
  };
  const ref = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<any>();
  const [isOpen, setIsOpen] = useState(false);

  useOutsideClick({
    ref: ref,
    handler: () => {
      setIsOpen(false);
    }
  });

  return (
    <Menu offset={offset} isOpen={isOpen} autoSelect={false} direction={'ltr'} isLazy>
      <Box
        ref={ref}
        onMouseEnter={() => {
          if (trigger === 'hover') {
            setIsOpen(true);
          }
          clearTimeout(closeTimer.current);
        }}
        onMouseLeave={() => {
          if (trigger === 'hover') {
            closeTimer.current = setTimeout(() => {
              setIsOpen(false);
            }, 100);
          }
        }}
      >
        <Box
          position={'relative'}
          onClickCapture={() => {
            if (trigger === 'click') {
              setIsOpen(!isOpen);
            }
          }}
        >
          <MenuButton
            w={'100%'}
            h={'100%'}
            position={'absolute'}
            top={0}
            right={0}
            bottom={0}
            left={0}
          />
          <Box position={'relative'}>{Button}</Box>
        </Box>
        <MenuList
          minW={isOpen ? `${width}px !important` : 0}
          p={'6px'}
          border={'1px solid #fff'}
          boxShadow={
            '0px 2px 4px rgba(161, 167, 179, 0.25), 0px 0px 1px rgba(121, 141, 159, 0.25);'
          }
        >
          {menuList.map((item, i) => (
            <MenuItem
              key={i}
              {...menuItemStyles}
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
                item.onClick && item.onClick();
              }}
              color={item.isActive ? 'primary.700' : 'myGray.600'}
              whiteSpace={'pre-wrap'}
            >
              {!!item.icon && <MyIcon name={item.icon as any} w={'16px'} mr={2} />}
              {item.label}
            </MenuItem>
          ))}
        </MenuList>
      </Box>
    </Menu>
  );
};

export default MyMenu;
