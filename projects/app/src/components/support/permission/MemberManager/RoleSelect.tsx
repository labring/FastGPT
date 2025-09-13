import {
  type ButtonProps,
  Flex,
  Menu,
  MenuList,
  Box,
  Radio,
  useOutsideClick,
  HStack,
  MenuButton,
  Checkbox
} from '@chakra-ui/react';
import React, { useMemo, useRef, useState } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import type { RoleValueType } from '@fastgpt/global/support/permission/type';
import { useContextSelector } from 'use-context-selector';
import { Permission } from '@fastgpt/global/support/permission/controller';
import { CollaboratorContext } from './context';
import { useTranslation } from 'next-i18next';
import MyDivider from '@fastgpt/web/components/common/MyDivider';
import { ManageRoleVal } from '@fastgpt/global/support/permission/constant';

export type PermissionSelectProps = {
  value?: RoleValueType;
  onChange: (value: RoleValueType) => void;
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

function RoleSelect({
  value: role,
  onChange,
  trigger = 'click',
  offset = [0, 5],
  Button,
  width = 'auto',
  onDelete,
  disabled
}: PermissionSelectProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<NodeJS.Timeout>();

  const { roleList: permissionList } = useContextSelector(CollaboratorContext, (v) => v);
  const myRole = useContextSelector(CollaboratorContext, (v) => v.myRole);

  const [isOpen, setIsOpen] = useState(false);

  const roleOptions = useMemo(() => {
    if (!permissionList) return { singleOptions: [], checkboxList: [] };

    const list = Object.entries(permissionList).map(([_, value]) => {
      return {
        name: value.name,
        value: value.value,
        description: value.description,
        checkBoxType: value.checkBoxType
      };
    });

    const singleOptions = list.filter((item) => item.checkBoxType === 'single');
    const per = new Permission({ role });

    return {
      singleOptions: myRole.isOwner
        ? singleOptions
        : myRole.hasManagePer && !per.hasManagePer
          ? singleOptions.filter((item) => item.value !== ManageRoleVal)
          : [],
      checkboxList: list.filter((item) => item.checkBoxType === 'multiple')
    };
  }, [myRole.hasManagePer, myRole.isOwner, permissionList, role]);
  const selectedSingleValue = useMemo(() => {
    if (!permissionList) return undefined;

    const per = new Permission({ role });

    if (per.hasManagePer) return permissionList['manage'].value;
    if (per.hasWritePer) return permissionList['write'].value;

    return permissionList['read'].value;
  }, [permissionList, role]);
  const selectedMultipleValues = useMemo(() => {
    const per = new Permission({ role });

    return roleOptions.checkboxList
      .filter((item) => {
        return per.checkRole(item.value);
      })
      .map((item) => item.value);
  }, [role, roleOptions.checkboxList]);

  const onSelectRole = (newRole: RoleValueType) => {
    if (newRole === role) return;
    onChange(newRole);
    // setIsOpen(false);
  };

  useOutsideClick({
    ref,
    handler: () => {
      setIsOpen(false);
    }
  });

  return selectedSingleValue !== undefined ? (
    <Menu offset={offset} isOpen={isOpen} autoSelect={false} direction={'ltr'}>
      <Box
        ref={ref}
        w="fit-content"
        onMouseEnter={() => {
          if (disabled) return;
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
        <MenuButton
          position={'relative'}
          cursor={disabled ? 'not-allowed' : 'pointer'}
          onClickCapture={() => {
            if (trigger === 'click') {
              if (disabled) return;
              setIsOpen(!isOpen);
            }
          }}
        >
          {Button}
        </MenuButton>
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
          userSelect={'none'}
        >
          {/* The list of single select permissions */}
          {roleOptions.singleOptions.map((item) => {
            const change = () => {
              if (disabled) {
                return;
              }
              onSelectRole(item.value);
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
                  <Box>{t(item.name as any)}</Box>
                  <Box color={'myGray.500'} fontSize={'mini'}>
                    {t(item.description as any)}
                  </Box>
                </Box>
              </Flex>
            );
          })}

          {roleOptions.checkboxList.length > 0 && roleOptions.singleOptions.length > 0 && (
            <>
              <MyDivider />
              <Box pb="2" px="3" fontSize={'sm'} color={'myGray.900'}>
                {t('common:permission_other')}
              </Box>
            </>
          )}

          {roleOptions.checkboxList.map((item) => {
            const change = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
              if ((e.target as HTMLElement).tagName === 'INPUT') return;
              const per = new Permission({ role });
              if (per.checkRole(item.value)) {
                per.removeRole(item.value);
              } else {
                per.addRole(item.value);
              }
              onSelectRole(per.role);
            };
            const isChecked = selectedMultipleValues.includes(item.value);
            return (
              <Flex
                key={item.value}
                {...(isChecked
                  ? {
                      color: 'primary.600'
                    }
                  : {})}
                {...MenuStyle}
                onClick={(e) => {
                  if (disabled) return;
                  change(e);
                }}
              >
                <Checkbox size="sm" isChecked={isChecked} />
                <Flex ml={4} flexDirection="column" flex={'1 0 0'}>
                  <Box>{t(item.name as any)}</Box>
                  <Box color={'myGray.500'} fontSize={'mini'}>
                    {t(item.description as any)}
                  </Box>
                </Flex>
              </Flex>
            );
          })}
          {onDelete && (
            <>
              <MyDivider my={2} h={'2px'} borderColor={'myGray.200'} />
              <HStack
                {...MenuStyle}
                onClick={() => {
                  onDelete();
                  // setIsOpen(false);
                }}
              >
                <MyIcon name="delete" w="20px" color="red.600" />
                <Box color="red.600">{t('common:Remove')}</Box>
              </HStack>
            </>
          )}
        </MenuList>
      </Box>
    </Menu>
  ) : null;
}

export default React.memo(RoleSelect);
