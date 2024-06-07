import React, { useRef, useState } from 'react';
import {
  Menu,
  MenuList,
  MenuItem,
  Box,
  useOutsideClick,
  MenuButton,
  MenuItemProps
} from '@chakra-ui/react';
import MyIcon from '../Icon';
import MyDivider from '../MyDivider';

type MenuItemType = 'primary' | 'danger';

export type Props = {
  width?: number | string;
  offset?: [number, number];
  Button: React.ReactNode;
  trigger?: 'hover' | 'click';
  menuList: {
    label?: string;
    children: {
      isActive?: boolean;
      type?: MenuItemType;
      icon?: string;
      label: string | React.ReactNode;
      onClick: () => any;
    }[];
  }[];
};

const MyMenu = ({
  width = 'auto',
  trigger = 'hover',
  offset = [0, 5],
  Button,
  menuList
}: Props) => {
  const typeMapStyle: Record<MenuItemType, MenuItemProps> = {
    primary: {
      _hover: {
        backgroundColor: 'primary.50',
        color: 'primary.600'
      }
    },
    danger: {
      _hover: {
        color: 'red.600',
        background: 'red.1'
      }
    }
  };
  const menuItemStyles: MenuItemProps = {
    borderRadius: 'sm',
    py: 2,
    px: 3,
    display: 'flex',
    alignItems: 'center',
    fontSize: 'sm'
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
          {menuList.map((item, i) => {
            return (
              <Box key={i}>
                {item.label && <Box fontSize={'sm'}>{item.label}</Box>}
                {i !== 0 && <MyDivider h={'1.5px'} my={1} />}
                {item.children.map((child, index) => (
                  <MenuItem
                    key={index}
                    {...menuItemStyles}
                    {...typeMapStyle[child.type || 'primary']}
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsOpen(false);
                      child.onClick && child.onClick();
                    }}
                    color={child.isActive ? 'primary.700' : 'myGray.600'}
                    whiteSpace={'pre-wrap'}
                    _notLast={{ mb: 0.5 }}
                  >
                    {!!child.icon && <MyIcon name={child.icon as any} w={'16px'} mr={2} />}
                    <Box>{child.label}</Box>
                  </MenuItem>
                ))}
              </Box>
            );
          })}
        </MenuList>
      </Box>
    </Menu>
  );
};

export default React.memo(MyMenu);
