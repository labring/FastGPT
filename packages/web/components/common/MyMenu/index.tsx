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
import MyPopover from '../MyPopover';

export type MenuItemType = 'primary' | 'danger' | 'gray' | 'grayBg';

export type MenuSizeType = 'sm' | 'md' | 'xs' | 'mini';

export type MenuItemData = {
  label?: string;
  children: Array<{
    isActive?: boolean;
    type?: MenuItemType;
    icon?: IconNameType | string;
    label: string | React.ReactNode;
    description?: string;
    onClick?: () => any;
    menuItemStyles?: MenuItemProps;
    menuList?: MenuItemData[];
  }>;
};

export type Props = {
  label?: string;
  width?: number | string;
  offset?: [number, number];
  Button: React.ReactNode;
  trigger?: 'hover' | 'click';
  size?: MenuSizeType;
  placement?: PlacementWithLogical;
  menuList: MenuItemData[];
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
  onClose
}: {
  item: MenuItemData['children'][number];
  size: MenuSizeType;
  trigger: Props['trigger'];
  formatTrigger: 'hover' | 'click';
  onClose: () => void;
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
      {item.menuList ? (
        <MyPopover
          placement="right-start"
          offset={[10, 10]}
          hasArrow
          trigger={formatTrigger}
          w={'auto'}
          zIndex={999}
          closeOnBlur={false}
          Trigger={
            <MenuItem
              onClick={(e) => {
                e.stopPropagation();
                if (item.onClick) {
                  onClose();
                  item.onClick();
                } else if (formatTrigger === 'click') {
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
                    color={
                      item.isActive ? 'inherit' : typeMapStyle[item.type || 'primary'].iconColor
                    }
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
          }
        >
          {({ onClose: onCloseSubmenu }) => (
            <MenuList position="relative" minW={'150px'} maxW={'300px'} p={'6px'} border="none">
              {item.menuList?.map((subMenu, i) => (
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
                      onClose={() => {
                        onClose();
                        onCloseSubmenu();
                      }}
                    />
                  ))}
                </Box>
              ))}
            </MenuList>
          )}
        </MyPopover>
      ) : (
        <MenuItem
          onClick={(e) => {
            e.stopPropagation();
            if (item.onClick) {
              onClose();
              item.onClick();
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
  placement = 'bottom-start'
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
