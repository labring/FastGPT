import {
  ButtonProps,
  Flex,
  Menu,
  MenuButton,
  MenuList,
  Box,
  Radio,
  useOutsideClick,
  HStack
} from '@chakra-ui/react';
import React, { useMemo, useRef, useState } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { PermissionValueType } from '@fastgpt/global/support/permission/type';
import { useContextSelector } from 'use-context-selector';
import { Permission } from '@fastgpt/global/support/permission/controller';
import { CollaboratorContext } from './context';
import { useTranslation } from 'next-i18next';
import MyDivider from '@fastgpt/web/components/common/MyDivider';

export type PermissionSelectProps = {
  value?: PermissionValueType;
  onChange: (value: PermissionValueType) => void;
  trigger?: 'hover' | 'click';
  offset?: [number, number];
  Button: React.ReactNode;

  onDelete?: () => void;
} & Omit<ButtonProps, 'onChange' | 'value'>;

const MenuStyle = {
  py: 2,
  px: 3,
  _hover: {
    bg: 'myGray.50'
  },
  borderRadius: 'md',
  cursor: 'pointer',
  fontSize: 'sm'
};

function PermissionSelect({
  value,
  onChange,
  trigger = 'click',
  offset = [0, 5],
  Button,
  width = 'auto',
  onDelete,
  ...props
}: PermissionSelectProps) {
  const { t } = useTranslation();
  const { permission, permissionList } = useContextSelector(CollaboratorContext, (v) => v);
  const ref = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<any>();

  const [isOpen, setIsOpen] = useState(false);

  const permissionSelectList = useMemo(() => {
    const list = Object.entries(permissionList).map(([key, value]) => {
      return {
        name: value.name,
        value: value.value,
        description: value.description,
        checkBoxType: value.checkBoxType
      };
    });

    return {
      singleCheckBoxList: list
        .filter((item) => item.checkBoxType === 'single')
        .filter((item) => {
          if (permission.isOwner) return true;
          if (item.value === permissionList['manage'].value) return false;
          return true;
        }),
      multipleCheckBoxList: list.filter((item) => item.checkBoxType === 'multiple')
    };
  }, [permission.isOwner, permissionList]);
  const selectedSingleValue = useMemo(() => {
    const per = new Permission({ per: value });

    if (per.hasManagePer) return permissionList['manage'].value;
    if (per.hasWritePer) return permissionList['write'].value;

    return permissionList['read'].value;
  }, [permissionList, value]);
  const selectedMultipleValues = useMemo(() => {
    const per = new Permission({ per: value });

    return permissionSelectList.multipleCheckBoxList
      .filter((item) => {
        return per.checkPer(item.value);
      })
      .map((item) => item.value);
  }, [permissionSelectList.multipleCheckBoxList, value]);

  const onSelectPer = (per: PermissionValueType) => {
    if (per === value) return;
    onChange(per);
    setIsOpen(false);
  };

  useOutsideClick({
    ref: ref,
    handler: () => {
      setIsOpen(false);
    }
  });

  return (
    <Menu offset={offset} isOpen={isOpen} autoSelect={false} direction={'ltr'}>
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
          <Flex
            alignItems={'center'}
            justifyContent={'center'}
            position={'relative'}
            cursor={'pointer'}
            userSelect={'none'}
          >
            {Button}
          </Flex>
        </Box>
        <MenuList
          minW={isOpen ? `${width}px !important` : 0}
          p="3"
          border={'1px solid #fff'}
          boxShadow={
            '0px 2px 4px rgba(161, 167, 179, 0.25), 0px 0px 1px rgba(121, 141, 159, 0.25);'
          }
          zIndex={99}
          overflowY={'auto'}
          whiteSpace={'pre-wrap'}
        >
          {/* The list of single select permissions */}
          {permissionSelectList.singleCheckBoxList.map((item) => {
            const change = () => {
              const per = new Permission({ per: value });
              per.removePer(selectedSingleValue);
              per.addPer(item.value);
              onSelectPer(per.value);
            };

            return (
              <Flex
                key={item.value}
                {...(selectedSingleValue === item.value
                  ? {
                      color: 'primary.600'
                    }
                  : {})}
                {...MenuStyle}
                onClick={change}
                maxW={['70vw', '260px']}
              >
                <Radio isChecked={selectedSingleValue === item.value} />
                <Box ml={4}>
                  <Box>{item.name}</Box>
                  <Box color={'myGray.500'} fontSize={'mini'}>
                    {t(item.description)}
                  </Box>
                </Box>
              </Flex>
            );
          })}

          {/* <MyDivider my={3} />

          {multipleValues.length > 0 && <Box m="4">其他权限（多选）</Box>} */}

          {/* The list of multiple select permissions */}
          {/* {list
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
            })}*/}
          {onDelete && (
            <>
              <MyDivider my={2} h={'2px'} borderColor={'myGray.200'} />
              <HStack
                {...MenuStyle}
                onClick={() => {
                  onDelete();
                  setIsOpen(false);
                }}
              >
                <MyIcon name="delete" w="20px" color="red.600" />
                <Box color="red.600">{t('common.Remove')}</Box>
              </HStack>
            </>
          )}
        </MenuList>
      </Box>
    </Menu>
  );
}

export default React.memo(PermissionSelect);
