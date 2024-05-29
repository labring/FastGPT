import {
  Button,
  ButtonProps,
  Flex,
  Menu,
  MenuButton,
  MenuItemProps,
  MenuList,
  useDisclosure,
  Box,
  Checkbox,
  Radio
} from '@chakra-ui/react';
import { ChevronDownIcon } from '@chakra-ui/icons';
import { useLoading } from '@fastgpt/web/hooks/useLoading';
import React, { useMemo, useRef } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { PermissionValueType } from '@fastgpt/global/support/permission/type';
import {
  checkPermission,
  Permission
} from '@fastgpt/service/support/permission/resourcePermission/permisson';

export type PermissionSelectListType = {
  value: PermissionValueType;
  name: string;
  description?: string;
  type?: 'single' | 'multiple'; // default: single
}[];

export type PermissionSelectProps = {
  list: PermissionSelectListType;
  value?: PermissionValueType;
  onChange?: (value: PermissionValueType) => void;
} & Omit<ButtonProps, 'onChange' | 'value'>;

function PermissionSelect({
  list,
  value,
  isLoading,
  width,
  onChange,
  ...props
}: PermissionSelectProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();
  // const selectItem = useMemo(() => list.find((item) => item.value === value), [list, value]);
  const singleValues = list.filter((item) => item.type === 'single').map((item) => item.value);
  const multipleValues = list.filter((item) => item.type === 'multiple').map((item) => item.value);
  // const singleSelectedValue = new Permission(value).remove(...multipleValues).value;
  const singleSelectedValue = useMemo(() => {
    return new Permission(value).remove(...multipleValues).value;
  }, [value, multipleValues]);
  const [refresh, setRefresh] = React.useState(true);

  return (
    <Menu autoSelect={false} isOpen={isOpen} onOpen={onOpen} onClose={onClose}>
      <MenuButton
        as={Button}
        ref={ref}
        width={width}
        px={3}
        rightIcon={<ChevronDownIcon />}
        variant={'whitePrimary'}
        textAlign={'left'}
        _active={{
          transform: 'none'
        }}
        {...(isOpen
          ? {
              boxShadow: '0px 0px 4px #A8DBFF',
              borderColor: 'primary.500'
            }
          : {})}
        {...props}
      >
        <Flex alignItems={'center'}>
          {isLoading && <MyIcon mr={2} name={'common/loading'} w={'16px'} />}
          {list.find((item) => item.value === singleSelectedValue)?.name || '请选择权限'}
          {list.map((item) => {
            if (item.type === 'multiple' && checkPermission(value, item.value)) {
              return '、' + item.name;
            }
          })}
        </Flex>
      </MenuButton>
      <MenuList
        className={props.className}
        minW={(() => {
          const w = ref.current?.clientWidth;
          if (w) {
            return `${w}px !important`;
          }
          return Array.isArray(width)
            ? width.map((item) => `${item} !important`)
            : `${width} !important`;
        })()}
        p="4"
        border={'1px solid #fff'}
        boxShadow={'0px 2px 4px rgba(161, 167, 179, 0.25), 0px 0px 1px rgba(121, 141, 159, 0.25);'}
        zIndex={99}
        overflowY={'auto'}
      >
        {/* The list of single select permissions */}
        {list
          .filter((item) => item.type === 'single')
          .map((item) => {
            const change = () => {
              if (onChange) {
                onChange(new Permission(value).remove(...singleValues).add(item.value).value);
              }
              setRefresh(!refresh);
            };
            return (
              <Flex
                key={item.value}
                {...(singleSelectedValue === item.value
                  ? {
                      color: 'primary.500',
                      bg: 'myWhite.300'
                    }
                  : {})}
                whiteSpace="pre-wrap"
                flexDirection="row"
                justifyContent="start"
                p="2"
                _hover={{
                  bg: 'myGray.50'
                }}
                onClick={change}
              >
                <Radio size="lg" isChecked={singleSelectedValue === item.value} onChange={change} />
                <Flex mx="4" flexDirection="column">
                  <Box fontWeight="500">{item.name}</Box>
                  <Box fontWeight="400">{item.description}</Box>
                </Flex>
              </Flex>
            );
          })}

        <hr />

        <Box m="4">其他权限（多选）</Box>

        {/* The list of multiple select permissions */}
        {list
          .filter((item) => item.type === 'multiple')
          .map((item) => {
            const change = () => {
              if (onChange) {
                if (checkPermission(value, item.value)) {
                  onChange(new Permission(value).remove(item.value).value);
                } else {
                  onChange(new Permission(value).add(item.value).value);
                }
              }
              setRefresh(!refresh);
            };
            return (
              <Flex
                key={item.value}
                {...(checkPermission(value, item.value)
                  ? {
                      color: 'primary.500',
                      bg: 'myWhite.300'
                    }
                  : {})}
                whiteSpace="pre-wrap"
                flexDirection="row"
                justifyContent="start"
                p="2"
                _hover={{
                  bg: 'myGray.50'
                }}
                onClick={change}
              >
                <Checkbox
                  size="lg"
                  isChecked={checkPermission(value, item.value)}
                  onChange={change}
                />
                <Flex mx="4" flexDirection="column">
                  <Box fontWeight="500">{item.name}</Box>
                  <Box fontWeight="400">{item.description}</Box>
                </Flex>
              </Flex>
            );
          })}
      </MenuList>
    </Menu>
  );
}

export default React.memo(PermissionSelect);
