import { Box, HStack, type StackProps } from '@chakra-ui/react';
import { type SourceMemberType } from '@fastgpt/global/support/user/type';
import React from 'react';
import Avatar from '../Avatar';
import { useTranslation } from 'next-i18next';
import Tag from '../Tag';

export type UserBoxProps = {
  sourceMember: SourceMemberType;
  avatarSize?: string;
} & StackProps;

function UserBox({ sourceMember, avatarSize = '1.25rem', ...props }: UserBoxProps) {
  const { t } = useTranslation();

  return (
    <HStack space="1" {...props}>
      <Avatar src={sourceMember.avatar} w={avatarSize} borderRadius={'xs'} />
      <Box maxW={'150px'} whiteSpace={'nowrap'} overflow={'hidden'}>
        {sourceMember.name}
      </Box>
      {sourceMember.status === 'leave' && <Tag color="gray">{t('common:user_leaved')}</Tag>}
    </HStack>
  );
}

export default React.memo(UserBox);
