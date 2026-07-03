import React, { useCallback } from 'react';
import { Box, Button } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { enterpriseAuthContactBusinessUrl } from './utils';
import { webPushTrack } from '@/web/common/middle/tracks/utils';
import { enterpriseAuthFooterButtonStyles } from './shared';

type EnterpriseAuthContactBusinessModalProps = {
  onClose: () => void;
};

const EnterpriseAuthContactBusinessModal = ({
  onClose
}: EnterpriseAuthContactBusinessModalProps) => {
  const { t } = useTranslation();

  const openContactBusiness = useCallback(() => {
    webPushTrack.enterpriseAuthContactBusiness({
      source: 'contactBusinessModal'
    });
    window.open(enterpriseAuthContactBusinessUrl, '_blank', 'noopener,noreferrer');
    onClose();
  }, [onClose]);

  return (
    <MyModal
      isOpen
      onClose={onClose}
      isCentered
      size={'sm'}
      title={t('account_team:enterprise_auth_title')}
      footer={
        <>
          <Button
            variant={'whiteBase'}
            w={'64px'}
            onClick={onClose}
            {...enterpriseAuthFooterButtonStyles}
          >
            {t('account_team:enterprise_auth_cancel')}
          </Button>
          <Button onClick={openContactBusiness} {...enterpriseAuthFooterButtonStyles}>
            {t('account_team:enterprise_auth_contact_business')}
          </Button>
        </>
      }
    >
      <Box>{t('account_team:enterprise_auth_no_remaining_times_tip')}</Box>
    </MyModal>
  );
};

export default React.memo(EnterpriseAuthContactBusinessModal);
