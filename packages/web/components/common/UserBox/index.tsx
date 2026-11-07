import { Box, HStack, type ImageProps, type StackProps } from '@chakra-ui/react';
import { type SourceMemberType } from '@fastgpt/global/support/user/type';
import React from 'react';
import Avatar from '../Avatar';
import { useSafeTranslation } from '../../../hooks/useSafeTranslation';
import Tag from '../Tag';

export type UserBoxProps = {
  sourceMember?: SourceMemberType;
  avatarSize?: string;
  avatarBorderRadius?: ImageProps['borderRadius'];
} & StackProps;

function UserBox({
  sourceMember,
  avatarSize = '1.25rem',
  avatarBorderRadius = 'xs',
  ...props
}: UserBoxProps) {
  const { t } = useSafeTranslation();

  return sourceMember ? (
    <HStack space="1" {...props}>
      <Avatar src={sourceMember.avatar} w={avatarSize} borderRadius={avatarBorderRadius} />
      <Box
        minW={0}
        maxW={'150px'}
        whiteSpace={'nowrap'}
        overflow={'hidden'}
        textOverflow={'ellipsis'}
      >
        {sourceMember.name}
      </Box>
      {sourceMember.status === 'leave' && <Tag color="gray">{t('common:user_leaved')}</Tag>}
    </HStack>
  ) : null;
}

export default React.memo(UserBox);
