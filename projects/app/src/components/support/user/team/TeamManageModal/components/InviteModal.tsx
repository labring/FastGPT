import React, { useMemo, useState } from 'react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { ModalCloseButton, ModalBody, Box, ModalFooter, Button } from '@chakra-ui/react';
import TagTextarea from '@/components/common/Textarea/TagTextarea';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { postInviteTeamMember } from '@/web/support/user/team/api';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import type { InviteMemberResponse } from '@fastgpt/global/support/user/team/controller.d';
import MySelect from '@fastgpt/web/components/common/MySelect';
import {
  ManagePermissionVal,
  ReadPermissionVal,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';
import { useI18n } from '@/web/context/I18n';
import { useUserStore } from '@/web/support/user/useUserStore';

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
  const { userT } = useI18n();
  const { ConfirmModal, openConfirm } = useConfirm({
    title: t('user.team.Invite Member Result Tip'),
    showCancel: false
  });
  const { userInfo } = useUserStore();

  const [inviteUsernames, setInviteUsernames] = useState<string[]>([]);
  const inviteTypes = useMemo(
    () => [
      {
        label: userT('permission.Read'),
        description: userT('permission.Read desc'),
        value: ReadPermissionVal
      },
      {
        label: userT('permission.Write'),
        description: userT('permission.Write tip'),
        value: WritePermissionVal
      },
      ...(userInfo?.team?.permission.isOwner
        ? [
            {
              label: userT('permission.Manage'),
              description: userT('permission.Manage tip'),
              value: ManagePermissionVal
            }
          ]
        : [])
    ],
    [userInfo?.team?.permission.isOwner, userT]
  );
  const [selectedInviteType, setSelectInviteType] = useState(inviteTypes[0].value);

  const { mutate: onInvite, isLoading } = useRequest({
    mutationFn: () => {
      return postInviteTeamMember({
        teamId,
        usernames: inviteUsernames,
        permission: selectedInviteType
      });
    },
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
        <Box mb={2}>{t('user.Account')}</Box>
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
