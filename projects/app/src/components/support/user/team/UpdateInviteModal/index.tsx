import React from 'react';
import { useTranslation } from 'next-i18next';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { Button, ModalFooter, ModalBody, Flex, Box, useTheme } from '@chakra-ui/react';
import { getTeamList, updateInviteResult } from '@/web/support/user/team/api';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useUserStore } from '@/web/support/user/useUserStore';

const UpdateInviteModal = () => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { toast } = useToast();
  const { feConfigs } = useSystemStore();
  const { initUserInfo } = useUserStore();

  const { ConfirmModal, openConfirm } = useConfirm({});

  const { data: inviteList = [], run: fetchInviteList } = useRequest2(
    async () => (feConfigs.isPlus ? getTeamList(TeamMemberStatusEnum.waiting) : []),
    {
      manual: false
    }
  );

  const { runAsync: onAccept, loading: isLoadingAccept } = useRequest2(updateInviteResult, {
    onSuccess() {
      toast({
        status: 'success',
        title: t('common:user.team.invite.Accepted')
      });
      fetchInviteList();
      initUserInfo();
    }
  });
  const { runAsync: onReject, loading: isLoadingReject } = useRequest2(updateInviteResult, {
    onSuccess() {
      toast({
        status: 'success',
        title: t('common:user.team.invite.Reject')
      });
      fetchInviteList();
      initUserInfo();
    }
  });

  return (
    <MyModal
      isOpen={inviteList && inviteList.length > 0}
      iconSrc="/imgs/modal/team.svg"
      title={
        <Box>
          <Box>{t('common:user.team.Processing invitations')}</Box>
          <Box fontWeight={'normal'} fontSize={'sm'} color={'myGray.500'}>
            {t('common:user.team.Processing invitations Tips', { amount: inviteList?.length })}
          </Box>
        </Box>
      }
      maxW={['90vw', '500px']}
    >
      <ModalBody>
        {inviteList?.map((item) => (
          <Flex
            key={item.teamId}
            alignItems={'center'}
            border={theme.borders.base}
            borderRadius={'md'}
            px={3}
            py={2}
            _notFirst={{
              mt: 3
            }}
          >
            <Avatar src={item.avatar} w={['16px', '23px']} />
            <Box mx={2}>{item.teamName}</Box>
            <Box flex={1} />
            <Button
              size="sm"
              variant={'solid'}
              colorScheme="green"
              isLoading={isLoadingAccept}
              onClick={() => {
                openConfirm(
                  () =>
                    onAccept({
                      tmbId: item.tmbId,
                      status: TeamMemberStatusEnum.active
                    }),
                  undefined,
                  t('common:user.team.invite.Accept Confirm')
                )();
              }}
            >
              {t('common:user.team.invite.accept')}
            </Button>
            <Button
              size="sm"
              ml={2}
              variant={'solid'}
              colorScheme="red"
              isLoading={isLoadingReject}
              onClick={() => {
                openConfirm(
                  () =>
                    onReject({
                      tmbId: item.tmbId,
                      status: TeamMemberStatusEnum.reject
                    }),
                  undefined,
                  t('common:user.team.invite.Reject Confirm')
                )();
              }}
            >
              {t('common:user.team.invite.reject')}
            </Button>
          </Flex>
        ))}
      </ModalBody>
      <ModalFooter justifyContent={'center'}>
        <Box>{t('common:user.team.invite.Deal Width Footer Tip')}</Box>
      </ModalFooter>

      <ConfirmModal />
    </MyModal>
  );
};

export default React.memo(UpdateInviteModal);
