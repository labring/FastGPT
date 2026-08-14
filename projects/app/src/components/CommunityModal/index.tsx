import React from 'react';
import { Button, ModalFooter, ModalBody } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import Markdown from '../Markdown';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';

const CommunityModal = ({ onClose }: { onClose: () => void }) => {
  const { t } = useClientTranslation();
  const { feConfigs } = useSystemStore();
  const { userInfo } = useUserStore();
  const isWecomTeam = !!userInfo?.team.isWecomTeam;

  return (
    <MyModal
      isOpen={true}
      onClose={onClose}
      iconSrc="modal/concat"
      title={t('common:system.Concat us')}
    >
      <ModalBody textAlign={'center'}>
        {isWecomTeam ? (
          '邮箱联系: archer@fastgpt.io'
        ) : (
          <Markdown source={feConfigs?.concatMd || ''} />
        )}
      </ModalBody>

      <ModalFooter>
        <Button variant={'whiteBase'} onClick={onClose}>
          {t('common:Close')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default CommunityModal;
