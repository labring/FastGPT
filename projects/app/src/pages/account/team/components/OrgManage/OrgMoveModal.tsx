import { putMoveOrg } from '@/web/support/user/team/org/api';
import { Button, ModalBody, ModalFooter } from '@chakra-ui/react';
import type { OrgType } from '@fastgpt/global/support/user/team/org/type';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { useMemo, useState } from 'react';
import OrgTree from './OrgTree';
import dynamic from 'next/dynamic';
import { useUserStore } from '@/web/support/user/useUserStore';

function OrgMoveModal({
  movingOrg,
  orgs,
  onClose,
  onSuccess
}: {
  movingOrg: OrgType;
  orgs: OrgType[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const [selectedOrg, setSelectedOrg] = useState<OrgType>();
  const { userInfo } = useUserStore();
  const team = userInfo?.team!;

  const { runAsync: onMoveOrg, loading } = useRequest2(putMoveOrg, {
    onSuccess: () => {
      onClose();
      onSuccess();
    }
  });

  const filterMovingOrgs = useMemo(
    () => orgs.filter((org) => org._id !== movingOrg._id),
    [movingOrg._id, orgs]
  );

  return (
    <MyModal
      isOpen
      onClose={onClose}
      title={t('account_team:move_org')}
      iconSrc="common/file/move"
      iconColor="primary.600"
    >
      <ModalBody>
        <OrgTree
          orgs={filterMovingOrgs}
          selectedOrg={selectedOrg}
          setSelectedOrg={setSelectedOrg}
        />
      </ModalBody>
      <ModalFooter>
        <Button
          isDisabled={!selectedOrg}
          isLoading={loading}
          onClick={() => {
            if (!selectedOrg) return;
            return onMoveOrg({
              orgId: movingOrg._id,
              targetOrgId: selectedOrg._id
            });
          }}
        >
          {t('common:common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
}

export default OrgMoveModal;
