import {
  Button,
  ButtonProps,
  Flex,
  Menu,
  MenuButton,
  MenuList,
  useDisclosure,
  Box,
  Checkbox,
  Radio
} from '@chakra-ui/react';
import { ChevronDownIcon } from '@chakra-ui/icons';
import React, { useMemo, useRef } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { PermissionValueType } from '@fastgpt/global/support/permission/type';
import {
  checkPermission,
  Permission
} from '@fastgpt/service/support/permission/resourcePermission/permisson';
import { useContextSelector } from 'use-context-selector';
import { CollaboratorContext } from '.';

export type PermissionSelectProps = {
  value?: PermissionValueType;
  onChange?: (value: PermissionValueType) => void;
  deleteButton?: boolean;
  onDelete?: () => void;
  iconButton?: boolean;
} & Omit<ButtonProps, 'onChange' | 'value'>;

function PermissionSelect({
  value,
  isLoading,
  width,
  onChange,
  deleteButton,
  onDelete,
  iconButton,
  ...props
}: PermissionSelectProps) {
  const { permissionConfig: list } = useContextSelector(CollaboratorContext, (v) => v);
  const ref = useRef<HTMLButtonElement>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const singleValues = list.filter((item) => item.type === 'single').map((item) => item.value);
  const multipleValues = list.filter((item) => item.type === 'multiple').map((item) => item.value);
  const [valueState, setValueState] = React.useState(value);

  const singleSelectedValue = useMemo(() => {
    return new Permission(valueState).remove(...multipleValues).value;
  }, [valueState, multipleValues]);

  return (
    <Menu
      autoSelect={false}
      isOpen={isOpen}
      onOpen={onOpen}
      onClose={() => {
        onChange?.(valueState!);
        onClose();
      }}
    >
      <MenuButton
        ref={ref}
        width={width}
        px={3}
        textAlign={'left'}
        {...(iconButton
          ? {
              _hover: {
                color: 'primary.500'
              }
            }
          : {
              as: Button,
              rightIcon: <ChevronDownIcon />,
              variant: 'whitePrimary',
              ...(isOpen
                ? {
                    boxShadow: '0px 0px 4px #A8DBFF',
                    borderColor: 'primary.500'
                  }
                : {})
            })}
      >
        {iconButton ? (
          <MyIcon name="edit" w="16px" />
        ) : (
          <Flex alignItems={'center'}>
            {isLoading && <MyIcon mr={2} name={'common/loading'} w={'16px'} />}
            {list.find((item) => item.value === singleSelectedValue)?.name || '请选择权限'}
            {list.map((item) => {
              if (item.type === 'multiple' && checkPermission(valueState, item.value)) {
                return '、' + item.name;
              }
            })}
          </Flex>
        )}
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
              setValueState(
                new Permission(valueState).remove(...singleValues).add(item.value).value
              );
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
              >
                <Radio size="lg" isChecked={singleSelectedValue === item.value} onChange={change} />
                <Flex mx="4" flexDirection="column" onClick={change}>
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
              if (checkPermission(valueState, item.value)) {
                setValueState(new Permission(valueState).remove(item.value).value);
              } else {
                setValueState(new Permission(valueState).add(item.value).value);
              }
            };
            return (
              <Flex
                key={item.value}
                {...(checkPermission(valueState, item.value)
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
              >
                <Checkbox
                  size="lg"
                  isChecked={checkPermission(valueState, item.value)}
                  onChange={change}
                />
                <Flex px="4" flexDirection="column" onClick={change}>
                  <Box fontWeight="500">{item.name}</Box>
                  <Box fontWeight="400">{item.description}</Box>
                </Flex>
              </Flex>
            );
          })}
        {deleteButton && (
          <>
            <hr />
            <Flex
              mt="2"
              p="2"
              alignItems="center"
              gap="2"
              _hover={{
                bgColor: 'myGray.50',
                cursor: 'pointer'
              }}
              onClick={() => {
                onDelete?.();
                onClose();
              }}
            >
              <MyIcon name="delete" w="20px" color="red.600" />
              <Box color="red.600"> 删除</Box>
            </Flex>
          </>
        )}
      </MenuList>
    </Menu>
  );
}

export default React.memo(PermissionSelect);
