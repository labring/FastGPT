import React from 'react';
import { Box, Button, Flex, Tag, TagLabel, useDisclosure } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@/components/Avatar';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { delMemberPermission } from '@/web/support/user/team/api';
import { useUserStore } from '@/web/support/user/useUserStore';

import { TeamModalContext } from '../../context';
import { TeamPermissionList } from '@fastgpt/global/support/permission/user/constant';
import dynamic from 'next/dynamic';
import MyBox from '@fastgpt/web/components/common/MyBox';

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
    successToast: '删除管理员成功',
    errorToast: '删除管理员异常',
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
          <Box fontSize={['md', 'lg']} fontWeight={'bold'} alignItems={'center'}>
            {t('user.team.role.Admin')}
          </Box>
          <Box
            fontSize={['xs']}
            color={'myGray.500'}
            bgColor={'myGray.100'}
            alignItems={'center'}
            alignContent={'center'}
            mx={'6'}
            px={'3'}
            borderRadius={'sm'}
          >
            {TeamPermissionList['manage'].description}
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
            添加管理员
          </Button>
        )}
      </Flex>
      <Flex mt="4" mx="4">
        {members.map((member) => {
          if (member.permission.hasManagePer && !member.permission.isOwner) {
            return (
              <Tag key={member.memberName} mx={'2'} px="4" py="2" bg="myGray.100">
                <Avatar src={member.avatar} w="20px" />
                <TagLabel fontSize={'md'} alignItems="center" mr="6" ml="2">
                  {member.memberName}
                </TagLabel>
                {userInfo?.team.role === 'owner' && (
                  <MyIcon
                    name="common/trash"
                    w="16px"
                    color="myGray.500"
                    cursor="pointer"
                    _hover={{ color: 'red.600' }}
                    onClick={() => {
                      removeManager(member.tmbId);
                    }}
                  />
                )}
              </Tag>
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
