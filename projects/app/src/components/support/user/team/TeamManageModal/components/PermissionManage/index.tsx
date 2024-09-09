import React from 'react';
import { Box, Button, Flex, Tag, TagLabel, useDisclosure } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { delMemberPermission } from '@/web/support/user/team/api';
import { useUserStore } from '@/web/support/user/useUserStore';

import { TeamModalContext } from '../../context';
import { TeamPermissionList } from '@fastgpt/global/support/permission/user/constant';
import dynamic from 'next/dynamic';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyTag from '@fastgpt/web/components/common/Tag/index';

const AddManagerModal = dynamic(() => import('./AddManager'));

function PermissionManage() {
  const { t } = useTranslation();
  const { userInfo } = useUserStore();
  const { members, refetchMembers } = useContextSelector(TeamModalContext, (v) => v);

  const {
    isOpen: isOpenAddManager,
    onOpen: onOpenAddManager,
    onClose: onCloseAddManager
  } = useDisclosure();

  const { mutate: removeManager, isLoading: isRemovingManager } = useRequest({
    mutationFn: async (memberId: string) => {
      return delMemberPermission(memberId);
    },
    successToast: t('user:delete.admin_success'),
    errorToast: t('user:delete.admin_failed'),
    onSuccess: () => {
      refetchMembers();
    }
  });

  return (
    <MyBox h={'100%'} isLoading={isRemovingManager} bg={'white'}>
      <Flex
        mx={'5'}
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
              onOpenAddManager();
            }}
          >
            {t('user:team.Add manager')}
          </Button>
        )}
      </Flex>
      <Flex mt="4" mx="4" flexWrap={'wrap'} gap={3}>
        {members.map((member) => {
          if (member.permission.hasManagePer && !member.permission.isOwner) {
            return (
              <MyTag key={member.tmbId} px="4" py="2" type="fill" colorSchema="gray">
                <Avatar src={member.avatar} w="1.25rem" />
                <Box fontSize={'sm'} ml={1}>
                  {member.memberName}
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
                      removeManager(member.tmbId);
                    }}
                  />
                )}
              </MyTag>
            );
          }
        })}
      </Flex>

      {isOpenAddManager && (
        <AddManagerModal onClose={onCloseAddManager} onSuccess={onCloseAddManager} />
      )}
    </MyBox>
  );
}

export default PermissionManage;
