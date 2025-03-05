import { getInvitationInfo, postAcceptInvitationLink } from '@/web/support/user/team/api';
import { Box, Button, Flex, ModalBody } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import { useCallback } from 'react';
import { useContextSelector } from 'use-context-selector';
import { TeamContext } from './context';

function Invite({ invitelinkid }: { invitelinkid: string }) {
  const router = useRouter();
  const { t } = useTranslation();

  const { refetchTeams } = useContextSelector(TeamContext, (v) => v);

  const onClose = () => {
    refetchTeams();
    router.push('/account/team');
    router.reload();
  };

  const { data: invitationInfo } = useRequest2(() => getInvitationInfo(invitelinkid), {
    manual: false,
    onError: onClose
  });

  const { runAsync: acceptInvitation } = useRequest2(() => postAcceptInvitationLink(invitelinkid), {
    manual: true,
    successToast: t('common:common.Success'),
    onFinally: onClose
  });

  return (
    <>
      {invitationInfo && (
        <MyModal
          isOpen={true}
          iconSrc="support/user/usersLight"
          title={t('account_team:handle_invitation')}
          iconColor={'primary.600'}
        >
          <ModalBody>
            <Flex
              key={invitationInfo._id}
              alignItems={'center'}
              border={'1px solid'}
              borderColor={'myGray.200'}
              borderRadius={'md'}
              px={3}
              py={2}
            >
              <Avatar src={invitationInfo.teamAvatar} w={['16px', '23px']} />
              <Box mx={2}>{invitationInfo.teamName}</Box>
              <Box flex={1} />
              <Button size="sm" variant={'solid'} colorScheme="green" onClick={acceptInvitation}>
                {t('common:user.team.invite.accept')}
              </Button>
              <Button size="sm" ml={2} variant="outline" onClick={onClose}>
                {t('account_team:ignore')}
              </Button>
            </Flex>
          </ModalBody>
        </MyModal>
      )}
    </>
  );
}

export default Invite;
