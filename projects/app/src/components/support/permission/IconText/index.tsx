import React from 'react';
import { PermissionTypeMap } from '@fastgpt/global/support/permission/constant';
import { Box, StackProps, HStack } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';

const PermissionIconText = ({
  w = '1rem',
  fontSize = 'mini',
  iconColor = 'myGray.500',
  private: Private = false,
  ...props
}: {
  private?: boolean;
  iconColor?: string;
} & StackProps) => {
  const { t } = useTranslation();

  const per = Private ? 'private' : 'public';

  return PermissionTypeMap[per] ? (
    <HStack spacing={1} fontSize={fontSize} {...props}>
      <MyIcon name={PermissionTypeMap[per]?.iconLight as any} w={w} color={iconColor} />
      <Box lineHeight={1}>{t(PermissionTypeMap[per]?.label as any)}</Box>
    </HStack>
  ) : null;
};

export default PermissionIconText;
