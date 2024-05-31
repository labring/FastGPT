import React from 'react';
import { PermissionTypeEnum, PermissionTypeMap } from '@fastgpt/global/support/permission/constant';
import { Box, Flex, FlexProps } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import { PermissionValueType } from '@fastgpt/global/support/permission/type';
import { hasRead } from '@fastgpt/service/support/permission/resourcePermission/permisson';

const PermissionIconText = ({
  permission,
  defaultPermission,
  ...props
}: {
  permission?: `${PermissionTypeEnum}`;
  defaultPermission: PermissionValueType;
} & FlexProps) => {
  const { t } = useTranslation();
  if (!permission) {
    permission = hasRead(defaultPermission) ? 'public' : 'private';
  }
  return PermissionTypeMap[permission] ? (
    <Flex alignItems={'center'} {...props}>
      <MyIcon name={PermissionTypeMap[permission]?.iconLight as any} w={'14px'} />
      <Box ml={'2px'} lineHeight={1}>
        {t(PermissionTypeMap[permission]?.label)}
      </Box>
    </Flex>
  ) : null;
};

export default PermissionIconText;
