import React, { useCallback } from 'react';
import { Box, Button } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { enterpriseAuthContactBusinessUrl } from './utils';
import { webPushTrack } from '@/web/common/middle/tracks/utils';

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
      w={['90vw', '400px']}
      minW={['90vw', '400px']}
      maxW={'90vw'}
      borderRadius={'10px'}
      boxShadow={'0px 0px 1px rgba(19, 51, 107, 0.1), 0px 4px 10px rgba(19, 51, 107, 0.1)'}
      title={t('account_team:enterprise_auth_title')}
      headerStyles={{
        px: '32px',
        pt: '32px'
      }}
      bodyStyles={{
        px: '32px',
        pt: '24px',
        pb: 0
      }}
      footerStyles={{
        px: '32px',
        pt: '24px',
        pb: '32px',
        justifyContent: 'flex-end',
        gap: '12px'
      }}
      footer={
        <>
          <Button
            h={'32px'}
            w={'64px'}
            px={'14px'}
            fontSize={'12px'}
            variant={'whiteBase'}
            onClick={onClose}
          >
            {t('account_team:enterprise_auth_cancel')}
          </Button>
          <Button
            h={'32px'}
            px={'14px'}
            fontSize={'12px'}
            bg={'#3370FF'}
            color={'white'}
            onClick={openContactBusiness}
            _hover={{ bg: '#2152D9' }}
            _active={{ bg: '#1F4CCF' }}
          >
            {t('account_team:enterprise_auth_contact_business')}
          </Button>
        </>
      }
    >
      <Box color={'#000'} fontSize={'14px'} lineHeight={'20px'} letterSpacing={'0.25px'}>
        {t('account_team:enterprise_auth_no_remaining_times_tip')}
      </Box>
    </MyModal>
  );
};

export default React.memo(EnterpriseAuthContactBusinessModal);
