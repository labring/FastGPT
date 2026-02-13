import React, { useMemo, useState } from 'react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { Box, Button, Flex, ModalBody, ModalFooter, useDisclosure } from '@chakra-ui/react';
import { type NotSufficientModalType, useSystemStore } from '@/web/common/system/useSystemStore';
import ExtraPlan from '@/pageComponents/price/ExtraPlan';
import StandardPlan from '@/pageComponents/price/Standard';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { useUserStore } from '@/web/support/user/useUserStore';
import { standardSubLevelMap } from '@fastgpt/global/support/wallet/sub/constants';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { useMount } from 'ahooks';
import { useRouter } from 'next/router';

const NotSufficientModal = () => {
  const { t } = useTranslation();
  const { notSufficientModalType: type, setNotSufficientModalType } = useSystemStore();

  const onClose = () => setNotSufficientModalType(undefined);

  const {
    isOpen: isRechargeModalOpen,
    onOpen: onRechargeModalOpen,
    onClose: onRechargeModalClose
  } = useDisclosure();

  const textMap = {
    [TeamErrEnum.aiPointsNotEnough]: t('common:support.wallet.Not sufficient'),
    [TeamErrEnum.datasetSizeNotEnough]: t('common:support.wallet.Dataset_not_sufficient'),
    [TeamErrEnum.datasetAmountNotEnough]: t('common:support.wallet.Dataset_amount_not_sufficient'),
    [TeamErrEnum.teamMemberOverSize]: t('common:support.wallet.Team_member_over_size'),
    [TeamErrEnum.appAmountNotEnough]: t('common:support.wallet.App_amount_not_sufficient'),
    [TeamErrEnum.pluginAmountNotEnough]: t('common:support.wallet.App_amount_not_sufficient'),
    [TeamErrEnum.websiteSyncNotEnough]: t('common:code_error.team_error.website_sync_not_enough'),
    [TeamErrEnum.reRankNotEnough]: t('common:code_error.team_error.re_rank_not_enough'),
    [TeamErrEnum.ticketNotAvailable]: t('common:code_error.team_error.ticket_not_available')
  };

  return type ? (
    <>
      <MyModal isOpen iconSrc="common/confirm/deleteTip" title={t('common:Warning')} w={'420px'}>
        <ModalBody>{textMap[type]}</ModalBody>
        <ModalFooter>
          <Button variant={'whiteBase'} mr={2} onClick={onClose}>
            {t('common:Close')}
          </Button>
          <Button
            onClick={() => {
              onRechargeModalOpen();
            }}
          >
            {t('common:support.wallet.To read plan')}
          </Button>
        </ModalFooter>
      </MyModal>

      {isRechargeModalOpen && (
        <RechargeModal onClose={onRechargeModalClose} onPaySuccess={onClose} />
      )}
    </>
  ) : null;
};

export default NotSufficientModal;

export const RechargeModal = ({
  onClose,
  onPaySuccess
}: {
  onClose: () => void;
  onPaySuccess: () => void;
}) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { teamPlanStatus, initTeamPlanStatus } = useUserStore();
  const { subPlans } = useSystemStore();

  useMount(() => {
    initTeamPlanStatus();
  });

  const planName = useMemo(() => {
    if (!teamPlanStatus?.standard?.currentSubLevel) return '';
    return (
      subPlans?.standard?.[teamPlanStatus.standard.currentSubLevel]?.name ||
      t(standardSubLevelMap[teamPlanStatus.standard.currentSubLevel]?.label as any)
    );
  }, [teamPlanStatus?.standard?.currentSubLevel, subPlans?.standard, t]);

  const [tab, setTab] = useState<'standard' | 'extra'>('standard');

  return (
    <MyModal
      isOpen
      iconSrc="common/wallet"
      iconColor={'primary.600'}
      title={t('common:user.Pay')}
      onClose={onClose}
      isCentered
      minW={'90%'}
      maxH={'90%'}
    >
      <ModalBody px={'52px'}>
        <Flex alignItems={'center'} mb={6}>
          <Flex>
            <FormLabel fontSize={'16px'} fontWeight={'medium'} color={'myGray.900'}>
              {t('common:support.wallet.subscription.Current plan')}
            </FormLabel>
            <Box fontSize={'14px'} ml={5} color={'myGray.900'}>
              {t(planName as any)}
            </Box>
          </Flex>
          <Box flex={1} />
          <Button
            size={'md'}
            variant={'transparentBase'}
            color={'primary.700'}
            onClick={() => {
              router.push('/account/usage');
              onClose();
              onPaySuccess();
            }}
          >
            {t('common:usage_records')}
          </Button>
        </Flex>

        <Flex mb={6} gap={8} w={'100%'}>
          <Box flex={1}>
            <Flex gap={4} alignItems={'center'} mb={2}>
              <Box fontSize={'16px'} fontWeight={'medium'} color={'myGray.900'}>
                {t('common:support.wallet.subscription.AI points usage')}
              </Box>
              <Box
                fontSize={'14px'}
                fontWeight={'medium'}
              >{`${Math.round(teamPlanStatus?.usedPoints || 0)} / ${teamPlanStatus?.totalPoints ?? t('common:Unlimited')}`}</Box>
            </Flex>
            <Flex h={2} w={'full'} p={0.5} bg={'primary.50'} borderRadius={'md'}>
              <Box
                borderRadius={'sm'}
                transition="width 0.3s"
                w={`${teamPlanStatus?.totalPoints ? Math.max((teamPlanStatus.usedPoints / teamPlanStatus.totalPoints) * 100, 0) : 0}%`}
                bg={`${
                  teamPlanStatus?.totalPoints
                    ? (teamPlanStatus.usedPoints / teamPlanStatus.totalPoints) * 100 < 50
                      ? 'primary'
                      : (teamPlanStatus.usedPoints / teamPlanStatus.totalPoints) * 100 < 80
                        ? 'yellow'
                        : 'red'
                    : 'primary'
                }.500`}
              />
            </Flex>
          </Box>
          <Box flex={1}>
            <Flex gap={4} alignItems={'center'} mb={2}>
              <Box fontSize={'16px'} fontWeight={'medium'} color={'myGray.900'}>
                {t('common:support.user.team.Dataset usage')}
              </Box>
              <Box
                fontSize={'14px'}
                fontWeight={'medium'}
              >{`${teamPlanStatus?.usedDatasetIndexSize || 0} / ${teamPlanStatus?.datasetMaxSize ?? t('common:Unlimited')}`}</Box>
            </Flex>
            <Flex h={2} w={'full'} p={0.5} bg={'primary.50'} borderRadius={'md'}>
              <Box
                borderRadius={'sm'}
                transition="width 0.3s"
                w={`${teamPlanStatus?.datasetMaxSize ? Math.max((teamPlanStatus.usedDatasetIndexSize / teamPlanStatus.datasetMaxSize) * 100, 0) : 0}%`}
                bg={`${
                  teamPlanStatus?.datasetMaxSize
                    ? (teamPlanStatus.usedDatasetIndexSize / teamPlanStatus.datasetMaxSize) * 100 <
                      50
                      ? 'primary'
                      : (teamPlanStatus.usedDatasetIndexSize / teamPlanStatus.datasetMaxSize) *
                            100 <
                          80
                        ? 'yellow'
                        : 'red'
                    : 'primary'
                }.500`}
              />
            </Flex>
          </Box>
        </Flex>

        <FillRowTabs
          list={[
            { label: t('common:support.wallet.subscription.Sub plan'), value: 'standard' },
            { label: t('common:support.wallet.subscription.Extra plan'), value: 'extra' }
          ]}
          value={tab}
          onChange={(e) => {
            setTab(e as 'standard' | 'extra');
          }}
        />

        <Box
          mt={3}
          p={8}
          bg={'myGray.50'}
          border={'1px solid'}
          borderColor={'myGray.200'}
          rounded={'12px'}
        >
          {tab === 'standard' ? (
            <StandardPlan standardPlan={teamPlanStatus?.standard} onPaySuccess={onPaySuccess} />
          ) : (
            <ExtraPlan onPaySuccess={onPaySuccess} />
          )}
        </Box>
      </ModalBody>
    </MyModal>
  );
};
