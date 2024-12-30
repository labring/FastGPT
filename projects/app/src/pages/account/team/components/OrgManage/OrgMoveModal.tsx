import { putMoveOrg, putMoveOrgMember } from '@/web/support/user/team/org/api';
import { Button, ModalBody, ModalFooter } from '@chakra-ui/react';
import type { OrgType } from '@fastgpt/global/support/user/team/org/type';
import type { TeamTmbItemType } from '@fastgpt/global/support/user/team/type';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';
import OrgTree from './OrgTree';

function OrgMoveModal({
  movingOrg,
  movingTmb,
  orgs,
  team,
  onClose,
  onSuccess
}: {
  movingOrg?: OrgType;
  movingTmb?: { tmbId: string; orgId: string };
  orgs: OrgType[];
  team: TeamTmbItemType;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const [selectedOrg, selectOrg] = useState<OrgType>();

  const { runAsync: moveOrg, loading: loadingOrg } = useRequest2(putMoveOrg, {
    onSuccess: () => {
      onClose();
      onSuccess();
    }
  });

  const { runAsync: moveTmb, loading: loadingTmb } = useRequest2(putMoveOrgMember, {
    onSuccess: () => {
      onClose();
      onSuccess();
    }
  });

  const handleConfirm = () => {
    if (!selectedOrg) return;
    if (movingTmb) {
      moveTmb({ orgId: movingTmb.orgId, tmbId: movingTmb.tmbId, newOrgId: selectedOrg._id });
    } else if (movingOrg) {
      moveOrg(movingOrg._id, selectedOrg._id);
    }
  };

  const loading = loadingOrg || loadingTmb;

  return (
    <MyModal
      isOpen={!!movingOrg || !!movingTmb}
      onClose={onClose}
      title={movingOrg ? t('account_team:move_org') : t('account_team:move_member')}
      iconSrc="common/file/move"
      iconColor="blue.600"
    >
      <ModalBody>
        <OrgTree
          orgs={orgs}
          teamName={team.teamName}
          teamAvatar={team.avatar}
          selectedOrg={selectedOrg}
          selectOrg={selectOrg}
        />
      </ModalBody>
      <ModalFooter>
        <Button isDisabled={!selectedOrg} isLoading={loading} onClick={() => handleConfirm()}>
          {t('common:common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
}

export default OrgMoveModal;
