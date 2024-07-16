import React from 'react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { Button, ModalBody, ModalFooter } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useSystemStore } from '@/web/common/system/useSystemStore';

const NotSufficientModal = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { setIsNotSufficientModal } = useSystemStore();

  const onClose = () => setIsNotSufficientModal(false);

  return (
    <MyModal isOpen iconSrc="common/confirm/deleteTip" title={t('common:common.Warning')}>
      <ModalBody>{t('common:support.wallet.Not sufficient')}</ModalBody>
      <ModalFooter>
        <Button variant={'whiteBase'} mr={2} onClick={onClose}>
          {t('common:common.Close')}
        </Button>
        <Button
          onClick={() => {
            router.push('/account');
            onClose();
          }}
        >
          {t('common:support.wallet.To read plan')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default NotSufficientModal;
