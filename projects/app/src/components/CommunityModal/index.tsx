import React from 'react';
import { Button, ModalFooter, ModalBody } from '@chakra-ui/react';
import MyModal from '../MyModal';
import { useTranslation } from 'next-i18next';
import Markdown from '../Markdown';
import { feConfigs } from '@/web/common/system/staticData';

const CommunityModal = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  return (
    <MyModal
      isOpen={true}
      onClose={onClose}
      iconSrc="/imgs/modal/concat.svg"
      title={t('home.Community')}
    >
      <ModalBody textAlign={'center'}>
        <Markdown source={feConfigs?.concatMd || ''} />
      </ModalBody>

      <ModalFooter>
        <Button variant={'whiteBase'} onClick={onClose}>
          关闭
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default CommunityModal;
