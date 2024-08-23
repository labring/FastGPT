import React from 'react';
import { ModalBody, Box, Button, VStack, HStack, Link } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import Icon from '@fastgpt/web/components/common/Icon';
import Tag from '@fastgpt/web/components/common/Tag';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { balanceConversion } from '@/web/support/wallet/bill/api';
import Loading from '@fastgpt/web/components/common/MyLoading';

const ConversionModal = ({
  onClose,
  balance,
  tokens,
  onOpenContact
}: {
  onClose: () => void;
  balance: string;
  tokens: string;
  onOpenContact: () => void;
}) => {
  const { t } = useTranslation();

  const { runAsync: onConvert, loading } = useRequest2(balanceConversion, {
    successToast: t('user:bill.convert_success'),
    errorToast: t('user:bill.convert_error')
  });

  return (
    <MyModal
      isOpen
      onClose={onClose}
      iconSrc="support/bill/wallet"
      iconColor="primary.600"
      title={t('user:bill.use_balance')}
    >
      <ModalBody maxW={'450px'}>
        {loading && <Loading />}
        <VStack px="2.25" gap={2} pb="6">
          <HStack px="4" py="2" color="primary.600" bgColor="primary.50" borderRadius="md">
            <Icon name="common/info" w="1rem" mr="1" />
            <Box fontSize={'sm'}>{t('user:bill.use_balance_hint')}</Box>
          </HStack>
          <VStack mt={6}>
            <Box fontSize={'sm'} color="myGray.600" fontWeight="500">
              {t('user:bill.price')}
            </Box>
            <Box fontSize={'xl'} fontWeight={'700'} color="myGray.900">
              ￥15/1000 {t('user:bill.tokens')}
            </Box>
          </VStack>
          <VStack mt={6}>
            <Box fontSize={'sm'} color="myGray.600" fontWeight="500">
              {t('user:bill.balance')}
            </Box>
            <Box fontSize={'xl'} fontWeight={'700'} color="myGray.900">
              ￥{balance}
            </Box>
          </VStack>
          <VStack mt={6}>
            <Box fontSize={'sm'} color="myGray.600" fontWeight="500">
              {t('user:bill.you_can_convert')}
            </Box>
            <Box fontSize={'xl'} fontWeight={'700'} color="myGray.900">
              {tokens} {t('user:bill.tokens')}
            </Box>
            <Tag>{t('user:bill.token_expire_1year')}</Tag>
          </VStack>

          <VStack mt="6">
            <Button
              variant={'primary'}
              alignItems={'center'}
              fontSize={'sm'}
              minW={'10rem'}
              onClick={onConvert}
            >
              {t('user:bill.conversion')}
            </Button>
            <Link color="primary" mt="2" onClick={onOpenContact}>
              {t('user:bill.contact_customer_service')}
            </Link>
          </VStack>
        </VStack>
      </ModalBody>
    </MyModal>
  );
};

export default ConversionModal;
