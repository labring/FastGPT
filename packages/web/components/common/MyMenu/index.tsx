import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Menu,
  MenuList,
  MenuItem,
  Box,
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
  label?: string;
  children: Array<{
    isActive?: boolean;
    type?: MenuItemType;
    icon?: IconNameType | string;
    label: string | React.ReactNode;
    description?: string;
    onClick?: () => any;
    menuItemStyles?: MenuItemProps;
  }>;
};
export type Props = {
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
          {menuList.map((item, i) => {
            return (
              <Box key={i}>
                {item.label && <Box fontSize={'sm'}>{item.label}</Box>}
                {i !== 0 && <MyDivider h={'1.5px'} {...sizeMapStyle[size].dividerStyle} />}
                {item.children.map((child, index) => (
                  <MenuItem
                    key={index}
                    borderRadius={'sm'}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (child.onClick) {
                        setIsOpen(false);
                        child.onClick();
                      }
                    }}
                    alignItems={'center'}
                    fontSize={'sm'}
                    color={child.isActive ? 'primary.700' : 'myGray.600'}
                    whiteSpace={'pre-wrap'}
                    {...typeMapStyle[child.type || 'primary'].styles}
                    {...sizeMapStyle[size].menuItemStyle}
                    {...child.menuItemStyles}
                  >
                    {!!child.icon && (
                      <Avatar
                        src={child.icon as any}
                        mr={2}
                        {...sizeMapStyle[size].iconStyle}
                        color={
                          child.isActive
                            ? 'inherit'
                            : typeMapStyle[child.type || 'primary'].iconColor
                        }
                        sx={{
                          '[role="menuitem"]:hover &': {
                            color: 'inherit'
                          }
                        }}
                      />
                    )}
                    <Box w={'100%'}>
                      <Box
                        w={'100%'}
                        color={child.description ? 'myGray.900' : 'inherit'}
                        {...sizeMapStyle[size].labelStyle}
                      >
                        {child.label}
                      </Box>
                      {child.description && (
                        <Box color={'myGray.500'} fontSize={'mini'} w={'100%'}>
                          {child.description}
                        </Box>
                      )}
                    </Box>
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
