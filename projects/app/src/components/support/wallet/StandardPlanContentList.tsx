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
      totalPoints:
        standplan?.totalPoints ?? plan.totalPoints * (mode === SubModeEnum.month ? 1 : 12),
      requestsPerMinute: standplan?.requestsPerMinute ?? plan.requestsPerMinute,
      maxTeamMember: standplan?.maxTeamMember ?? plan.maxTeamMember,
      maxAppAmount: standplan?.maxApp ?? plan.maxAppAmount,
      maxDatasetAmount: standplan?.maxDataset ?? plan.maxDatasetAmount,
      maxDatasetSize: standplan?.maxDatasetSize ?? plan.maxDatasetSize,
      websiteSyncPerDataset: standplan?.websiteSyncPerDataset ?? plan.websiteSyncPerDataset,
      chatHistoryStoreDuration:
        standplan?.chatHistoryStoreDuration ?? plan.chatHistoryStoreDuration,
      auditLogStoreDuration: standplan?.auditLogStoreDuration ?? plan.auditLogStoreDuration,
      appRegistrationCount: standplan?.appRegistrationCount ?? plan.appRegistrationCount,
      ticketResponseTime: standplan?.ticketResponseTime ?? plan.ticketResponseTime,
      customDomain: standplan?.customDomain ?? plan.customDomain
    };
  }, [
    subPlans?.standard,
    level,
    mode,
    standplan?.totalPoints,
    standplan?.requestsPerMinute,
    standplan?.maxTeamMember,
    standplan?.maxApp,
    standplan?.maxDataset,
    standplan?.maxDatasetSize,
    standplan?.websiteSyncPerDataset,
    standplan?.chatHistoryStoreDuration,
    standplan?.auditLogStoreDuration,
    standplan?.appRegistrationCount,
    standplan?.ticketResponseTime,
    standplan?.customDomain
  ]);

  return planContent ? (
    <Grid gap={4} fontSize={'sm'} fontWeight={500}>
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
        <Box fontWeight={'bold'} color={'myGray.600'}>
          {t('common:support.wallet.subscription.function.Max dataset size', {
            amount: planContent.maxDatasetSize
          })}
        </Box>
      </Flex>
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
      {!!planContent.auditLogStoreDuration && (
        <Flex alignItems={'center'}>
          <MyIcon name={'price/right'} w={'16px'} mr={3} />
          <Box color={'myGray.600'}>
            {t('common:support.wallet.subscription.function.Audit log store duration', {
              amount: planContent.auditLogStoreDuration
            })}
          </Box>
        </Flex>
      )}
      <Flex alignItems={'center'}>
        <MyIcon name={'price/right'} w={'16px'} mr={3} />
        <Box color={'myGray.600'}>
          {t('common:support.wallet.subscription.function.Requests per minute', {
            amount: planContent.requestsPerMinute
          })}
        </Box>
        <QuestionTip ml={1} label={t('common:support.wallet.subscription.function.qpm tip')} />
      </Flex>
      {!!planContent.websiteSyncPerDataset && (
        <Flex alignItems={'center'}>
          <MyIcon name={'price/right'} w={'16px'} mr={3} />
          <Box fontWeight={'bold'} color={'myGray.600'}>
            {t('common:support.wallet.subscription.function.Website sync per dataset', {
              amount: planContent.websiteSyncPerDataset
            })}
          </Box>
        </Flex>
      )}
      {!!planContent.ticketResponseTime && (
        <Flex alignItems={'center'}>
          <MyIcon name={'price/right'} w={'16px'} mr={3} />
          <Box color={'myGray.600'}>
            {t('common:support.wallet.subscription.function.Ticket response time', {
              amount: planContent.ticketResponseTime
            })}
          </Box>
        </Flex>
      )}
      {!!planContent.appRegistrationCount && (
        <Flex alignItems={'center'}>
          <MyIcon name={'price/right'} w={'16px'} mr={3} />
          <Box color={'myGray.600'}>
            {t('common:support.wallet.subscription.function.App registration count', {
              amount: planContent.appRegistrationCount
            })}
          </Box>
        </Flex>
      )}
      {planContent.customDomain !== undefined && (
        <Flex alignItems={'center'}>
          <MyIcon name={'price/right'} w={'16px'} mr={3} />
          <Box color={'myGray.600'}>
            {t('common:support.wallet.subscription.function.Custom domain', {
              amount: planContent.customDomain
            })}
          </Box>
          <QuestionTip
            ml={1}
            label={t('common:support.wallet.subscription.function.custom domain tip')}
          />
        </Flex>
      )}
    </Grid>
  ) : null;
};

export default StandardPlanContentList;
