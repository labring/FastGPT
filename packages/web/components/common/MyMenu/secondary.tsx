import React, { useMemo, useRef, useState } from 'react';
import {
  Box,
  Flex,
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

const MenuItem = React.forwardRef<
  HTMLDivElement,
  {
    item: MenuItemData['children'][number];
    size: MenuSizeType;
    onClose: () => void;
  }
>((props, ref) => {
  const { item, size, onClose } = props;

  return (
    <Box
      ref={ref}
      px={3}
      py={2}
      cursor="pointer"
      _hover={{
        bg: 'primary.50',
        color: 'primary.600'
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (item.onClick && !item.menuList) {
          onClose();
          item.onClick();
        }
      }}
    >
      <Flex alignItems="center" w="100%">
        {!!item.icon && (
          <Avatar
            src={item.icon as any}
            mr={2}
            {...sizeMapStyle[size].iconStyle}
            color={item.isActive ? 'inherit' : typeMapStyle[item.type || 'primary'].iconColor}
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
    </Box>
  );
});

MenuItem.displayName = 'MenuItem';

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
  const formatTrigger = !isPc ? 'click' : trigger;

  return (
    <Box ref={ref} display="inline-block">
      <MyPopover
        placement={placement}
        offset={offset || [0, 5]}
        hasArrow
        trigger={formatTrigger}
        w={width}
        zIndex={999}
        closeOnBlur={false}
        autoFocus={false}
        Trigger={Button}
      >
        {({ onClose }) => (
          <Box bg="white" minW="150px" maxW="300px" p="6px" borderRadius="md" boxShadow="md">
            {menuList.map((group, i) => (
              <Box key={i}>
                {i !== 0 && <MyDivider {...sizeMapStyle[size].dividerStyle} />}
                {group.label && (
                  <Box fontSize="sm" px={3} py={1} color="myGray.500">
                    {group.label}
                  </Box>
                )}
                {group.children.map((item, index) => {
                  return (
                    <Box key={index}>
                      {item.menuList ? (
                        <MyPopover
                          placement="right-start"
                          offset={[10, 10]}
                          hasArrow
                          trigger={formatTrigger}
                          w={'auto'}
                          zIndex={1000}
                          closeOnBlur={false}
                          autoFocus={false}
                          Trigger={
                            <Box position="relative">
                              <MenuItem item={item} size={size} onClose={onClose} />
                            </Box>
                          }
                        >
                          {({ onClose: onCloseSubmenu }) => {
                            return (
                              <Box
                                bg="white"
                                minW="150px"
                                maxW="300px"
                                p="6px"
                                borderRadius="md"
                                boxShadow="md"
                                position="relative"
                                zIndex={1001}
                              >
                                {item.menuList?.map((subGroup, subI) => (
                                  <Box key={subI}>
                                    {subGroup.children.map((subItem, subIndex) => (
                                      <MenuItem
                                        key={subIndex}
                                        item={subItem}
                                        size={size}
                                        onClose={() => {
                                          onClose();
                                          onCloseSubmenu();
                                        }}
                                      />
                                    ))}
                                  </Box>
                                ))}
                              </Box>
                            );
                          }}
                        </MyPopover>
                      ) : (
                        <MenuItem item={item} size={size} onClose={onClose} />
                      )}
                    </Box>
                  );
                })}
              </Box>
            ))}
          </Box>
        )}
      </MyPopover>
    </Box>
  );
};

export default React.memo(MyMenu);
