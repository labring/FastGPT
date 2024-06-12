import React, { useMemo } from 'react';
import { Permission } from '@fastgpt/global/support/permission/controller';
import { PermissionListType } from '@fastgpt/global/support/permission/type';
import { PermissionList } from '@fastgpt/global/support/permission/constant';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import { HStack } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';

const PermissionTag = ({
  permission,
  permissionList
}: {
  permission: Permission;
  permissionList: PermissionListType;
}) => {
  const { t } = useTranslation();

  const { commonLabel, otherLabels } = useMemo(() => {
    const Per = new Permission({ per: permission.value });

    const commonLabel = (() => {
      if (permission.isOwner) return t('permission.Owner');
      if (permission.hasManagePer) return PermissionList['manage'].name;
      if (permission.hasWritePer) return PermissionList['write'].name;
      if (permission.hasReadPer) return PermissionList['read'].name;

      return;
    })();

    const otherLabels: string[] = [];
    Object.values(permissionList).forEach((item) => {
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
    permission.value,
    permissionList
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
