import React from 'react';
import { PermissionTypeEnum, PermissionTypeMap } from '@fastgpt/global/support/permission/constant';
import { Box, Flex, FlexProps } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';

const PermissionIconText = ({
  permission,
  ...props
}: { permission: `${PermissionTypeEnum}` } & FlexProps) => {
  const { t } = useTranslation();
  return PermissionTypeMap[permission] ? (
    <Flex alignItems={'center'} {...props}>
      <MyIcon name={PermissionTypeMap[permission]?.iconLight as any} w={'14px'} />
      <Box ml={'2px'}>{t(PermissionTypeMap[permission]?.label)}</Box>
    </Flex>
  ) : null;
};

export default PermissionIconText;
