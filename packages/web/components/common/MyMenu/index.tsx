import React, { useMemo, useRef, useState } from 'react';
import {
  Menu,
  MenuList,
  MenuItem,
  Box,
  Flex,
  useOutsideClick,
  MenuButton,
  type MenuItemProps,
  type PlacementWithLogical,
  type AvatarProps,
  type BoxProps,
  type DividerProps
} from '@chakra-ui/react';
import MyDivider from '../MyDivider';
import type { IconNameType } from '../Icon/type';
import { useSystem } from '../../../hooks/useSystem';
import Avatar from '../Avatar';

export type MenuItemType = 'primary' | 'danger' | 'gray' | 'grayBg';

export type MenuSizeType = 'sm' | 'md' | 'xs' | 'mini';

export type MenuItemData = {
  isActive?: boolean;
  type?: MenuItemType;
  icon?: IconNameType | string;
  label: string | React.ReactNode;
  description?: string;
  onClick?: () => any;
  menuItemStyles?: MenuItemProps;
  menuList?: {
    label?: string;
    children: MenuItemData[];
  }[];
};

export type Props = {
  width?: number | string;
  offset?: [number, number];
  Button: React.ReactNode;
  trigger?: 'hover' | 'click';
  size?: MenuSizeType;
  placement?: PlacementWithLogical;
  subMenuPlacement?: 'right-start' | 'left-start' | 'right-end' | 'left-end';
  menuList: {
    label?: string;
    children: MenuItemData[];
  }[];
};

const typeMapStyle: Record<MenuItemType, { styles: MenuItemProps; iconColor?: string }> = {
  primary: {
    styles: {
      _hover: {
        backgroundColor: 'primary.50',
        color: 'primary.600'
      },
      _focus: {
        backgroundColor: 'primary.50',
        color: 'primary.600'
      },
      _active: {
        backgroundColor: 'primary.50',
        color: 'primary.600'
      }
    },
    iconColor: 'myGray.600'
  },
  gray: {
    styles: {
      _hover: {
        backgroundColor: 'myGray.05',
        color: 'primary.600'
      },
      _focus: {
        backgroundColor: 'myGray.05',
        color: 'primary.600'
      },
      _active: {
        backgroundColor: 'myGray.05',
        color: 'primary.600'
      }
    },
    iconColor: 'myGray.400'
  },
  grayBg: {
    styles: {
      _hover: {
        backgroundColor: 'myGray.05',
        color: 'primary.600'
      },
      _focus: {
        backgroundColor: 'myGray.05',
        color: 'primary.600'
      },
      _active: {
        backgroundColor: 'myGray.05',
        color: 'primary.600'
      }
    },
    iconColor: 'myGray.600'
  },
  danger: {
    styles: {
      color: 'red.600',
      _hover: {
        background: 'red.1'
      },
      _focus: {
        background: 'red.1'
      },
      _active: {
        background: 'red.1'
      }
    },
    iconColor: 'red.600'
  }
};
const sizeMapStyle: Record<
  MenuSizeType,
  {
    iconStyle: AvatarProps;
    labelStyle: BoxProps;
    dividerStyle: DividerProps;
    menuItemStyle: MenuItemProps;
  }
> = {
  mini: {
    iconStyle: {
      w: '14px'
    },
    labelStyle: {
      fontSize: 'mini'
    },
    dividerStyle: {
      my: 0.5
    },
    menuItemStyle: {
      py: 1.5,
      px: 2
    }
  },
  xs: {
    iconStyle: {
      w: '14px'
    },
    labelStyle: {
      fontSize: 'sm'
    },
    dividerStyle: {
      my: 0.5
    },
    menuItemStyle: {
      py: 1.5,
      px: 2
    }
  },
  sm: {
    iconStyle: {
      w: '1rem'
    },
    labelStyle: {
      fontSize: 'sm'
    },
    dividerStyle: {
      my: 1
    },
    menuItemStyle: {
      py: 2,
      px: 3,
      _notLast: {
        mb: 0.5
      }
    }
  },
  md: {
    iconStyle: {
      w: '2rem',
      borderRadius: '6px'
    },
    labelStyle: {
      fontSize: 'sm'
    },
    dividerStyle: {
      my: 1
    },
    menuItemStyle: {
      py: 2,
      px: 3,
      _notLast: {
        mb: 0.5
      }
    }
  }
};

const SubMenuItem = ({
  item,
  size,
  trigger,
  formatTrigger,
  onClose,
  subMenuPlacement = 'right-start'
}: {
  item: MenuItemData;
  size: MenuSizeType;
  trigger: Props['trigger'];
  formatTrigger: 'hover' | 'click';
  onClose: () => void;
  subMenuPlacement?: Props['subMenuPlacement'];
}) => {
  const [isSubMenuOpen, setIsSubMenuOpen] = useState(false);
  const subMenuRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<any>();

  useOutsideClick({
    ref: subMenuRef,
    handler: () => setIsSubMenuOpen(false)
  });

  return (
    <Box
      ref={subMenuRef}
      position="relative"
      onMouseEnter={() => {
        if (formatTrigger === 'hover' && item.menuList) {
          setIsSubMenuOpen(true);
        }
        clearTimeout(closeTimer.current);
      }}
      onMouseLeave={() => {
        if (formatTrigger === 'hover' && item.menuList) {
          closeTimer.current = setTimeout(() => {
            setIsSubMenuOpen(false);
          }, 100);
        }
      }}
    >
      <MenuItem
        onClick={(e) => {
          e.stopPropagation();
          if (item.onClick) {
            onClose();
            item.onClick();
          } else if (item.menuList && formatTrigger === 'click') {
            setIsSubMenuOpen(!isSubMenuOpen);
          }
        }}
        {...typeMapStyle[item.type || 'primary'].styles}
        {...sizeMapStyle[size].menuItemStyle}
        {...item.menuItemStyles}
      >
        <Flex alignItems="center" w="100%">
          {!!item.icon && (
            <Avatar
              src={item.icon as any}
              mr={2}
              {...sizeMapStyle[size].iconStyle}
              color={item.isActive ? 'inherit' : typeMapStyle[item.type || 'primary'].iconColor}
              sx={{
                '[role="menuitem"]:hover &': {
                  color: 'inherit'
                }
              }}
            />
          )}
          <Box flex="1">
            <Box
              color={item.description ? 'myGray.900' : 'inherit'}
              {...sizeMapStyle[size].labelStyle}
            >
              {item.label}
            </Box>
            {item.description && (
              <Box color={'myGray.500'} fontSize={'mini'}>
                {item.description}
              </Box>
            )}
          </Box>
        </Flex>
      </MenuItem>
      {item.menuList && isSubMenuOpen && (
        <Box
          position="absolute"
          {...(subMenuPlacement?.startsWith('right') ? { left: '100%' } : { right: '100%' })}
          {...(subMenuPlacement?.endsWith('start') ? { top: 0 } : { bottom: 0 })}
          ml={subMenuPlacement?.startsWith('right') ? '9px' : undefined}
          mr={subMenuPlacement?.startsWith('left') ? '9px' : undefined}
          zIndex={100}
        >
          <Box
            position="absolute"
            {...(subMenuPlacement?.startsWith('right') ? { left: '-100px' } : { right: '-6px' })}
            top="15px"
            width="14px"
            height="14px"
            transform="rotate(45deg)"
            bg="white"
            border={subMenuPlacement?.startsWith('right') ? 'none' : 'none'}
            borderLeft={
              subMenuPlacement?.startsWith('right') ? '1px solid rgba(0, 0, 0, 0.05)' : 'none'
            }
            borderTop={
              subMenuPlacement?.startsWith('left') ? '1px solid rgba(0, 0, 0, 0.05)' : 'none'
            }
            borderRight={
              subMenuPlacement?.startsWith('left') ? '1px solid rgba(0, 0, 0, 0.05)' : 'none'
            }
            borderBottom={
              subMenuPlacement?.startsWith('right') ? '1px solid rgba(0, 0, 0, 0.05)' : 'none'
            }
            boxShadow="none"
            zIndex={10000}
          />
          <MenuList
            position="relative"
            minW={'150px'}
            maxW={'300px'}
            p={'6px'}
            boxShadow={'0 1px 2px rgba(0, 0, 0, 0.05)'}
            bg="white"
          >
            {item.menuList.map((subMenu, i) => (
              <Box key={i}>
                {subMenu.label && <Box fontSize={'sm'}>{subMenu.label}</Box>}
                {i !== 0 && <MyDivider h={'1.5px'} {...sizeMapStyle[size].dividerStyle} />}
                {subMenu.children.map((child, index) => (
                  <SubMenuItem
                    key={index}
                    item={child}
                    size={size}
                    trigger={trigger}
                    formatTrigger={formatTrigger}
                    onClose={onClose}
                    subMenuPlacement={subMenuPlacement}
                  />
                ))}
              </Box>
            ))}
          </MenuList>
        </Box>
      )}
    </Box>
  );
};

const MyMenu = ({
  width = 'auto',
  trigger = 'hover',
  size = 'sm',
  offset,
  Button,
  menuList,
  placement = 'bottom-start',
  subMenuPlacement = 'right-start'
}: Props) => {
  const { isPc } = useSystem();
  const ref = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<any>();
  const [isOpen, setIsOpen] = useState(false);

  const formatTrigger = !isPc ? 'click' : trigger;

  useOutsideClick({
    ref: ref,
    handler: () => {
      setIsOpen(false);
    }
  });

  const computeOffset = useMemo<[number, number]>(() => {
    if (offset) return offset;
    if (typeof width === 'number') return [-width / 2, 5];
    return [0, 5];
  }, [offset, width]);

  return (
    <Menu
      offset={computeOffset}
      isOpen={isOpen}
      autoSelect={false}
      direction={'ltr'}
      isLazy
      lazyBehavior={'keepMounted'}
      placement={placement}
      computePositionOnMount
    >
      <Box
        ref={ref}
        onMouseEnter={() => {
          if (formatTrigger === 'hover') {
            setIsOpen(true);
          }
          clearTimeout(closeTimer.current);
        }}
        onMouseLeave={() => {
          if (formatTrigger === 'hover') {
            closeTimer.current = setTimeout(() => {
              setIsOpen(false);
            }, 100);
          }
        }}
      >
        <Box
          position={'relative'}
          onClickCapture={(e) => {
            e.stopPropagation();
            if (formatTrigger === 'click') {
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
          <Box
            position={'relative'}
            color={isOpen ? 'primary.600' : ''}
            w="fit-content"
            h="fit-content"
            borderRadius="sm"
          >
            {Button}
          </Box>
        </Box>
        <MenuList
          minW={isOpen ? `${width}px !important` : '80px'}
          zIndex={100}
          maxW={'300px'}
          p={'6px'}
          border={'1px solid #fff'}
          boxShadow={'3'}
        >
          {menuList.map((item, i) => (
            <Box key={i}>
              {item.label && <Box fontSize={'sm'}>{item.label}</Box>}
              {i !== 0 && <MyDivider h={'1.5px'} {...sizeMapStyle[size].dividerStyle} />}
              {item.children.map((child, index) => (
                <SubMenuItem
                  key={index}
                  item={child}
                  size={size}
                  trigger={trigger}
                  formatTrigger={formatTrigger}
                  onClose={() => setIsOpen(false)}
                  subMenuPlacement={subMenuPlacement}
                />
              ))}
            </Box>
          ))}
        </MenuList>
      </Box>
    </Menu>
  );
};

export default React.memo(MyMenu);
