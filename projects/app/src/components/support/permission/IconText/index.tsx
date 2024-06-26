import React, { useMemo } from 'react';
import { PermissionTypeEnum, PermissionTypeMap } from '@fastgpt/global/support/permission/constant';
import { Box, StackProps, HStack } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import { PermissionValueType } from '@fastgpt/global/support/permission/type';
import { Permission } from '@fastgpt/global/support/permission/controller';

const PermissionIconText = ({
  permission,
  defaultPermission,
  w = '1rem',
  fontSize = 'mini',
  iconColor = 'myGray.500',
  ...props
}: {
  permission?: `${PermissionTypeEnum}`;
  defaultPermission?: PermissionValueType;
  iconColor?: string;
} & StackProps) => {
  const { t } = useTranslation();

  const per = useMemo(() => {
    if (permission) return permission;
    if (defaultPermission !== undefined) {
      const Per = new Permission({ per: defaultPermission });
      if (Per.hasWritePer) return PermissionTypeEnum.publicWrite;
      if (Per.hasReadPer) return PermissionTypeEnum.publicRead;
      return PermissionTypeEnum.clbPrivate;
    }
    return 'private';
  }, [defaultPermission, permission]);

  return PermissionTypeMap[per] ? (
    <HStack spacing={1} fontSize={fontSize} {...props}>
      <MyIcon name={PermissionTypeMap[per]?.iconLight as any} w={w} color={iconColor} />
      <Box lineHeight={1}>{t(PermissionTypeMap[per]?.label)}</Box>
    </HStack>
  ) : null;
};

export default PermissionIconText;
