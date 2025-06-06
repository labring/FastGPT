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
  Trigger: React.ReactNode;
  trigger?: 'hover' | 'click';
  size?: MenuSizeType;
  placement?: PlacementWithLogical;
  hasArrow?: boolean;
  onClose?: () => void;
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

const MenuItem = ({
  item,
  size,
  onClose
}: {
  item: MenuItemData['children'][number];
  size: MenuSizeType;
  onClose: () => void;
}) => {
  return (
    <Box
      px={3}
      py={2}
      cursor="pointer"
      borderRadius="md"
      _hover={{
        bg: 'primary.50',
        color: 'primary.600'
      }}
      onClick={(e) => {
        if (item.onClick) {
          item.onClick();
        }
        if (!item.menuList) {
          onClose();
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
};

const MultipleMenu = (props: Props) => {
  const {
    width = 'auto',
    trigger = 'hover',
    size = 'sm',
    offset,
    Trigger,
    menuList,
    hasArrow = false,
    placement = 'bottom-start'
  } = props;

  const { isPc } = useSystem();
  const formatTrigger = !isPc ? 'click' : trigger;

  return (
    <MyPopover
      placement={placement}
      offset={offset}
      hasArrow={hasArrow}
      trigger={formatTrigger}
      w={width}
      zIndex={999}
      closeOnBlur={false}
      autoFocus={false}
      Trigger={Trigger}
    >
      {({ onClose }) => {
        const onCloseFn = () => {
          onClose();
          props?.onClose?.();
        };

        return (
          <Box
            bg="white"
            maxW="300px"
            p="6px"
            border={'1px solid #fff'}
            boxShadow={'3'}
            borderRadius={'md'}
          >
            {menuList.map((group, i) => (
              <Box key={i}>
                {i !== 0 && <MyDivider h={'1.5px'} {...sizeMapStyle[size].dividerStyle} />}
                {group.label && (
                  <Box fontSize="sm" px={3} py={1} color="myGray.500">
                    {group.label}
                  </Box>
                )}
                {group.children.map((item, index) => {
                  return (
                    <Box key={index}>
                      {item.menuList ? (
                        <MultipleMenu
                          {...props}
                          placement={'left'}
                          trigger={'hover'}
                          menuList={item.menuList}
                          onClose={onCloseFn}
                          Trigger={
                            <Box>
                              <MenuItem item={item} size={size} onClose={onCloseFn} />
                            </Box>
                          }
                          hasArrow
                        />
                      ) : (
                        <MenuItem item={item} size={size} onClose={onCloseFn} />
                      )}
                    </Box>
                  );
                })}
              </Box>
            ))}
          </Box>
        );
      }}
    </MyPopover>
  );
};

export default React.memo(MultipleMenu);
