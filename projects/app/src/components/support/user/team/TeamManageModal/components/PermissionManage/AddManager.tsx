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

function AddManagerModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { t } = useTranslation();
  const { userT } = useI18n();
  const { members, refetchMembers } = useContextSelector(TeamModalContext, (v) => v);
  const [selected, setSelected] = useState<typeof members>([]);

  const { runAsync: submit, loading: isLoading } = useRequest2(
    async () =>
      updateMemberPermission({
        permission: ManagePermissionVal,
        tmbIds: selected.map((item) => {
          return item.tmbId;
        })
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
        <SelectMember members={members} selected={selected} setSelected={setSelected} />
      </ModalBody>
      <ModalFooter alignItems="flex-end">
        <Button h={'30px'} isLoading={isLoading} onClick={submit}>
          {t('common:common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
}

export default AddManagerModal;
