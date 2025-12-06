import React, { useState } from 'react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { Box, Flex, Button, ModalBody } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useUserStore } from '@/web/support/user/useUserStore';
import dayjs from 'dayjs';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getDiscountCouponList } from '@/web/support/wallet/sub/discountCoupon/api';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { useRouter } from 'next/router';
import MyImage from '@fastgpt/web/components/common/Image/MyImage';
import MyIcon from '@fastgpt/web/components/common/Icon';
import BillDetailModal from '@/pageComponents/account/bill/BillDetailModal';
import { DiscountCouponStatusEnum } from '@fastgpt/global/support/wallet/sub/discountCoupon/constants';

const DiscountCouponsModal = ({ onClose }: { onClose: () => void }) => {
  const { t, i18n } = useTranslation();
  const { userInfo } = useUserStore();
  const router = useRouter();
  const isZh = i18n.language === 'zh-CN';
  const [billId, setBillId] = useState<string>();
  const teamId = userInfo?.team?.teamId;

  const { data: coupons = [], loading } = useRequest2(
    async () => {
      if (!teamId) return [];
      return getDiscountCouponList(teamId);
    },
    {
      manual: !teamId,
      refreshDeps: [teamId]
    }
  );

  const getStatusText = (status: DiscountCouponStatusEnum) => {
    const statusTextMap = {
      [DiscountCouponStatusEnum.active]: '',
      [DiscountCouponStatusEnum.expired]: `(${t('account_info:expired')})`,
      [DiscountCouponStatusEnum.notStart]: `(${t('account_info:not_started_tips')})`,
      [DiscountCouponStatusEnum.used]: `(${t('account_info:used_tips')})`
    };

    return statusTextMap[status];
  };

  return (
    <MyModal
      isOpen
      onClose={onClose}
      title={t('account_info:discount_coupon')}
      isLoading={loading}
      maxW={'900px'}
    >
      <ModalBody minH={'200px'} px={6} py={4}>
        {coupons.length > 0 ? (
          <Flex flexDirection={'column'} gap={6}>
            {coupons.map((coupon) => {
              return (
                <Box
                  key={coupon._id}
                  position={'relative'}
                  filter={'drop-shadow(0 4px 20.2px rgba(14, 66, 187, 0.12))'}
                >
                  <Flex alignItems={'stretch'} position={'relative'} minH={'96px'}>
                    <Flex
                      px={2}
                      bg={'white'}
                      flex={1}
                      alignItems={'center'}
                      borderRight={'1px dashed'}
                      borderColor={'myGray.300'}
                      sx={{
                        WebkitMask: `
                          radial-gradient(circle at 0 0, transparent 8px, white 8px) top left,
                          radial-gradient(circle at 100% 0, transparent 4px, white 4px) top right,
                          radial-gradient(circle at 0 100%, transparent 8px, white 8px) bottom left,
                          radial-gradient(circle at 100% 100%, transparent 4px, white 4px) bottom right
                        `,
                        WebkitMaskSize: '51% 51%',
                        WebkitMaskRepeat: 'no-repeat',
                        mask: `
                          radial-gradient(circle at 0 0, transparent 8px, white 8px) top left,
                          radial-gradient(circle at 100% 0, transparent 4px, white 4px) top right,
                          radial-gradient(circle at 0 100%, transparent 8px, white 8px) bottom left,
                          radial-gradient(circle at 100% 100%, transparent 4px, white 4px) bottom right
                        `,
                        maskSize: '51% 51%',
                        maskRepeat: 'no-repeat'
                      }}
                    >
                      <Box
                        w={20}
                        h={20}
                        bg={'#F9FAFE'}
                        mr={2}
                        opacity={coupon.status === DiscountCouponStatusEnum.active ? 1 : 0.6}
                      >
                        <MyImage src={isZh ? coupon.iconZh : coupon.iconEn} alt={coupon.name} />
                      </Box>

                      <Box flex={1} pr={4}>
                        <Box
                          fontSize={'18px'}
                          fontWeight={'600'}
                          color={
                            coupon.status === DiscountCouponStatusEnum.active
                              ? 'primary.600'
                              : 'myGray.500'
                          }
                          mb={1}
                        >
                          {`${getStatusText(coupon.status as DiscountCouponStatusEnum)}
                            ${t(coupon.name)}`}
                        </Box>
                        <Box fontSize={'mini'} color={'myGray.500'}>
                          {t(coupon.description)}
                        </Box>
                      </Box>
                    </Flex>

                    <Flex
                      flexDir={'column'}
                      justifyContent={'center'}
                      w={'141px'}
                      px={'15px'}
                      bg={'white'}
                      sx={{
                        WebkitMask: `
                          radial-gradient(circle at 0 0, transparent 4px, white 4px) top left,
                          radial-gradient(circle at 100% 0, transparent 8px, white 8px) top right,
                          radial-gradient(circle at 0 100%, transparent 4px, white 4px) bottom left,
                          radial-gradient(circle at 100% 100%, transparent 8px, white 8px) bottom right
                        `,
                        WebkitMaskSize: '51% 51%',
                        WebkitMaskRepeat: 'no-repeat',
                        mask: `
                          radial-gradient(circle at 0 0, transparent 4px, white 4px) top left,
                          radial-gradient(circle at 100% 0, transparent 8px, white 8px) top right,
                          radial-gradient(circle at 0 100%, transparent 4px, white 4px) bottom left,
                          radial-gradient(circle at 100% 100%, transparent 8px, white 8px) bottom right
                        `,
                        maskSize: '51% 51%',
                        maskRepeat: 'no-repeat'
                      }}
                    >
                      {coupon.usedAt ? (
                        <Box
                          fontSize={'10px'}
                          fontWeight={'medium'}
                          color={'myGray.500'}
                          mb={1}
                          mx={'auto'}
                        >
                          {`${t('account_info:used_time')}: `}
                          {dayjs(coupon.usedAt).format('YYYY-MM-DD')}
                        </Box>
                      ) : (
                        <Box
                          fontSize={'10px'}
                          fontWeight={'medium'}
                          color={'myGray.500'}
                          mb={1}
                          mx={'auto'}
                        >
                          {`${t('account_info:expiration_time')}: `}
                          {dayjs(coupon.expiredTime).format('YYYY-MM-DD')}
                        </Box>
                      )}
                      {coupon.status === DiscountCouponStatusEnum.active ? (
                        <Button
                          variant={'primary'}
                          size={'md'}
                          onClick={() => router.push('/price')}
                          leftIcon={<MyIcon name={'common/arrowRight'} w={4} />}
                        >
                          {t('account_info:use')}
                        </Button>
                      ) : coupon.status === DiscountCouponStatusEnum.expired ? (
                        <Box
                          mx={'auto'}
                          fontSize={'10px'}
                          fontWeight={'medium'}
                          color={'myGray.500'}
                        >
                          {t('account_info:expired_tips')}
                        </Box>
                      ) : coupon.status === DiscountCouponStatusEnum.notStart ? (
                        <Box
                          mx={'auto'}
                          fontSize={'10px'}
                          fontWeight={'medium'}
                          color={'myGray.500'}
                        >
                          {t('account_info:not_started_tips')}
                        </Box>
                      ) : coupon.status === DiscountCouponStatusEnum.used ? (
                        <Box
                          mx={'auto'}
                          fontSize={'10px'}
                          fontWeight={'medium'}
                          cursor={coupon.billId ? 'pointer' : 'not-allowed'}
                          color={coupon.billId ? 'primary.600' : 'myGray.500'}
                          onClick={() => {
                            router.push('/account/bill');
                          }}
                        >
                          {t('account_info:check_purchase_history')}
                        </Box>
                      ) : null}
                    </Flex>
                  </Flex>
                </Box>
              );
            })}
          </Flex>
        ) : (
          <EmptyTip py={4} />
        )}
        <Flex justifyContent={'flex-end'} mt={6}>
          <Button variant={'whiteBase'} onClick={onClose}>
            {t('common:Close')}
          </Button>
        </Flex>
      </ModalBody>
      {!!billId && <BillDetailModal billId={billId} onClose={() => setBillId(undefined)} />}
    </MyModal>
  );
};

export default DiscountCouponsModal;
