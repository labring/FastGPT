import React, { useMemo } from 'react';
import { ModalBody, Box, Button, VStack, HStack, Link } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import Icon from '@fastgpt/web/components/common/Icon';
import Tag from '@fastgpt/web/components/common/Tag';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { balanceConversion } from '@/web/support/wallet/bill/api';
import { useUserStore } from '@/web/support/user/useUserStore';
import { formatStorePrice2Read } from '@fastgpt/global/support/wallet/usage/tools';
import { SUB_EXTRA_POINT_RATE } from '@fastgpt/global/support/wallet/bill/constants';
import { useRouter } from 'next/router';

const ConversionModal = ({
  onClose,
  onOpenContact
}: {
  onClose: () => void;
  onOpenContact: () => void;
}) => {
  const { t } = useTranslation();
  const { userInfo } = useUserStore();
  const router = useRouter();

  const points = useMemo(() => {
    if (!userInfo?.team?.balance) return 0;
    const balance = formatStorePrice2Read(userInfo?.team?.balance);

    return Math.ceil((balance / 15) * SUB_EXTRA_POINT_RATE);
  }, []);

  const { runAsync: onConvert, loading } = useRequest2(balanceConversion, {
    onSuccess() {
      router.reload();
    },
    successToast: t('account_info:exchange_success'),
    errorToast: t('account_info:exchange_failure')
  });

  return (
    <MyModal
      isOpen
      onClose={onClose}
      iconSrc="support/bill/wallet"
      iconColor="primary.600"
      title={t('account_info:usage_balance')}
    >
      <ModalBody maxW={'450px'}>
        <VStack px="2.25" gap={2} pb="6">
          <HStack px="4" py="2" color="primary.600" bgColor="primary.50" borderRadius="md">
            <Icon name="common/info" w="1rem" mr="1" />
            <Box fontSize={'mini'} fontWeight={'500'}>
              {t('account_info:usage_balance_notice')}
            </Box>
          </HStack>
          <VStack mt={6}>
            <Box fontSize={'sm'} color="myGray.600" fontWeight="500">
              {t('account_info:current_token_price')}
            </Box>
            <Box fontSize={'xl'} fontWeight={'700'} color="myGray.900">
              ￥15/1000 {t('account_info:tokens')}/{t('account_info:month')}
            </Box>
          </VStack>
          <VStack mt={6}>
            <Box fontSize={'sm'} color="myGray.600" fontWeight="500">
              {t('account_info:balance')}
            </Box>
            <Box fontSize={'xl'} fontWeight={'700'} color="myGray.900">
              ￥{formatStorePrice2Read(userInfo?.team?.balance)?.toFixed(2)}
            </Box>
          </VStack>
          <VStack mt={6}>
            <Box fontSize={'sm'} color="myGray.600" fontWeight="500">
              {t('account_info:you_can_convert')}
            </Box>
            <Box fontSize={'xl'} fontWeight={'700'} color="myGray.900">
              {points} {t('account_info:tokens')}
            </Box>
            <Tag fontSize={'xs'} fontWeight={'500'}>
              {t('account_info:token_validity_period')}
            </Tag>
          </VStack>

          <VStack mt="6">
            <Button
              variant={'primary'}
              alignItems={'center'}
              fontSize={'sm'}
              minW={'10rem'}
              onClick={onConvert}
              isLoading={loading}
            >
              {t('account_info:exchange')}
            </Button>
            <Link fontSize={'sm'} color="primary" mt="2" onClick={onOpenContact}>
              {t('account_info:contact_customer_service')}
            </Link>
          </VStack>
        </VStack>
      </ModalBody>
    </MyModal>
  );
};

export default ConversionModal;
