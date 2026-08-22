import { putMoveOrg } from '@/web/support/user/team/org/api';
import { Button } from '@chakra-ui/react';
import type { OrgListItemType } from '@fastgpt/global/support/user/team/org/type';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import { useState } from 'react';
import OrgTree from './OrgTree';

function OrgMoveModal({
  movingOrg,
  onClose,
  onSuccess
}: {
  movingOrg: OrgListItemType;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useClientTranslation('account_team');
  const [selectedOrg, setSelectedOrg] = useState<OrgListItemType>();

  const { runAsync: onMoveOrg, loading } = useRequest(putMoveOrg, {
    onSuccess: () => {
      onClose();
      onSuccess();
    }
  });

  return (
    <MyModal
      isOpen
      onClose={onClose}
      title={t('account_team:move_org')}
      footer={
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
          {t('common:Confirm')}
        </Button>
      }
    >
      <OrgTree selectedOrg={selectedOrg} setSelectedOrg={setSelectedOrg} movingOrg={movingOrg} />
    </MyModal>
  );
}

export default OrgMoveModal;
