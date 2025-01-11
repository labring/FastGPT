import { Box, HStack } from '@chakra-ui/react';
import { SourceMemberType } from '@fastgpt/global/support/user/type';
import React from 'react';
import Avatar from '../Avatar';
import { useTranslation } from 'next-i18next';
import Tag from '../Tag';

export type UserBoxProps = {
  sourceMember: SourceMemberType;
  fontSize?: string;
  avatarSize?: string;
};
function UserBox({
  sourceMember,
  fontSize = 'sm',
  avatarSize: AvatarWidth = '1.25rem'
}: UserBoxProps) {
  const { t } = useTranslation();
  return (
    <HStack>
      <Avatar src={sourceMember.avatar} w={AvatarWidth} />
      <Box fontSize={fontSize} ml={1}>
        {sourceMember.name}
        {sourceMember.status === 'leave' && <Tag color="gray">{t('account_team:leaved')}</Tag>}
      </Box>
    </HStack>
  );
}

export default React.memo(UserBox);
