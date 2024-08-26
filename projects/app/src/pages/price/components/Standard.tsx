import React, { useMemo, useState } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { Box, Button, Flex, Grid } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { StandardSubLevelEnum, SubModeEnum } from '@fastgpt/global/support/wallet/sub/constants';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { standardSubLevelMap } from '@fastgpt/global/support/wallet/sub/constants';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { TeamSubSchema } from '@fastgpt/global/support/wallet/sub/type';
import QRCodePayModal, { type QRPayProps } from '@/components/support/wallet/QRCodePayModal';
import { getWxPayQRCode } from '@/web/support/wallet/bill/api';
import { BillTypeEnum } from '@fastgpt/global/support/wallet/bill/constants';
import StandardPlanContentList from '@/components/support/wallet/StandardPlanContentList';
import { useRouter } from 'next/router';
import { useToast } from '@fastgpt/web/hooks/useToast';

const Standard = ({
  standardPlan: myStandardPlan,
  refetchTeamSubPlan
}: {
  standardPlan?: TeamSubSchema;
  refetchTeamSubPlan: () => void;
}) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();

  const { subPlans, feConfigs } = useSystemStore();
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

  // Pay code
  const [qrPayData, setQRPayData] = useState<QRPayProps>();

  /* Get pay code */
  const { runAsync: onPay, loading: isLoading } = useRequest2(getWxPayQRCode, {
    onSuccess(res) {
      setQRPayData({
        readPrice: res.readPrice,
        codeUrl: res.codeUrl,
        billId: res.billId
      });
    }
  });

  return (
    <Flex flexDirection={'column'} alignItems={'center'} position={'relative'}>
      <Box fontWeight={'bold'} fontSize={['24px', '36px']}>
        {t('common:support.wallet.subscription.Sub plan')}
      </Box>
      <Box mt={8} mb={10} color={'myGray.500'} fontSize={'md'}>
        {t('common:support.wallet.subscription.Sub plan tip', {
          title: feConfigs?.systemTitle
        })}
      </Box>
      <Box>
        <RowTabs
          list={[
            { label: t('common:support.wallet.subscription.mode.Month'), value: SubModeEnum.month },
            {
              label: (
                <Flex>
                  {t('common:support.wallet.subscription.mode.Year')}
                  <Box color={selectSubMode === SubModeEnum.month ? 'red.600' : 'auto'}>
                    ({t('common:support.wallet.subscription.mode.Year sale')})
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
          const isCurrentPlan = item.level === myStandardPlan?.currentSubLevel;

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
                {t(item.desc as any, { title: feConfigs?.systemTitle })}
              </Box>

              {/* Button */}
              {(() => {
                if (item.level === StandardSubLevelEnum.free) {
                  return (
                    <Button isDisabled mt={4} mb={6} w={'100%'} variant={'solid'}>
                      {t('common:support.wallet.subscription.Nonsupport')}
                    </Button>
                  );
                }
                // feature:
                // if (
                //   item.level === myStandardPlan?.nextSubLevel &&
                //   selectSubMode === myStandardPlan?.nextMode
                // ) {
                //   return (
                //     <Button mt={4} mb={6} w={'100%'} variant={'whiteBase'} isDisabled>
                //       {t('common:support.wallet.subscription.Next plan')}
                //     </Button>
                //   );
                // }
                if (isCurrentPlan) {
                  return (
                    <Button
                      mt={4}
                      mb={6}
                      w={'100%'}
                      variant={'primary'}
                      isLoading={isLoading}
                      onClick={() => {
                        onPay({
                          type: BillTypeEnum.standSubPlan,
                          level: item.level,
                          subMode: selectSubMode
                        });
                      }}
                    >
                      {t('user:bill.renew_plan')}
                    </Button>
                  );
                }

                return (
                  <Button
                    mt={4}
                    mb={6}
                    w={'100%'}
                    variant={'primaryGhost'}
                    isLoading={isLoading}
                    onClick={() =>
                      onPay({
                        type: BillTypeEnum.standSubPlan,
                        level: item.level,
                        subMode: selectSubMode
                      })
                    }
                  >
                    {t('user:bill.buy_plan')}
                  </Button>
                );
              })()}

              {/* function list */}
              <StandardPlanContentList level={item.level} mode={selectSubMode} />
            </Box>
          );
        })}
      </Grid>

      {!!qrPayData && <QRCodePayModal tip="您正在购买订阅套餐" {...qrPayData} />}
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
