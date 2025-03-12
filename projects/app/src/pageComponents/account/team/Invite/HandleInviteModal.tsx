import { getInvitationInfo, postAcceptInvitationLink } from '@/web/support/user/team/api';
import { Box, Button, Flex, ModalBody, ModalCloseButton } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import { useContextSelector } from 'use-context-selector';
import { TeamContext } from '../context';

function Invite({ invitelinkid }: { invitelinkid: string }) {
  const router = useRouter();
  const { t } = useTranslation();

  const { onSwitchTeam } = useContextSelector(TeamContext, (v) => v);

  const onClose = () => {
    router.push('/account/team');
  };

  const { data: invitationInfo } = useRequest2(() => getInvitationInfo(invitelinkid), {
    manual: false,
    onError: onClose
  });

  const { runAsync: acceptInvitation, loading: accepting } = useRequest2(
    () => postAcceptInvitationLink(invitelinkid),
    {
      manual: true,
      successToast: t('common:common.Success'),
      onSuccess: async () => {
        onSwitchTeam(invitationInfo!.teamId);
        onClose();
      }
    }
  );

  return invitationInfo ? (
    <MyModal
      isOpen={true}
      iconSrc="support/user/usersLight"
      title={t('account_team:handle_invitation')}
      iconColor={'primary.600'}
    >
      <ModalCloseButton onClick={onClose} />
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
          <Button
            size="sm"
            variant={'solid'}
            colorScheme="green"
            onClick={acceptInvitation}
            isLoading={accepting}
          >
            {t('account_team:accept')}
          </Button>
          <Button size="sm" ml={2} variant="outline" onClick={onClose} isLoading={accepting}>
            {t('account_team:ignore')}
          </Button>
        </Flex>
      </ModalBody>
    </MyModal>
  ) : null;
}

export default Invite;
