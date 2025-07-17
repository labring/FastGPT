import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { StandardSubLevelEnum } from '@fastgpt/global/support/wallet/sub/constants';
import { SubModeEnum } from '@fastgpt/global/support/wallet/sub/constants';
import React, { useMemo } from 'react';
import { standardSubLevelMap } from '@fastgpt/global/support/wallet/sub/constants';
import { Box, Flex, Grid } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import dynamic from 'next/dynamic';
import type { TeamSubSchema } from '@fastgpt/global/support/wallet/sub/type';

const ModelPriceModal = dynamic(() =>
  import('@/components/core/ai/ModelTable').then((mod) => mod.ModelPriceModal)
);

const StandardPlanContentList = ({
  level,
  mode,
  standplan
}: {
  level: `${StandardSubLevelEnum}`;
  mode: `${SubModeEnum}`;
  standplan?: TeamSubSchema;
}) => {
  const { t } = useTranslation();
  const { subPlans } = useSystemStore();

  const planContent = useMemo(() => {
    const plan = subPlans?.standard?.[level];

    if (!plan) return;
    return {
      price: plan.price * (mode === SubModeEnum.month ? 1 : 10),
      level: level as `${StandardSubLevelEnum}`,
      ...standardSubLevelMap[level as `${StandardSubLevelEnum}`],
      maxTeamMember: standplan?.maxTeamMember || plan.maxTeamMember,
      maxAppAmount: standplan?.maxApp || plan.maxAppAmount,
      maxDatasetAmount: standplan?.maxDataset || plan.maxDatasetAmount,
      chatHistoryStoreDuration: plan.chatHistoryStoreDuration,
      maxDatasetSize: plan.maxDatasetSize,
      permissionCustomApiKey: plan.permissionCustomApiKey,
      permissionCustomCopyright: plan.permissionCustomCopyright,
      trainingWeight: plan.trainingWeight,
      totalPoints: plan.totalPoints * (mode === SubModeEnum.month ? 1 : 12),
      permissionWebsiteSync: plan.permissionWebsiteSync,
      permissionTeamOperationLog: plan.permissionTeamOperationLog
    };
  }, [
    subPlans?.standard,
    level,
    mode,
    standplan?.maxTeamMember,
    standplan?.maxApp,
    standplan?.maxDataset
  ]);

  return planContent ? (
    <Grid gap={4} fontSize={'sm'} fontWeight={500}>
      <Flex alignItems={'center'}>
        <MyIcon name={'price/right'} w={'16px'} mr={3} />
        <Box color={'myGray.600'}>
          {t('common:support.wallet.subscription.function.Max members', {
            amount: planContent.maxTeamMember
          })}
        </Box>
      </Flex>
      <Flex alignItems={'center'}>
        <MyIcon name={'price/right'} w={'16px'} mr={3} />
        <Box color={'myGray.600'}>
          {t('common:support.wallet.subscription.function.Max app', {
            amount: planContent.maxAppAmount
          })}
        </Box>
      </Flex>
      <Flex alignItems={'center'}>
        <MyIcon name={'price/right'} w={'16px'} mr={3} />
        <Box color={'myGray.600'}>
          {t('common:support.wallet.subscription.function.Max dataset', {
            amount: planContent.maxDatasetAmount
          })}
        </Box>
      </Flex>
      <Flex alignItems={'center'}>
        <MyIcon name={'price/right'} w={'16px'} mr={3} />
        <Box color={'myGray.600'}>
          {t('common:support.wallet.subscription.function.History store', {
            amount: planContent.chatHistoryStoreDuration
          })}
        </Box>
      </Flex>
      <Flex alignItems={'center'}>
        <MyIcon name={'price/right'} w={'16px'} mr={3} />
        <Box fontWeight={'bold'} color={'myGray.600'}>
          {t('common:support.wallet.subscription.function.Max dataset size', {
            amount: planContent.maxDatasetSize
          })}
        </Box>
      </Flex>
      <Flex alignItems={'center'}>
        <MyIcon name={'price/right'} w={'16px'} mr={3} />
        <Flex alignItems={'center'}>
          <Box fontWeight={'bold'} color={'myGray.600'}>
            {t('common:support.wallet.subscription.function.Points', {
              amount: planContent.totalPoints
            })}
          </Box>
          <ModelPriceModal>
            {({ onOpen }) => (
              <QuestionTip
                ml={1}
                label={t('common:support.wallet.subscription.AI points click to read tip')}
                onClick={onOpen}
              />
            )}
          </ModelPriceModal>
        </Flex>
      </Flex>
      <Flex alignItems={'center'}>
        <MyIcon name={'price/right'} w={'16px'} mr={3} />
        <Box color={'myGray.600'}>
          {t('common:support.wallet.subscription.Training weight', {
            weight: planContent.trainingWeight
          })}
        </Box>
      </Flex>
      {!!planContent.permissionWebsiteSync && (
        <Flex alignItems={'center'}>
          <MyIcon name={'price/right'} w={'16px'} mr={3} />
          <Box color={'myGray.600'}>{t('common:support.wallet.subscription.web_site_sync')}</Box>
        </Flex>
      )}
      {!!planContent.permissionTeamOperationLog && (
        <Flex alignItems={'center'}>
          <MyIcon name={'price/right'} w={'16px'} mr={3} />
          <Box color={'myGray.600'}>
            {t('common:support.wallet.subscription.team_operation_log')}
          </Box>
        </Flex>
      )}
    </Grid>
  ) : null;
};

export default StandardPlanContentList;
