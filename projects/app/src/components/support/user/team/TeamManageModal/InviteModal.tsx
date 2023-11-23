import React, { useMemo, useState } from 'react';
import MyModal from '@/components/MyModal';
import { useTranslation } from 'next-i18next';
import { ModalCloseButton, ModalBody, Box, ModalFooter, Button } from '@chakra-ui/react';
import TagTextarea from '@/components/common/Textarea/TagTextarea';
import MySelect from '@/components/Select';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';
import { useRequest } from '@/web/common/hooks/useRequest';
import { postInviteTeamMember } from '@/web/support/user/team/api';
import { useConfirm } from '@/web/common/hooks/useConfirm';
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
    title: t('user.team.Invite Member Result Tip'),
    showCancel: false
  });
  const [inviteUsernames, setInviteUsernames] = useState<string[]>([]);
  const inviteTypes = useMemo(
    () => [
      {
        alias: t('user.team.Invite Role Visitor Alias'),
        label: t('user.team.Invite Role Visitor Tip'),
        value: TeamMemberRoleEnum.visitor
      },
      {
        alias: t('user.team.Invite Role Admin Alias'),
        label: t('user.team.Invite Role Admin Tip'),
        value: TeamMemberRoleEnum.admin
      }
    ],
    [t]
  );
  const [selectedInviteType, setSelectInviteType] = useState(inviteTypes[0].value);

  const { mutate: onInvite, isLoading } = useRequest({
    mutationFn: () => {
      return postInviteTeamMember({
        teamId,
        usernames: inviteUsernames,
        role: selectedInviteType
      });
    },
    onSuccess(res: InviteMemberResponse) {
      onSuccess();
      openConfirm(
        () => onClose(),
        undefined,
        t('user.team.Invite Member Success Tip', {
          success: res.invite.length,
          inValid: res.inValid.map((item) => item.username).join(', '),
          inTeam: res.inTeam.map((item) => item.username).join(', ')
        })
      )();
    },
    errorToast: t('user.team.Invite Member Failed Tip')
  });

  return (
    <MyModal
      isOpen
      iconSrc="/imgs/modal/team.svg"
      title={
        <Box>
          <Box>{t('user.team.Invite Member')}</Box>
          <Box color={'myGray.500'} fontSize={'xs'} fontWeight={'normal'}>
            {t('user.team.Invite Member Tips')}
          </Box>
        </Box>
      }
      maxW={['90vw', '400px']}
      overflow={'unset'}
    >
      <ModalCloseButton onClick={onClose} />
      <ModalBody>
        <Box mb={2}>{t('common.Username')}</Box>
        <TagTextarea defaultValues={inviteUsernames} onUpdate={setInviteUsernames} />
        <Box mt={4}>
          <MySelect list={inviteTypes} value={selectedInviteType} onchange={setSelectInviteType} />
        </Box>
      </ModalBody>
      <ModalFooter>
        <Button
          w={'100%'}
          h={'34px'}
          isDisabled={inviteUsernames.length === 0}
          isLoading={isLoading}
          onClick={onInvite}
        >
          {t('user.team.Confirm Invite')}
        </Button>
      </ModalFooter>
      <ConfirmModal />
    </MyModal>
  );
};

export default InviteModal;
