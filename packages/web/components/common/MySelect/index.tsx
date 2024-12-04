import React, {
  useRef,
  forwardRef,
  useMemo,
  useEffect,
  useImperativeHandle,
  ForwardedRef
} from 'react';
import {
  Menu,
  MenuList,
  MenuItem,
  Button,
  useDisclosure,
  MenuButton,
  Box,
  css,
  Flex
} from '@chakra-ui/react';
import type { ButtonProps, MenuItemProps } from '@chakra-ui/react';
import MyIcon from '../Icon';
import { useRequest2 } from '../../../hooks/useRequest';
import MyDivider from '../MyDivider';

export type SelectProps<T = any> = ButtonProps & {
  value?: T;
  placeholder?: string;
  list: {
    alias?: string;
    label: string | React.ReactNode;
    description?: string;
    value: T;
    showBorder?: boolean;
  }[];
  isLoading?: boolean;
  onchange?: (val: T) => any | Promise<any>;
};

const MySelect = <T = any,>(
  {
    placeholder,
    value,
    width = '100%',
    list = [],
    onchange,
    isLoading = false,
    ...props
  }: SelectProps<T>,
  ref: ForwardedRef<{
    focus: () => void;
  }>
) => {
  const ButtonRef = useRef<HTMLButtonElement>(null);
  const MenuListRef = useRef<HTMLDivElement>(null);
  const SelectedItemRef = useRef<HTMLDivElement>(null);

  const menuItemStyles: MenuItemProps = {
    borderRadius: 'sm',
    py: 2,
    display: 'flex',
    alignItems: 'center',
    _hover: {
      backgroundColor: 'myGray.100'
    },
    _notLast: {
      mb: 1
    }
  };
  const { isOpen, onOpen, onClose } = useDisclosure();
  const selectItem = useMemo(() => list.find((item) => item.value === value), [list, value]);

  useImperativeHandle(ref, () => ({
    focus() {
      onOpen();
    }
  }));

  useEffect(() => {
    if (isOpen && MenuListRef.current && SelectedItemRef.current) {
      const menu = MenuListRef.current;
      const selectedItem = SelectedItemRef.current;
      menu.scrollTop = selectedItem.offsetTop - menu.offsetTop - 100;
    }
  }, [isOpen]);

  const { runAsync: onChange, loading } = useRequest2((val: T) => onchange?.(val));

  const isSelecting = loading || isLoading;

  return (
    <Box
      css={css({
        '& div': {
          width: 'auto !important'
        }
      })}
    >
      <Menu
        autoSelect={false}
        isOpen={isOpen && !isSelecting}
        onOpen={onOpen}
        onClose={onClose}
        strategy={'fixed'}
        matchWidth
      >
        <MenuButton
          as={Button}
          ref={ButtonRef}
          width={width}
          px={3}
          rightIcon={<MyIcon name={'core/chat/chevronDown'} w={4} color={'myGray.500'} />}
          variant={'whitePrimaryOutline'}
          size={'lg'}
          fontSize={'sm'}
          textAlign={'left'}
          _active={{
            transform: 'none'
          }}
          {...(isOpen
            ? {
                boxShadow: '0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)',
                borderColor: 'primary.600',
                color: 'primary.700'
              }
            : {})}
          {...props}
        >
          <Flex alignItems={'center'}>
            {isSelecting && <MyIcon mr={2} name={'common/loading'} w={'16px'} />}
            {selectItem?.alias || selectItem?.label || placeholder}
          </Flex>
        </MenuButton>

        <MenuList
          ref={MenuListRef}
          className={props.className}
          minW={(() => {
            const w = ButtonRef.current?.clientWidth;
            if (w) {
              return `${w}px !important`;
            }
            return Array.isArray(width)
              ? width.map((item) => `${item} !important`)
              : `${width} !important`;
          })()}
          w={'auto'}
          px={'6px'}
          py={'6px'}
          border={'1px solid #fff'}
          boxShadow={
            '0px 2px 4px rgba(161, 167, 179, 0.25), 0px 0px 1px rgba(121, 141, 159, 0.25);'
          }
          zIndex={99}
          maxH={'40vh'}
          overflowY={'auto'}
        >
          {list.map((item, i) => (
            <Box key={i}>
              <MenuItem
                {...menuItemStyles}
                {...(value === item.value
                  ? {
                      ref: SelectedItemRef,
                      color: 'primary.700',
                      bg: 'myGray.100',
                      fontWeight: '600'
                    }
                  : {
                      color: 'myGray.900'
                    })}
                onClick={() => {
                  if (onChange && value !== item.value) {
                    onChange(item.value);
                  }
                }}
                whiteSpace={'pre-wrap'}
                fontSize={'sm'}
                display={'block'}
              >
                <Box>{item.label}</Box>
                {item.description && (
                  <Box color={'myGray.500'} fontSize={'xs'}>
                    {item.description}
                  </Box>
                )}
              </MenuItem>
              {item.showBorder && <MyDivider my={2} />}
            </Box>
          ))}
        </MenuList>
      </Menu>
    </Box>
  );
};

export default forwardRef(MySelect) as <T>(
  props: SelectProps<T> & { ref?: React.Ref<HTMLSelectElement> }
) => JSX.Element;
