import React, { useMemo } from 'react';
import { Permission } from '@fastgpt/global/support/permission/controller';
import type { RoleListType } from '@fastgpt/global/support/permission/type';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import { HStack } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { CommonRoleList } from '@fastgpt/global/support/permission/constant';

const PermissionTag = ({
  permission,
  roleList: roleList
}: {
  permission: Permission;
  roleList: RoleListType;
}) => {
  const { t } = useTranslation();

  const { commonLabel, otherLabels } = useMemo(() => {
    const Per = new Permission({ role: permission.role });

    const commonLabel = (() => {
      if (permission.isOwner) return t('common:permission.Owner');
      if (permission.hasManagePer) return t(CommonRoleList['manage'].name as any);
      if (permission.hasWritePer) return t(CommonRoleList['write'].name as any);
      if (permission.hasReadPer) return t(CommonRoleList['read'].name as any);

      return;
    })();

    const otherLabels: string[] = [];
    Object.values(roleList).forEach((item) => {
      if (item.checkBoxType === 'multiple') {
        if (Per.checkPer(item.value)) {
          otherLabels.push(item.name);
        }
      }
    });

    return {
      commonLabel,
      otherLabels
    };
  }, [
    permission.hasManagePer,
    permission.hasReadPer,
    permission.hasWritePer,
    permission.isOwner,
    permission.role,
    roleList,
    t
  ]);
  return (
    <HStack>
      {commonLabel && (
        <MyTag type="fill" colorSchema="blue">
          {commonLabel}
        </MyTag>
      )}
      {otherLabels.map((tag, i) => (
        <MyTag key={i} type="fill" colorSchema="purple">
          {tag}
        </MyTag>
      ))}
    </HStack>
  );
};

export default PermissionTag;
