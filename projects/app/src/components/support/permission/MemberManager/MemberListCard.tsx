import { Box, BoxProps, Flex } from '@chakra-ui/react';
import MyBox from '@fastgpt/web/components/common/MyBox';
import React from 'react';
import { useContextSelector } from 'use-context-selector';
import { CollaboratorContext } from './context';
import Tag, { TagProps } from '@fastgpt/web/components/common/Tag';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useTranslation } from 'next-i18next';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import { useUserStore } from '@/web/support/user/useUserStore';

export type MemberListCardProps = BoxProps & { tagStyle?: Omit<TagProps, 'children'> };

const MemberListCard = ({ tagStyle, ...props }: MemberListCardProps) => {
  const { t } = useTranslation();
  const { userInfo } = useUserStore();

  const { collaboratorList, isFetchingCollaborator } = useContextSelector(
    CollaboratorContext,
    (v) => v
  );

  return (
    <MyBox isLoading={isFetchingCollaborator} userSelect={'none'} {...props}>
      {collaboratorList?.length === 0 ? (
        <Box p={3} color="myGray.600" fontSize={'xs'} textAlign={'center'}>
          {t('common:permission.Not collaborator')}
        </Box>
      ) : (
        <Flex gap="2" flexWrap={'wrap'}>
          {collaboratorList?.map((member) => {
            return (
              <Tag
                key={member.tmbId || member.groupId}
                type={'fill'}
                colorSchema="white"
                {...tagStyle}
              >
                <Avatar src={member.avatar} w="1.25rem" />
                <Box fontSize={'sm'} ml={1}>
                  {member.name === DefaultGroupName ? userInfo?.team.teamName : member.name}
                </Box>
              </Tag>
            );
          })}
        </Flex>
      )}
    </MyBox>
  );
};

export default MemberListCard;
