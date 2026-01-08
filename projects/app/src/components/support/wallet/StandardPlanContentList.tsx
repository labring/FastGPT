import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { StandardSubLevelEnum } from '@fastgpt/global/support/wallet/sub/constants';
import { SubModeEnum } from '@fastgpt/global/support/wallet/sub/constants';
import React, { useMemo } from 'react';
import { standardSubLevelMap } from '@fastgpt/global/support/wallet/sub/constants';
import { Box, Flex, Grid, Text } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import dynamic from 'next/dynamic';
import type { TeamSubSchemaType } from '@fastgpt/global/support/wallet/sub/type';
import Markdown from '@/components/Markdown';
import MyPopover from '@fastgpt/web/components/common/MyPopover';

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
  standplan?: TeamSubSchemaType;
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
      annualBonusPoints:
        mode === SubModeEnum.month ? 0 : standplan?.annualBonusPoints ?? plan.annualBonusPoints,
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
    standplan?.annualBonusPoints,
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
        <MyIcon
          name={'price/right'}
          w={'16px'}
          mr={3}
          color={planContent.annualBonusPoints ? '#BB182C' : 'primary.600'}
        />
        <Flex alignItems={'center'}>
          {planContent.annualBonusPoints ? (
            <>
              <Text fontWeight={'bold'} color={'myGray.600'} textDecoration={'line-through'} mr={1}>
                {planContent.totalPoints}
              </Text>
              <Text fontWeight={'bold'} color={'#DF531E'}>
                {planContent.totalPoints + planContent.annualBonusPoints}
              </Text>
              <Text color={'myGray.600'} ml={1}>
                {t('common:support.wallet.subscription.point')}
              </Text>
            </>
          ) : (
            <Box fontWeight={'bold'} color={'myGray.600'} display={'flex'}>
              <Text>{planContent.totalPoints}</Text>
              <Text ml={1}>{t('common:support.wallet.subscription.point')}</Text>
            </Box>
          )}
          <ModelPriceModal>
            {({ onOpen }) => (
              <QuestionTip ml={1} label={t('common:aipoint_desc')} onClick={onOpen} />
            )}
          </ModelPriceModal>
        </Flex>
      </Flex>
      <Flex alignItems={'center'}>
        <MyIcon name={'price/right'} w={'16px'} mr={3} color={'primary.600'} />
        <Box fontWeight={'bold'} color={'myGray.600'}>
          {t('common:n_dataset_size', {
            amount: planContent.maxDatasetSize
          })}
        </Box>
      </Flex>
      <Flex alignItems={'center'}>
        <MyIcon name={'price/right'} w={'16px'} mr={3} color={'primary.600'} />
        <Box color={'myGray.600'}>
          {t('common:n_team_members', {
            amount: planContent.maxTeamMember
          })}
        </Box>
      </Flex>
      <Flex alignItems={'center'}>
        <MyIcon name={'price/right'} w={'16px'} mr={3} color={'primary.600'} />
        <Box color={'myGray.600'}>
          {t('common:n_agent_amount', {
            amount: planContent.maxAppAmount
          })}
        </Box>
      </Flex>
      <Flex alignItems={'center'}>
        <MyIcon name={'price/right'} w={'16px'} mr={3} color={'primary.600'} />
        <Box color={'myGray.600'}>
          {t('common:n_dataset_amount', {
            amount: planContent.maxDatasetAmount
          })}
        </Box>
      </Flex>
      <Flex alignItems={'center'}>
        <MyIcon name={'price/right'} w={'16px'} mr={3} color={'primary.600'} />
        <Box color={'myGray.600'}>
          {t('common:n_chat_records_retain', {
            amount: planContent.chatHistoryStoreDuration
          })}
        </Box>
      </Flex>
      {!!planContent.auditLogStoreDuration && (
        <Flex alignItems={'center'}>
          <MyIcon name={'price/right'} w={'16px'} mr={3} color={'primary.600'} />
          <Box color={'myGray.600'}>
            {t('common:n_team_audit_day', {
              amount: planContent.auditLogStoreDuration
            })}
          </Box>
        </Flex>
      )}
      <Flex alignItems={'center'}>
        <MyIcon name={'price/right'} w={'16px'} mr={3} color={'primary.600'} />
        <Box color={'myGray.600'}>
          {t('common:n_team_qpm', {
            amount: planContent.requestsPerMinute
          })}
        </Box>
        <QuestionTip ml={1} label={t('common:qpm_desc')} />
      </Flex>
      {!!planContent.websiteSyncPerDataset && (
        <Flex alignItems={'center'}>
          <MyIcon name={'price/right'} w={'16px'} mr={3} color={'primary.600'} />
          <Box fontWeight={'bold'} color={'myGray.600'}>
            {t('common:n_website_sync_max_pages', {
              amount: planContent.websiteSyncPerDataset
            })}
          </Box>
        </Flex>
      )}
      <Flex alignItems={'center'}>
        <MyIcon name={'price/right'} w={'16px'} mr={3} color={'primary.600'} />
        <Box color={'myGray.600'}>
          {planContent.ticketResponseTime
            ? t('common:worker_order_support_time', {
                amount: planContent.ticketResponseTime
              })
            : t('common:community_support')}
        </Box>
        {subPlans?.communitySupportTip && !planContent.ticketResponseTime && (
          <MyPopover
            trigger="hover"
            placement="bottom"
            offset={[0, 10]}
            Trigger={
              <Flex alignItems={'center'}>
                <MyIcon name={'help' as any} w={'16px'} color={'myGray.500'} ml={1} />
              </Flex>
            }
          >
            {({ onClose }) => (
              <Box maxW="300px" p={3}>
                <Markdown source={subPlans.communitySupportTip} />
              </Box>
            )}
          </MyPopover>
        )}
      </Flex>
      {!!planContent.appRegistrationCount && (
        <Flex alignItems={'center'}>
          <MyIcon name={'price/right'} w={'16px'} mr={3} color={'primary.600'} />
          <Box color={'myGray.600'}>
            {t('common:n_app_registration_amount', {
              amount: planContent.appRegistrationCount
            })}
          </Box>
        </Flex>
      )}
      {planContent.customDomain !== undefined && (
        <Flex alignItems={'center'}>
          <MyIcon name={'price/right'} w={'16px'} mr={3} color={'primary.600'} />
          <Box color={'myGray.600'}>
            {t('common:n_custom_domain_amount', {
              amount: planContent.customDomain
            })}
          </Box>
          <QuestionTip ml={1} label={t('common:n_custom_domain_amount_tip')} />
        </Flex>
      )}
    </Grid>
  ) : null;
};

export default StandardPlanContentList;
