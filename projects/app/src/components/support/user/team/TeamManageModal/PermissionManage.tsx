import React from 'react';
import { Box, Button, Flex, Tag, TagCloseButton, TagLabel, useDisclosure } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { TeamContext } from '.';
import { useContextSelector } from 'use-context-selector';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@/components/Avatar';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import AddManagerModal from './AddManager';
import { updateMemberPermission } from '@/web/support/user/team/api';
import { useUserStore } from '@/web/support/user/useUserStore';
import {
  constructPermission,
  hasManage,
  PermissionList
} from '@fastgpt/service/support/permission/resourcePermission/permisson';

function PermissionManage() {
  const { t } = useTranslation();
  const members = useContextSelector(TeamContext, (v) => v.members);
  const refetchMembers = useContextSelector(TeamContext, (v) => v.refetchMembers);
  const { userInfo } = useUserStore();

  const {
    isOpen: isOpenAddManager,
    onOpen: onOpenAddManager,
    onClose: onCloseAddManager
  } = useDisclosure();

  const { mutate: removeManager } = useRequest({
    mutationFn: async (memberId: string) => {
      return updateMemberPermission({
        teamId: userInfo!.team.teamId,
        permission: constructPermission([PermissionList['Read'], PermissionList['Write']]).value,
        memberIds: [memberId]
      });
    },
    successToast: 'Success',
    errorToast: 'Error',
    onSuccess: () => {
      refetchMembers();
    },
    onError: () => {
      refetchMembers();
    }
  });

  return (
    <Flex flexDirection={'column'} flex={'1'} h={['auto', '100%']} bg={'white'}>
      {isOpenAddManager && (
        <AddManagerModal onClose={onCloseAddManager} onSuccess={onCloseAddManager} />
      )}

      <Flex
        mx={'5'}
        flexDirection={'row'}
        alignItems={'center'}
        rowGap={'8'}
        justifyContent={'space-between'}
      >
        <Flex>
          <Box fontSize={['md', 'lg']} fontWeight={'bold'} alignItems={'center'}>
            {t('user.team.role.Admin')}
          </Box>
          <Box
            fontSize={['sm', 'md']}
            bgColor={'myGray.200'}
            alignItems={'center'}
            mx={'5'}
            px={'2'}
            borderRadius={'sm'}
          >
            可邀请, 删除成员
          </Box>
        </Flex>
        <Button
          variant={'whitePrimary'}
          size="sm"
          borderRadius={'md'}
          ml={3}
          leftIcon={<MyIcon name={'common/inviteLight'} w={'14px'} color={'primary.500'} />}
          onClick={() => {
            onOpenAddManager();
          }}
        >
          添加管理员
        </Button>
      </Flex>
      <Flex>
        {members.map((member) => {
          if (hasManage(member.permission) && member.tmbId != userInfo!.team.tmbId) {
            return (
              <Tag key={member.memberName} mx={'5'}>
                <Avatar src={member.avatar} w={['18px', '22px']} />
                <TagLabel fontSize={'md'} alignItems={'center'}>
                  {member.memberName}
                </TagLabel>
                <TagCloseButton
                  onClick={() => {
                    removeManager(member.tmbId);
                  }}
                />
              </Tag>
            );
          }
        })}
      </Flex>
    </Flex>
  );
}

export default PermissionManage;
