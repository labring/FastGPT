import React from 'react';
import { PermissionTypeEnum, PermissionTypeMap } from '@fastgpt/global/support/permission/constant';
import { Box, Flex, FlexProps, Tag, TagLabel } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';

const PermissionIconText = ({
  permission,
  tmbName,
  ...props
}: { permission: `${PermissionTypeEnum}`; tmbName: string } & FlexProps) => {
  const { t } = useTranslation();
  return PermissionTypeMap[permission] ? (
    <Flex alignItems={'center'} {...props}>
      <MyIcon name={PermissionTypeMap[permission]?.iconLight as any} w={'14px'} />
      <Box ml={'2px'}>{t(PermissionTypeMap[permission]?.label)}</Box>
      <Tag ml={'6px'}>
        <TagLabel>{tmbName}</TagLabel>
      </Tag>
    </Flex>
  ) : null;
};

export default PermissionIconText;
