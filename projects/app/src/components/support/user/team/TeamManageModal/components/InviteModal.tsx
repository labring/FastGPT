import React, { useState } from 'react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { ModalCloseButton, ModalBody, Box, ModalFooter, Button } from '@chakra-ui/react';
import TagTextarea from '@/components/common/Textarea/TagTextarea';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { postInviteTeamMember } from '@/web/support/user/team/api';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import type { InviteMemberResponse } from '@fastgpt/global/support/user/team/controller.d';

const InviteModal = ({
  teamId,
  onClose,
  onSuccess
}: {
  teamId: string;
  onClose: () => void;
  onSuccess: () => void;
}) => {
  const { t } = useTranslation();
  const { ConfirmModal, openConfirm } = useConfirm({
    title: t('common:user.team.Invite Member Result Tip'),
    showCancel: false
  });

  const [inviteUsernames, setInviteUsernames] = useState<string[]>([]);

  const { runAsync: onInvite, loading: isLoading } = useRequest2(
    () =>
      postInviteTeamMember({
        teamId,
        usernames: inviteUsernames
      }),
    {
      onSuccess(res: InviteMemberResponse) {
        onSuccess();
        openConfirm(
          () => onClose(),
          undefined,
          <Box whiteSpace={'pre-wrap'}>
            {t('user.team.Invite Member Success Tip', {
              success: res.invite.length,
              inValid: res.inValid.map((item) => item.username).join(', '),
              inTeam: res.inTeam.map((item) => item.username).join(', ')
            })}
          </Box>
        )();
      },
      errorToast: t('common:user.team.Invite Member Failed Tip')
    }
  );

  return (
    <MyModal
      isOpen
      iconSrc="common/inviteLight"
      iconColor="primary.600"
      title={
        <Box>
          <Box>{t('common:user.team.Invite Member')}</Box>
          <Box color={'myGray.500'} fontSize={'xs'} fontWeight={'normal'}>
            {t('common:user.team.Invite Member Tips')}
          </Box>
        </Box>
      }
      maxW={['90vw', '400px']}
      overflow={'unset'}
    >
      <ModalCloseButton onClick={onClose} />
      <ModalBody>
        <Box mb={2}>{t('common:user.Account')}</Box>
        <TagTextarea defaultValues={inviteUsernames} onUpdate={setInviteUsernames} />
      </ModalBody>
      <ModalFooter>
        <Button
          w={'100%'}
          h={'34px'}
          isDisabled={inviteUsernames.length === 0}
          isLoading={isLoading}
          onClick={onInvite}
        >
          {t('common:user.team.Confirm Invite')}
        </Button>
      </ModalFooter>
      <ConfirmModal />
    </MyModal>
  );
};

export default InviteModal;
