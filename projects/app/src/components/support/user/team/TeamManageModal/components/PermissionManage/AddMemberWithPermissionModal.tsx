import { Button, ModalBody, ModalCloseButton, ModalFooter } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import React from 'react';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { updateMemberPermission } from '@/web/support/user/team/api';
import {
  ManagePermissionVal,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';
import { TeamModalContext } from '../../context';
import { useI18n } from '@/web/context/I18n';
import SelectMember from '../SelectMember';
import { useForm } from 'react-hook-form';

type addType = 'writer' | 'manager';

function AddManagerModal({
  onClose,
  onSuccess,
  addType
}: {
  onClose: () => void;
  onSuccess: () => void;
  addType: addType;
}) {
  const { t } = useTranslation();
  const { members, refetchMembers, groups, refetchGroups, refetchClbs } = useContextSelector(
    TeamModalContext,
    (v) => v
  );
  const { control, handleSubmit } = useForm({
    defaultValues: {
      managers: {
        member: [],
        group: []
      }
    }
  });

  const { runAsync: submit, loading: isLoading } = useRequest2(
    ({ member, group }) =>
      updateMemberPermission({
        members: member,
        groups: group,
        permission: addType === 'manager' ? ManagePermissionVal : WritePermissionVal
      }),
    {
      onSuccess: () => Promise.all([refetchMembers(), refetchGroups(), onSuccess(), refetchClbs()])
    }
  );

  return (
    <MyModal
      isOpen
      isCentered
      iconSrc={'modal/AddClb'}
      minW={['90vw', '900px']}
      h={'600px'}
      title={t('user:team.Add manager')}
    >
      <ModalCloseButton onClick={onClose} />
      <ModalBody py={6} px={10} flex={'1 0 0'} h={0}>
        <SelectMember
          allMembers={{
            member: members.map((item) => ({ ...item, type: 'member' })),
            group: groups.map((item) => ({ ...item, type: 'group' }))
          }}
          control={control as any}
          mode="both"
          name="managers"
        />
      </ModalBody>
      <ModalFooter alignItems="flex-end">
        <Button
          h={'30px'}
          isLoading={isLoading}
          onClick={handleSubmit((data) => submit(data.managers))}
        >
          {t('common:common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
}

export default AddManagerModal;
