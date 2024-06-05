import React, { useMemo, useState } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { Box, Button, Flex, Grid, ModalBody, ModalFooter } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { StandardSubLevelEnum, SubModeEnum } from '@fastgpt/global/support/wallet/sub/constants';
import { postCheckStandardSub, postUpdateStandardSub } from '@/web/support/wallet/sub/api';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { standardSubLevelMap } from '@fastgpt/global/support/wallet/sub/constants';
import { StandardSubPlanParams } from '@fastgpt/global/support/wallet/sub/api';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { StandardSubPlanUpdateResponse } from '@fastgpt/global/support/wallet/sub/api.d';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { formatStorePrice2Read } from '@fastgpt/global/support/wallet/usage/tools';
import { TeamSubSchema } from '@fastgpt/global/support/wallet/sub/type';
import MyModal from '@fastgpt/web/components/common/MyModal';
import QRCodePayModal, { type QRPayProps } from '@/components/support/wallet/QRCodePayModal';
import { getWxPayQRCode } from '@/web/support/wallet/bill/api';
import { BillTypeEnum } from '@fastgpt/global/support/wallet/bill/constants';
import StandardPlanContentList from '@/components/support/wallet/StandardPlanContentList';
import { useRouter } from 'next/router';

type ConfirmPayModalProps = {
  teamBalance: number;
  totalPrice: number;
  payPrice: number;

  planProps: StandardSubPlanParams;
};

const Standard = ({
  standardPlan,
  refetchTeamSubPlan
}: {
  standardPlan?: TeamSubSchema;
  refetchTeamSubPlan: () => void;
}) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { subPlans, feConfigs } = useSystemStore();
  const [confirmPayData, setConfirmPayData] = useState<ConfirmPayModalProps>();
  const [selectSubMode, setSelectSubMode] = useState<`${SubModeEnum}`>(SubModeEnum.month);

  const standardSubList = useMemo(() => {
    return subPlans?.standard
      ? Object.entries(subPlans.standard).map(([level, value]) => {
          return {
            price: value.price * (selectSubMode === SubModeEnum.month ? 1 : 10),
            level: level as `${StandardSubLevelEnum}`,
            ...standardSubLevelMap[level as `${StandardSubLevelEnum}`],
            maxTeamMember: value.maxTeamMember,
            maxAppAmount: value.maxAppAmount,
            maxDatasetAmount: value.maxDatasetAmount,
            chatHistoryStoreDuration: value.chatHistoryStoreDuration,
            maxDatasetSize: value.maxDatasetSize,
            permissionCustomApiKey: value.permissionCustomApiKey,
            permissionCustomCopyright: value.permissionCustomCopyright,
            trainingWeight: value.trainingWeight,
            permissionReRank: value.permissionReRank,
            totalPoints: value.totalPoints * (selectSubMode === SubModeEnum.month ? 1 : 12),
            permissionWebsiteSync: value.permissionWebsiteSync
          };
        })
      : [];
  }, [subPlans?.standard, selectSubMode]);

  const { mutate: onclickUpdateStandardPlan, isLoading: isUpdatingStandardPlan } = useRequest({
    mutationFn: (data: StandardSubPlanParams) => postUpdateStandardSub(data),
    onSuccess() {
      refetchTeamSubPlan();
      router.reload();
    },
    successToast: t('support.wallet.subscription.Standard update success'),
    errorToast: t('support.wallet.subscription.Standard update fail')
  });

  const { mutate: onclickPreCheckStandPlan, isLoading: isCheckingStandardPlan } = useRequest({
    mutationFn: (data: StandardSubPlanParams) => postCheckStandardSub(data),
    onSuccess(res: StandardSubPlanUpdateResponse) {
      if (res.payPrice === undefined) {
        onclickUpdateStandardPlan({
          level: res.nextSubLevel,
          mode: res.nextMode
        });
      } else {
        setConfirmPayData({
          teamBalance: res.teamBalance,
          totalPrice: res.planPrice,
          payPrice: res.payPrice,
          planProps: {
            level: res.nextSubLevel,
            mode: res.nextMode
          }
        });
      }
    }
  });

  return (
    <Flex flexDirection={'column'} alignItems={'center'} position={'relative'}>
      <Box fontWeight={'bold'} fontSize={['24px', '36px']}>
        {t('support.wallet.subscription.Sub plan')}
      </Box>
      <Box mt={8} mb={10} color={'myGray.500'} fontSize={'md'}>
        {t('support.wallet.subscription.Sub plan tip', {
          title: feConfigs?.systemTitle
        })}
      </Box>
      <Box>
        <RowTabs
          list={[
            { label: t('support.wallet.subscription.mode.Month'), value: SubModeEnum.month },
            {
              label: (
                <Flex>
                  {t('support.wallet.subscription.mode.Year')}
                  <Box color={selectSubMode === SubModeEnum.month ? 'red.600' : 'auto'}>
                    ({t('support.wallet.subscription.mode.Year sale')})
                  </Box>
                </Flex>
              ),
              value: SubModeEnum.year
            }
          ]}
          value={selectSubMode}
          onChange={(e) => setSelectSubMode(e as `${SubModeEnum}`)}
        />
      </Box>
      {/* card */}
      <Grid
        mt={[10, '48px']}
        gridTemplateColumns={['1fr', 'repeat(2,1fr)', 'repeat(4,1fr)']}
        gap={[4, 6, 8]}
        w={'100%'}
        maxW={'1440px'}
        minH={'550px'}
      >
        {standardSubList.map((item) => {
          const isCurrentPlan =
            item.level === standardPlan?.currentSubLevel &&
            selectSubMode === standardPlan?.currentMode;

          return (
            <Box
              key={item.level}
              flex={'1 0 0'}
              bg={'rgba(255, 255, 255, 0.90)'}
              p={'28px'}
              borderRadius={'2xl'}
              borderWidth={'1.5px'}
              boxShadow={'1.5'}
              {...(isCurrentPlan
                ? {
                    borderColor: 'primary.600'
                  }
                : {
                    borderColor: 'myGray.150'
                  })}
            >
              <Box fontSize={'md'} fontWeight={'500'}>
                {t(item.label)}
              </Box>
              <Box fontSize={['32px', '42px']} fontWeight={'bold'}>
                ￥{item.price}
              </Box>
              <Box color={'myGray.500'} h={'40px'} fontSize={'xs'}>
                {t(item.desc, { title: feConfigs?.systemTitle })}
              </Box>
              {(() => {
                if (
                  item.level === StandardSubLevelEnum.free &&
                  selectSubMode === SubModeEnum.year
                ) {
                  return (
                    <Button isDisabled mt={4} mb={6} w={'100%'} variant={'solid'}>
                      {t('support.wallet.subscription.Nonsupport')}
                    </Button>
                  );
                }
                if (
                  item.level === standardPlan?.nextSubLevel &&
                  selectSubMode === standardPlan?.nextMode
                ) {
                  return (
                    <Button mt={4} mb={6} w={'100%'} variant={'whiteBase'} isDisabled>
                      {t('support.wallet.subscription.Next plan')}
                    </Button>
                  );
                }
                if (isCurrentPlan) {
                  return (
                    <Button
                      mt={4}
                      mb={6}
                      w={'100%'}
                      variant={'whiteBase'}
                      isDisabled={
                        item.level === standardPlan?.nextSubLevel &&
                        selectSubMode === standardPlan?.nextMode
                      }
                      onClick={() =>
                        onclickPreCheckStandPlan({
                          level: item.level,
                          mode: selectSubMode
                        })
                      }
                    >
                      {t('support.wallet.subscription.Current plan')}
                    </Button>
                  );
                }

                return (
                  <Button
                    mt={4}
                    mb={6}
                    w={'100%'}
                    variant={'primaryGhost'}
                    isLoading={isUpdatingStandardPlan || isCheckingStandardPlan}
                    onClick={() =>
                      onclickPreCheckStandPlan({
                        level: item.level,
                        mode: selectSubMode
                      })
                    }
                  >
                    {t('support.wallet.subscription.Buy now')}
                  </Button>
                );
              })()}

              {/* function list */}
              <StandardPlanContentList level={item.level} mode={selectSubMode} />
            </Box>
          );
        })}
      </Grid>

      {!!confirmPayData && (
        <ConfirmPayModal
          {...confirmPayData}
          onClose={() => setConfirmPayData(undefined)}
          onConfirmPay={() => onclickUpdateStandardPlan(confirmPayData.planProps)}
        />
      )}
    </Flex>
  );
};

export default React.memo(Standard);

const RowTabs = ({
  list,
  value,
  onChange
}: {
  list: {
    icon?: string;
    label: string | React.ReactNode;
    value: string;
  }[];
  value: string;
  onChange: (e: string) => void;
}) => {
  return (
    <Box
      display={'inline-flex'}
      px={'3px'}
      py={'3px'}
      borderRadius={'md'}
      borderWidth={'1px'}
      borderColor={'primary.300'}
      bg={'primary.50'}
      gap={'4px'}
    >
      {list.map((item) => (
        <Flex
          key={item.value}
          alignItems={'center'}
          justifyContent={'center'}
          cursor={'pointer'}
          borderRadius={'md'}
          px={'12px'}
          py={'7px'}
          userSelect={'none'}
          w={['150px', '170px']}
          {...(value === item.value
            ? {
                color: 'white',
                boxShadow: '1.5',
                bg: 'primary.600'
              }
            : {
                onClick: () => onChange(item.value)
              })}
        >
          {item.icon && <MyIcon name={item.icon as any} mr={1} w={'14px'} />}
          <Box>{item.label}</Box>
        </Flex>
      ))}
    </Box>
  );
};

const ConfirmPayModal = ({
  teamBalance,
  totalPrice,
  payPrice,
  onClose,
  onConfirmPay
}: ConfirmPayModalProps & { onClose: () => void; onConfirmPay: () => void }) => {
  const { t } = useTranslation();
  const [qrPayData, setQRPayData] = useState<QRPayProps>();

  const formatPayPrice = Math.ceil(formatStorePrice2Read(payPrice));
  const formatTeamBalance = Math.floor(formatStorePrice2Read(teamBalance));

  const { mutate: handleClickPay, isLoading } = useRequest({
    mutationFn: async (amount: number) => {
      // 获取支付二维码
      return getWxPayQRCode({
        type: BillTypeEnum.balance,
        balance: amount
      });
    },
    onSuccess(res) {
      setQRPayData({
        readPrice: res.readPrice,
        codeUrl: res.codeUrl,
        billId: res.billId
      });
    }
  });

  return (
    <MyModal
      isOpen
      iconSrc="modal/confirmPay"
      title={t('support.wallet.Confirm pay')}
      onClose={onClose}
    >
      <ModalBody py={5} px={9}>
        <Flex>
          <Box flex={'0 0 100px'}>新套餐价格</Box>
          <Box>{formatStorePrice2Read(totalPrice)}元</Box>
        </Flex>
        <Flex mt={6}>
          <Box flex={'0 0 100px'}>旧套餐余额</Box>
          <Box>{Math.floor(formatStorePrice2Read(totalPrice - payPrice))}元</Box>
        </Flex>
        <Flex mt={6}>
          <Box flex={'0 0 100px'}>需支付</Box>
          <Box>{formatPayPrice}元</Box>
        </Flex>
      </ModalBody>
      <ModalFooter
        borderTopWidth={'1px'}
        borderTopColor={'borderColor.base'}
        mx={9}
        justifyContent={'flex-start'}
        px={0}
      >
        <Box>账号余额: </Box>
        <Box ml={2} flex={1}>
          {formatTeamBalance}元
        </Box>
        {teamBalance >= payPrice ? (
          <Button size={'sm'} onClick={onConfirmPay}>
            确认支付
          </Button>
        ) : (
          <Button
            size={'sm'}
            isLoading={isLoading}
            onClick={() => {
              handleClickPay(Math.ceil(formatStorePrice2Read(payPrice - teamBalance)));
            }}
          >
            余额不足，去充值
          </Button>
        )}
      </ModalFooter>

      {!!qrPayData && <QRCodePayModal {...qrPayData} onSuccess={onConfirmPay} />}
    </MyModal>
  );
};
