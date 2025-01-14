import { useUserStore } from '@/web/support/user/useUserStore';
import { Box, type BoxProps, Flex } from '@chakra-ui/react';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyBox from '@fastgpt/web/components/common/MyBox';
import Tag, { type TagProps } from '@fastgpt/web/components/common/Tag';
import { useTranslation } from 'next-i18next';
import React from 'react';
import { useContextSelector } from 'use-context-selector';
import { CollaboratorContext } from './context';

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
                key={member.tmbId || member.groupId || member.orgId}
                type={'fill'}
                colorSchema="white"
                {...tagStyle}
              >
                <Avatar src={member.avatar} w="1.25rem" rounded={'50%'} />
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
