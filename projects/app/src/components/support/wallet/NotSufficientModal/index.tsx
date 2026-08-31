import React, { useMemo, useState } from 'react';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import { Box, Button, Flex, useDisclosure } from '@chakra-ui/react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import ExtraPlan from '@/pageComponents/price/ExtraPlan';
import StandardPlan, { BillingModeSwitch } from '@/pageComponents/price/Standard';
import PricePlanTabs from '@/pageComponents/price/PricePlanTabs';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { useUserStore } from '@/web/support/user/useUserStore';
import { standardSubLevelMap, SubModeEnum } from '@fastgpt/global/support/wallet/sub/constants';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { useMount } from 'ahooks';
import { useRouter } from 'next/router';
import { subRoute } from '@fastgpt/web/common/system/utils';

const NotSufficientModal = () => {
  const { t } = useClientTranslation();
  const router = useRouter();
  const { notSufficientModalType: type, setNotSufficientModalType } = useSystemStore();
  const { isTeamAdmin, userInfo } = useUserStore();

  // Visitor view: share page is open without authentication; recharge controls
  // belong to the team owner, not the visitor.
  const isShareChat = router.pathname === `${subRoute}/chat/share`;
  const isVisitorView = isShareChat || !userInfo;

  const onClose = () => setNotSufficientModalType(undefined);

  const {
    isOpen: isRechargeModalOpen,
    onOpen: onRechargeModalOpen,
    onClose: onRechargeModalClose
  } = useDisclosure();

  const aiPointsText =
    isVisitorView || !isTeamAdmin
      ? t('common:support.wallet.Not_sufficient_contact_admin')
      : t('common:support.wallet.Not sufficient');

  const textMap = {
    [TeamErrEnum.aiPointsNotEnough]: aiPointsText,
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
      <MyModal
        isOpen
        onClose={onClose}
        title={t('common:Warning')}
        w={'420px'}
        footer={
          <>
            <Button variant={'whiteBase'} onClick={onClose}>
              {t('common:Close')}
            </Button>
            {!isVisitorView && isTeamAdmin && (
              <Button
                onClick={() => {
                  onRechargeModalOpen();
                }}
              >
                {t('common:support.wallet.To read plan')}
              </Button>
            )}
          </>
        }
      >
        {textMap[type]}
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
  onPaySuccess,
  title
}: {
  onClose: () => void;
  onPaySuccess: () => void;
  title?: string;
}) => {
  const { t } = useClientTranslation();
  const router = useRouter();
  const { userInfo, teamPlanStatus, initTeamPlanStatus } = useUserStore();
  const { subPlans } = useSystemStore();

  useMount(() => {
    initTeamPlanStatus();
  });

  const currentSubLevel = teamPlanStatus?.standard?.currentSubLevel;
  const planName = useMemo(() => {
    if (!currentSubLevel) return '';
    return (
      subPlans?.standard?.[currentSubLevel]?.name ||
      t(standardSubLevelMap[currentSubLevel]?.label as any)
    );
  }, [currentSubLevel, subPlans?.standard, t]);

  const [tab, setTab] = useState<'standard' | 'extra'>('standard');
  const [userSubMode, setUserSubMode] = useState<`${SubModeEnum}`>(SubModeEnum.month);
  const selectSubMode = subPlans?.activityExpirationTime ? SubModeEnum.year : userSubMode;

  return (
    <MyModal
      isOpen
      title={title ?? t('common:user.Pay')}
      onClose={onClose}
      isCentered
      minW={'90%'}
      maxH={'90%'}
    >
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
            >{`${teamPlanStatus?.usedPoints === null ? t('common:Unlimited') : Math.round(teamPlanStatus?.usedPoints ?? 0)} / ${teamPlanStatus?.totalPoints ?? t('common:Unlimited')}`}</Box>
          </Flex>
          <Flex h={2} w={'full'} p={0.5} bg={'primary.50'} borderRadius={'md'}>
            <Box
              borderRadius={'sm'}
              transition="width 0.3s"
              w={`${teamPlanStatus?.totalPoints && teamPlanStatus.usedPoints !== null ? Math.max((teamPlanStatus.usedPoints / teamPlanStatus.totalPoints) * 100, 0) : 0}%`}
              bg={`${
                teamPlanStatus?.totalPoints && teamPlanStatus.usedPoints !== null
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
                  ? (teamPlanStatus.usedDatasetIndexSize / teamPlanStatus.datasetMaxSize) * 100 < 50
                    ? 'primary'
                    : (teamPlanStatus.usedDatasetIndexSize / teamPlanStatus.datasetMaxSize) * 100 <
                        80
                      ? 'yellow'
                      : 'red'
                  : 'primary'
              }.500`}
            />
          </Flex>
        </Box>
      </Flex>

      <Box
        p={8}
        bg={'myGray.50'}
        border={'1px solid'}
        borderColor={'myGray.200'}
        rounded={'12px'}
        fontSize={'md'}
        lineHeight={'normal'}
        letterSpacing={'normal'}
      >
        <Flex flexDirection={'column'} alignItems={'center'}>
          <PricePlanTabs
            list={[
              {
                label: t('price:support.wallet.subscription.Basic plan tab'),
                value: 'standard'
              },
              {
                label: t('price:support.wallet.subscription.Extra points and dataset tab'),
                value: 'extra'
              }
            ]}
            value={tab}
            onChange={setTab}
          />
          {tab === 'standard' && (
            <Box mt={4}>
              <BillingModeSwitch value={selectSubMode} onChange={setUserSubMode} />
            </Box>
          )}
          {tab === 'extra' && (
            <Box
              mt={4}
              color={'#485264'}
              fontFamily={'Inter, sans-serif'}
              fontSize={'16px'}
              fontWeight={400}
              lineHeight={'24px'}
              textAlign={'center'}
            >
              {t('price:support.wallet.subscription.Extra plan tip')}
            </Box>
          )}
        </Flex>

        <Box mt={8}>
          {tab === 'standard' ? (
            <StandardPlan
              standardPlan={teamPlanStatus?.standard}
              onPaySuccess={onPaySuccess}
              selectSubMode={selectSubMode}
              onSelectSubModeChange={setUserSubMode}
              hideBillingToggle
              responsiveCardLayout
            />
          ) : (
            <ExtraPlan onPaySuccess={onPaySuccess} />
          )}
        </Box>
      </Box>
    </MyModal>
  );
};
