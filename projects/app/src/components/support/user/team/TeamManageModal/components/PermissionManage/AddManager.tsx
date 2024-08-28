import { Button, ModalBody, ModalCloseButton, ModalFooter } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import React, { useState } from 'react';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { updateMemberPermission } from '@/web/support/user/team/api';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { TeamModalContext } from '../../context';
import { useI18n } from '@/web/context/I18n';
import SelectMember from '../SelectMember';
import { useForm } from 'react-hook-form';

function AddManagerModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { t } = useTranslation();
  const { userT } = useI18n();
  const { members, refetchMembers } = useContextSelector(TeamModalContext, (v) => v);
  const { control, handleSubmit } = useForm<{ members: string[] }>();

  const { runAsync: submit, loading: isLoading } = useRequest2(
    async (members: string[]) =>
      updateMemberPermission({
        permission: ManagePermissionVal,
        tmbIds: members
      }),
    {
      onSuccess: () => {
        refetchMembers();
        onSuccess();
      }
    }
  );

  return (
    <MyModal
      isOpen
      iconSrc={'modal/AddClb'}
      maxW={['90vw']}
      minW={['900px']}
      overflow={'unset'}
      title={userT('team.Add manager')}
    >
      <ModalCloseButton onClick={onClose} />
      <ModalBody py={6} px={10}>
        <SelectMember allMembers={members} control={control as any} />
      </ModalBody>
      <ModalFooter alignItems="flex-end">
        <Button
          h={'30px'}
          isLoading={isLoading}
          onClick={handleSubmit((data) => submit(data.members))}
        >
          {t('common:common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
}

export default AddManagerModal;
