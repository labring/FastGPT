import React, { useMemo } from 'react';
import { PermissionTypeEnum, PermissionTypeMap } from '@fastgpt/global/support/permission/constant';
import { Box, Flex, FlexProps } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import { PermissionValueType } from '@fastgpt/global/support/permission/type';
import { Permission } from '@fastgpt/global/support/permission/controller';

const PermissionIconText = ({
  permission,
  defaultPermission,
  ...props
}: {
  permission?: `${PermissionTypeEnum}`;
  defaultPermission?: PermissionValueType;
} & FlexProps) => {
  const { t } = useTranslation();

  const per = useMemo(() => {
    if (permission) return permission;
    if (defaultPermission) {
      return new Permission({ per: defaultPermission }).hasReadPer ? 'public' : 'private';
    }
    return 'private';
  }, [defaultPermission, permission]);

  return PermissionTypeMap[per] ? (
    <Flex alignItems={'center'} {...props}>
      <MyIcon name={PermissionTypeMap[per]?.iconLight as any} w={'14px'} />
      <Box ml={'2px'} lineHeight={1}>
        {t(PermissionTypeMap[per]?.label)}
      </Box>
    </Flex>
  ) : null;
};

export default PermissionIconText;
