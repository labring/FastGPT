import React, { useState } from 'react';
import { Box, Button, Flex, useDisclosure } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { delMemberPermission } from '@/web/support/user/team/api';
import { useUserStore } from '@/web/support/user/useUserStore';

import { TeamModalContext } from '../../context';
import { TeamPermissionList } from '@fastgpt/global/support/permission/user/constant';
import dynamic from 'next/dynamic';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';

const AddMemberWithPermissionModal = dynamic(() => import('./AddMemberWithPermissionModal'));

function PermissionManage() {
  const { t } = useTranslation();
  const { userInfo } = useUserStore();
  const { groups, refetchMembers, refetchGroups, isLoading, clbs, refetchClbs, members } =
    useContextSelector(TeamModalContext, (v) => v);

  const [addType, setAddType] = useState<'writer' | 'manager'>('writer');

  const {
    isOpen: isOpenAddManager,
    onOpen: onOpenAddManager,
    onClose: onCloseAddManager
  } = useDisclosure();

  const { runAsync: onRemovePermission, loading: isRemovingPermission } = useRequest2(
    delMemberPermission,
    {
      successToast: t('user:delete.success'),
      errorToast: t('user:delete.failed'),
      onSuccess: () => Promise.all([refetchMembers(), refetchGroups(), refetchClbs()])
    }
  );

  return (
    <MyBox h={'100%'} isLoading={isRemovingPermission || isLoading} bg={'white'}>
      <Flex
        mx={'5'}
        flexDirection={'row'}
        alignItems={'center'}
        rowGap={'8'}
        justifyContent={'space-between'}
      >
        <Flex>
          <Box fontSize={['sm', 'md']} fontWeight={'bold'} alignItems={'center'}>
            {t('common:user.team.role.writer')}
          </Box>
          <Box
            fontSize={['xs']}
            color={'myGray.500'}
            bgColor={'myGray.100'}
            alignItems={'center'}
            alignContent={'center'}
            px={'3'}
            ml={3}
            borderRadius={'sm'}
          >
            {TeamPermissionList['write'].description}
          </Box>
        </Flex>
        {userInfo?.team.role === 'owner' && (
          <Button
            variant={'whitePrimary'}
            size="sm"
            borderRadius={'md'}
            ml={3}
            leftIcon={<MyIcon name={'common/inviteLight'} w={'14px'} color={'primary.500'} />}
            onClick={() => {
              setAddType('writer');
              onOpenAddManager();
            }}
          >
            {t('user:team.add_writer')}
          </Button>
        )}
      </Flex>
      <Flex mt="4" mx="4" flexWrap={'wrap'} gap={3}>
        {groups.map((group) => {
          if (group.permission.hasWritePer && !group.permission.hasManagePer) {
            return (
              <MyTag key={group._id} px="4" py="2" type="fill" colorSchema="gray">
                <Avatar src={group.avatar} w="1.25rem" />
                <Box fontSize={'sm'} ml={1}>
                  {group.name}
                </Box>
                {userInfo?.team.role === 'owner' && (
                  <MyIcon
                    ml={4}
                    name="common/trash"
                    w="1rem"
                    color="myGray.500"
                    cursor="pointer"
                    _hover={{ color: 'red.600' }}
                    onClick={() => {
                      onRemovePermission({
                        groupId: group._id
                      });
                    }}
                  />
                )}
              </MyTag>
            );
          }
        })}
        {clbs.map((clb) => {
          const per = new TeamPermission({ per: clb.permission });
          if (per.hasWritePer && !per.isOwner && !per.hasManagePer) {
            return (
              <MyTag key={clb.tmbId} px="4" py="2" type="fill" colorSchema="gray">
                <Avatar src={members.find((m) => m.tmbId === clb.tmbId)?.avatar} w="1.25rem" />
                <Box fontSize={'sm'} ml={1}>
                  {members.find((m) => m.tmbId === clb.tmbId)?.memberName}
                </Box>
                {userInfo?.team.role === 'owner' && (
                  <MyIcon
                    ml={4}
                    name="common/trash"
                    w="1rem"
                    color="myGray.500"
                    cursor="pointer"
                    _hover={{ color: 'red.600' }}
                    onClick={() => {
                      if (clb.tmbId)
                        onRemovePermission({
                          tmbId: clb.tmbId
                        });
                    }}
                  />
                )}
              </MyTag>
            );
          }
        })}
      </Flex>
      <Flex
        mx={'5'}
        mt={'8'}
        flexDirection={'row'}
        alignItems={'center'}
        rowGap={'8'}
        justifyContent={'space-between'}
      >
        <Flex>
          <Box fontSize={['sm', 'md']} fontWeight={'bold'} alignItems={'center'}>
            {t('common:user.team.role.Admin')}
          </Box>
          <Box
            fontSize={['xs']}
            color={'myGray.500'}
            bgColor={'myGray.100'}
            alignItems={'center'}
            alignContent={'center'}
            px={'3'}
            ml={3}
            borderRadius={'sm'}
          >
            {t(TeamPermissionList['manage'].description as any)}
          </Box>
        </Flex>
        {userInfo?.team.role === 'owner' && (
          <Button
            variant={'whitePrimary'}
            size="sm"
            borderRadius={'md'}
            ml={3}
            leftIcon={<MyIcon name={'common/inviteLight'} w={'14px'} color={'primary.500'} />}
            onClick={() => {
              setAddType('manager');
              onOpenAddManager();
            }}
          >
            {t('user:team.Add manager')}
          </Button>
        )}
      </Flex>
      <Flex mt="4" mx="4" flexWrap={'wrap'} gap={3}>
        {groups.map((group) => {
          if (group.permission.hasManagePer) {
            return (
              <MyTag key={group._id} px="4" py="2" type="fill" colorSchema="gray">
                <Avatar src={group.avatar} w="1.25rem" />
                <Box fontSize={'sm'} ml={1}>
                  {group.name}
                </Box>
                {userInfo?.team.role === 'owner' && (
                  <MyIcon
                    ml={4}
                    name="common/trash"
                    w="1rem"
                    color="myGray.500"
                    cursor="pointer"
                    _hover={{ color: 'red.600' }}
                    onClick={() => {
                      onRemovePermission({
                        groupId: group._id
                      });
                    }}
                  />
                )}
              </MyTag>
            );
          }
        })}
        {clbs.map((clb) => {
          const per = new TeamPermission({ per: clb.permission });
          if (per.hasManagePer && !per.isOwner) {
            return (
              <MyTag key={clb.tmbId} px="4" py="2" type="fill" colorSchema="gray">
                <Avatar src={members.find((m) => m.tmbId === clb.tmbId)?.avatar} w="1.25rem" />
                <Box fontSize={'sm'} ml={1}>
                  {members.find((m) => m.tmbId === clb.tmbId)?.memberName}
                </Box>
                {userInfo?.team.role === 'owner' && (
                  <MyIcon
                    ml={4}
                    name="common/trash"
                    w="1rem"
                    color="myGray.500"
                    cursor="pointer"
                    _hover={{ color: 'red.600' }}
                    onClick={() => {
                      if (clb.tmbId) {
                        onRemovePermission({
                          tmbId: clb.tmbId
                        });
                      }
                    }}
                  />
                )}
              </MyTag>
            );
          }
        })}
      </Flex>
      {isOpenAddManager && (
        <AddMemberWithPermissionModal
          onClose={onCloseAddManager}
          onSuccess={onCloseAddManager}
          addType={addType}
        />
      )}
    </MyBox>
  );
}

export default PermissionManage;
