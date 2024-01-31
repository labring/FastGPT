import React, { useMemo, useState } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { Box, Button, Flex, Grid } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { StandardSubLevelEnum, SubModeEnum } from '@fastgpt/global/support/wallet/sub/constants';
import { useUserStore } from '@/web/support/user/useUserStore';
import { postCheckStandardSub, postUpdateStandardSub } from '@/web/support/wallet/sub/api';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { standardSubLevelMap } from '@fastgpt/global/support/wallet/sub/constants';
import { StandardSubPlanParams } from '@fastgpt/global/support/wallet/sub/api';
import { useRequest } from '@/web/common/hooks/useRequest';
import { StandardSubPlanUpdateResponse } from '@fastgpt/global/support/wallet/sub/api.d';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useConfirm } from '@/web/common/hooks/useConfirm';
import { formatStorePrice2Read } from '@fastgpt/global/support/wallet/bill/tools';
import { TeamSubSchema } from '@fastgpt/global/support/wallet/sub/type';

const Standard = ({
  standardPlan,
  refetchTeamSubPlan
}: {
  standardPlan?: TeamSubSchema;
  refetchTeamSubPlan: () => void;
}) => {
  const { t } = useTranslation();
  const { subPlans, feConfigs } = useSystemStore();
  const { toast } = useToast();
  const { ConfirmModal, openConfirm } = useConfirm({});

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
            customApiKey: value.customApiKey,
            customCopyright: value.customCopyright,
            trainingWeight: value.trainingWeight,
            reRankWeight: value.reRankWeight,
            totalPoints: value.totalPoints * (selectSubMode === SubModeEnum.month ? 1 : 12),
            websiteSyncInterval: value.websiteSyncInterval
          };
        })
      : [];
  }, [subPlans?.standard, selectSubMode]);

  const { mutate: onclickUpdateStandardPlan, isLoading: isUpdatingStandardPlan } = useRequest({
    mutationFn: (data: StandardSubPlanParams) => postUpdateStandardSub(data),
    onSuccess() {
      refetchTeamSubPlan();
    },
    successToast: t('support.wallet.subscription.Standard update success'),
    errorToast: t('support.wallet.subscription.Standard update fail')
  });

  const { mutate: onclickPreCheckStandPlan, isLoading: isCheckingStandardPlan } = useRequest({
    mutationFn: (data: StandardSubPlanParams) => postCheckStandardSub(data),
    onSuccess(res: StandardSubPlanUpdateResponse) {
      if (!res.balanceEnough) {
        return toast({
          status: 'warning',
          title: t('support.wallet.Balance not enough tip')
        });
      }
      if (res.payPrice === undefined) {
        onclickUpdateStandardPlan({
          level: res.nextSubLevel,
          mode: res.nextMode
        });
      } else if (res.payPrice > 0) {
        openConfirm(
          () =>
            onclickUpdateStandardPlan({
              level: res.nextSubLevel,
              mode: res.nextMode
            }),
          undefined,
          t('support.wallet.subscription.Standard plan pay confirm', {
            payPrice: formatStorePrice2Read(res.payPrice).toFixed(2)
          })
        )();
      } else {
        openConfirm(
          () =>
            onclickUpdateStandardPlan({
              level: res.nextSubLevel,
              mode: res.nextMode
            }),
          undefined,
          t('support.wallet.subscription.Refund plan and pay confirm', {
            amount: formatStorePrice2Read(Math.abs(res.payPrice)).toFixed(2)
          })
        )();
      }
    }
  });

  return (
    <Flex flexDirection={'column'} alignItems={'center'} position={'relative'}>
      <Box fontWeight={'bold'} fontSize={['24px', '36px']}>
        {t('support.wallet.subscription.Sub plan')}
      </Box>
      <Box mt={8} mb={10} color={'myGray.500'} fontSize={'lg'}>
        {t('support.wallet.subscription.Sub plan tip')}
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
      >
        {standardSubList.map((item) => (
          <Box
            key={item.level}
            bg={'rgba(255, 255, 255, 0.90)'}
            p={'28px'}
            borderRadius={'2xl'}
            borderWidth={'1px'}
            borderColor={'myGray.150'}
            boxShadow={'1.5'}
          >
            <Box fontSize={'lg'} fontWeight={'500'}>
              {t(item.label)}
            </Box>
            <Box fontSize={['32px', '42px']} fontWeight={'bold'}>
              ￥{item.price}
            </Box>
            <Box color={'myGray.500'} h={'40px'}>
              {t(item.desc, { title: feConfigs?.systemTitle })}
            </Box>
            {(() => {
              if (item.level === StandardSubLevelEnum.free && selectSubMode === SubModeEnum.year) {
                return (
                  <Button isDisabled mt={4} mb={6} w={'100%'} variant={'solid'}>
                    {t('support.wallet.subscription.Nonsupport')}
                  </Button>
                );
              }
              if (
                item.level === standardPlan?.currentSubLevel &&
                selectSubMode === standardPlan?.currentMode
              ) {
                return (
                  <Button mt={4} mb={6} w={'100%'} variant={'whiteBase'} isDisabled>
                    {t('support.wallet.subscription.Current plan')}
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
            <Grid gap={4}>
              <Flex alignItems={'center'}>
                <MyIcon name={'price/right'} w={'16px'} mr={3} />
                <Box color={'myGray.600'}>
                  {t('support.wallet.subscription.function.Max members', {
                    amount: item.maxTeamMember
                  })}
                </Box>
              </Flex>
              <Flex alignItems={'center'}>
                <MyIcon name={'price/right'} w={'16px'} mr={3} />
                <Box color={'myGray.600'}>
                  {t('support.wallet.subscription.function.Max app', {
                    amount: item.maxAppAmount
                  })}
                </Box>
              </Flex>
              <Flex alignItems={'center'}>
                <MyIcon name={'price/right'} w={'16px'} mr={3} />
                <Box color={'myGray.600'}>
                  {t('support.wallet.subscription.function.Max dataset', {
                    amount: item.maxDatasetAmount
                  })}
                </Box>
              </Flex>
              <Flex alignItems={'center'}>
                <MyIcon name={'price/right'} w={'16px'} mr={3} />
                <Box color={'myGray.600'}>
                  {t('support.wallet.subscription.function.History store', {
                    amount: item.chatHistoryStoreDuration
                  })}
                </Box>
              </Flex>
              <Flex alignItems={'center'}>
                <MyIcon name={'price/right'} w={'16px'} mr={3} />
                <Box color={'myGray.600'}>
                  {t('support.wallet.subscription.function.Max dataset size', {
                    amount: item.maxDatasetSize
                  })}
                </Box>
              </Flex>
              <Flex alignItems={'center'}>
                <MyIcon name={'price/right'} w={'16px'} mr={3} />
                <Box color={'myGray.600'}>
                  {t('support.wallet.subscription.function.Points', {
                    amount: item.totalPoints
                  })}
                </Box>
              </Flex>
              <Flex alignItems={'center'}>
                <MyIcon name={'price/right'} w={'16px'} mr={3} />
                <Box color={'myGray.600'}>
                  {t('support.wallet.subscription.Training weight', {
                    weight: item.trainingWeight
                  })}
                </Box>
              </Flex>
              {!!item.customApiKey && (
                <Flex alignItems={'center'}>
                  <MyIcon name={'price/right'} w={'16px'} mr={3} />
                  <Box color={'myGray.600'}>个人API Key</Box>
                </Flex>
              )}
              {!!item.websiteSyncInterval && (
                <Flex alignItems={'center'}>
                  <MyIcon name={'price/right'} w={'16px'} mr={3} />
                  <Box color={'myGray.600'}>{item.websiteSyncInterval} h/次 web站点同步</Box>
                </Flex>
              )}
            </Grid>
          </Box>
        ))}
      </Grid>

      <ConfirmModal />
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
