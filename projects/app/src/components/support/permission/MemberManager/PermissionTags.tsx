import { Flex, TagLabel } from '@chakra-ui/react';
import { PermissionValueType } from '@fastgpt/global/support/permission/type';
import {
  checkPermission,
  Permission
} from '@fastgpt/service/support/permission/resourcePermission/permisson';
import Tag from '@fastgpt/web/components/common/Tag';
import React, { useMemo } from 'react';
import { useContextSelector } from 'use-context-selector';
import { CollaboratorContext } from '.';

export type PermissionTagsProp = {
  permission: PermissionValueType;
};

function PermissionTags({ permission }: PermissionTagsProp) {
  const { permissionConfig } = useContextSelector(CollaboratorContext, (v) => v);
  const multiPermissions = permissionConfig
    .filter((v) => v.type === 'multiple')
    .map((v) => v.value);
  const singlePermission = useMemo(() => {
    return new Permission(permission).remove(...multiPermissions).value;
  }, [permission, multiPermissions]);
  const multiPermissionsValues = useMemo(() => {
    return multiPermissions.filter((v) => checkPermission(permission, v));
  }, [permission, multiPermissions]);

  return (
    <Flex gap="2">
      <Tag>{permissionConfig.find((v) => v.value === singlePermission)?.name}</Tag>
      {multiPermissionsValues &&
        multiPermissionsValues.map((v) => (
          <Tag key={v} colorSchema="gray">
            {permissionConfig.find((p) => p.value === v)?.name}
          </Tag>
        ))}
    </Flex>
  );
}

export default PermissionTags;
