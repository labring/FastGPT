'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Flex,
  Button,
  useDisclosure,
  useTheme,
  Input,
  Link,
  Grid,
  type BoxProps
} from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { type UserUpdateParams } from '@/types/user';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useUserStore } from '@/web/support/user/useUserStore';
import type { UserType } from '@fastgpt/global/support/user/type';
import dynamic from 'next/dynamic';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useTranslation } from 'next-i18next';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { formatStorePrice2Read } from '@fastgpt/global/support/wallet/usage/tools';
import { putUpdateMemberName } from '@/web/support/user/team/api';
import { getDocPath } from '@/web/common/system/doc';
import {
  StandardSubLevelEnum,
  standardSubLevelMap
} from '@fastgpt/global/support/wallet/sub/constants';
import { formatTime2YMD } from '@fastgpt/global/common/string/time';
import { getExtraPlanCardRoute } from '@/web/support/wallet/sub/constants';
import StandardPlanContentList from '@/components/support/wallet/StandardPlanContentList';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';
import AccountContainer from '@/pageComponents/account/AccountContainer';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { useRouter } from 'next/router';
import TeamSelector from '@/pageComponents/account/TeamSelector';
import { getWorkorderURL } from '@/web/common/workorder/api';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useMount } from 'ahooks';
import MyDivider from '@fastgpt/web/components/common/MyDivider';
import { useUploadAvatar } from '@fastgpt/web/common/file/hooks/useUploadAvatar';
import { getUploadAvatarPresignedUrl } from '@/web/common/file/api';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { getIsMemberSyncMode } from '@/web/common/system/utils';
import { getAccountCancellationStatus } from '@/web/support/user/account/cancellation/api';
import { AccountCancellationConfirmModal } from '@/pageComponents/account/cancel/AccountCancellationConfirmModal';
import { usePasswordChangeStore } from '@/web/support/user/account/password/store';
import { canManagePasswordFromAccountInfo } from '@/pageComponents/account/info/password';

const RedeemCouponModal = dynamic(() => import('@/pageComponents/account/info/RedeemCouponModal'), {
  ssr: false
});
const DiscountCouponsModal = dynamic(
  () => import('@/pageComponents/account/info/DiscountCouponsModal'),
  { ssr: false }
);
const StandDetailModal = dynamic(
  () => import('@/pageComponents/account/info/standardDetailModal'),
  { ssr: false }
);
const ConversionModal = dynamic(() => import('@/pageComponents/account/info/ConversionModal'));
const UpdatePswModal = dynamic(() => import('@/pageComponents/account/info/UpdatePswModal'));
const UpdateContact = dynamic(() => import('@/components/support/user/inform/UpdateContactModal'));
const CommunityModal = dynamic(() => import('@/components/CommunityModal'));
const EnterpriseAuthStatusRowHeight = '32px';
const EnterpriseAuthStatusRow = dynamic(
  () => import('@/pageComponents/account/team/EnterpriseAuth'),
  {
    ssr: false,
    loading: () => <Box mt={4} h={EnterpriseAuthStatusRowHeight} />
  }
);

const ModelPriceModal = dynamic(() =>
  import('@/components/core/ai/ModelTable').then((mod) => mod.ModelPriceModal)
);

const Info = () => {
  const { isPc } = useSystem();
  const { teamPlanStatus, initUserInfo } = useUserStore();
  const standardPlan = teamPlanStatus?.standard;
  const { isOpen: isOpenContact, onClose: onCloseContact, onOpen: onOpenContact } = useDisclosure();

  useMount(() => {
    initUserInfo();
  });

  return (
    <AccountContainer>
      <Box py={[3, '28px']} px={[5, 10]} mx={'auto'}>
        {isPc ? (
          <Flex justifyContent={'center'} maxW={'1080px'}>
            <Box flex={'0 0 330px'}>
              <MyInfo onOpenContact={onOpenContact} />
              <Box mt={6}>
                <Other onOpenContact={onOpenContact} />
              </Box>
            </Box>
            {!!standardPlan && (
              <Box ml={'45px'} flex={'1'} maxW={'600px'}>
                <PlanUsage />
              </Box>
            )}
          </Flex>
        ) : (
          <>
            <MyInfo onOpenContact={onOpenContact} />
            {standardPlan && <PlanUsage />}
            <Other onOpenContact={onOpenContact} />
          </>
        )}
      </Box>
      {isOpenContact && <CommunityModal onClose={onCloseContact} />}
    </AccountContainer>
  );
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['account', 'account_info', 'account_team', 'user']))
    }
  };
}

export default React.memo(Info);

const MyInfo = ({ onOpenContact }: { onOpenContact: () => void }) => {
  const theme = useTheme();
  const { feConfigs, initd } = useSystemStore();
  const { t } = useTranslation();
  const { userInfo, updateUserInfo, teamPlanStatus, initUserInfo } = useUserStore();
  const { reset } = useForm<UserUpdateParams>({
    defaultValues: userInfo as UserType
  });
  const standardPlan = teamPlanStatus?.standard;
  const { isPc } = useSystem();
  const { toast } = useToast();
  const canManagePassword = canManagePasswordFromAccountInfo({
    isPlus: feConfigs?.isPlus,
    username: userInfo?.username
  });
  const [autoOpenEnterpriseAuth, setAutoOpenEnterpriseAuth] = useState(false);
  const showEnterpriseAuth = feConfigs?.show_enterprise_auth;

  const {
    isOpen: isOpenConversionModal,
    onClose: onCloseConversionModal,
    onOpen: onOpenConversionModal
  } = useDisclosure();
  const {
    isOpen: isOpenUpdatePsw,
    onClose: onCloseUpdatePsw,
    onOpen: onOpenUpdatePsw
  } = useDisclosure();
  const passwordChangeAuthorization = usePasswordChangeStore((state) => state.authorization);
  const {
    isOpen: isOpenUpdateContact,
    onClose: onCloseUpdateContact,
    onOpen: onOpenUpdateContact
  } = useDisclosure();

  const onClickSave = useCallback(
    async (data: UserType) => {
      await updateUserInfo({
        avatar: data.avatar,
        timezone: data.timezone
      });
      reset(data);
      toast({
        title: t('account_info:update_success_tip'),
        status: 'success'
      });
    },
    [reset, t, toast, updateUserInfo]
  );

  const afterUploadAvatar = useCallback(
    (avatar: string) => {
      if (!userInfo) return;
      onClickSave({ ...userInfo, avatar });
    },
    [onClickSave, userInfo]
  );

  /**
   * 清除 URL 中的 #certification hash，避免刷新页面或重新进入时重复触发企业认证弹窗
   */
  const clearCertificationHash = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, []);

  /**
   * 监听 URL hash 变化，当 hash 为 #certification 且系统初始化完成、开启企业认证功能时，
   * 延迟设置 autoOpenEnterpriseAuth 为 true，以触发企业认证弹窗。
   * 若未开启企业认证功能，则直接清除 hash。
   */
  const triggerEnterpriseAuthFromHash = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash !== '#certification') return;
    if (!initd) return;

    if (!showEnterpriseAuth) {
      clearCertificationHash();
      return;
    }

    // 使用 setTimeout 确保在 React 渲染周期后执行，避免状态更新冲突
    window.setTimeout(() => {
      setAutoOpenEnterpriseAuth(true);
    }, 0);
  }, [clearCertificationHash, initd, showEnterpriseAuth]);

  useEffect(() => {
    // 组件挂载时检查一次 hash
    triggerEnterpriseAuthFromHash();
    // 监听 hash 变化事件
    window.addEventListener('hashchange', triggerEnterpriseAuthFromHash);

    return () => {
      window.removeEventListener('hashchange', triggerEnterpriseAuthFromHash);
    };
  }, [triggerEnterpriseAuthFromHash]);

  useEffect(() => {
    if (canManagePassword && passwordChangeAuthorization?.required === false) onOpenUpdatePsw();
  }, [canManagePassword, onOpenUpdatePsw, passwordChangeAuthorization]);
  const { Component: AvatarUploader, handleFileSelectorOpen } = useUploadAvatar(
    getUploadAvatarPresignedUrl,
    {
      onSuccess: afterUploadAvatar
    }
  );

  const labelStyles: BoxProps = {
    flex: '0 0 80px',
    color: 'var(--light-general-on-surface-lowest, var(--Gray-Modern-500, #667085))',
    fontFamily: '"PingFang SC"',
    fontSize: '14px',
    fontStyle: 'normal',
    fontWeight: 400,
    lineHeight: '20px',
    letterSpacing: '0.25px'
  };

  const titleStyles: BoxProps = {
    color: 'var(--light-general-on-surface, var(--Gray-Modern-900, #111824))',
    fontFamily: '"PingFang SC"',
    fontSize: '16px',
    fontStyle: 'normal',
    fontWeight: 500,
    lineHeight: '24px',
    letterSpacing: '0.15px'
  };

  const actionButtonStyles = {
    size: 'sm',
    minW: '52px'
  } as const;

  const isSyncMember = getIsMemberSyncMode(feConfigs);
  return (
    <Box>
      {/* user info */}
      {isPc && (
        <Flex alignItems={'center'} h={'30px'} {...titleStyles}>
          <MyIcon mr={2} name={'core/dataset/fileCollection'} w={'1.25rem'} />
          {t('account_info:general_info')}
        </Flex>
      )}

      <Box mt={[0, 6]} fontSize={'sm'}>
        <Flex alignItems={'center'}>
          <Box {...labelStyles}>{t('account_info:user_account')}&nbsp;</Box>
          <Box flex={1}>{userInfo?.username}</Box>
        </Flex>
        {canManagePassword && (
          <Flex mt={4} alignItems={'center'}>
            <Box {...labelStyles}>{t('account_info:password')}&nbsp;</Box>
            <Box flex={1}>
              {userInfo?.hasPassword ? '*****' : t('account_info:password_not_set')}
            </Box>
            <Button {...actionButtonStyles} variant={'whitePrimary'} onClick={onOpenUpdatePsw}>
              {userInfo?.hasPassword ? t('account_info:change') : t('account_info:set_password')}
            </Button>
          </Flex>
        )}
        {feConfigs?.isPlus && (
          <Flex mt={4} alignItems={'center'}>
            <Box {...labelStyles}>{t('common:contact_way')}&nbsp;</Box>
            <Box flex={1} {...(!userInfo?.contact ? { color: 'red.600' } : {})}>
              {userInfo?.contact ? userInfo?.contact : t('account_info:please_bind_contact')}
            </Box>

            <Button {...actionButtonStyles} variant={'whitePrimary'} onClick={onOpenUpdateContact}>
              {t('account_info:change')}
            </Button>
          </Flex>
        )}

        <MyDivider my={6} />

        {isPc && (
          <Flex alignItems={'center'} h={'30px'} {...titleStyles} mt={6}>
            <MyIcon mr={2} name={'support/team/group'} w={'1.25rem'} />
            {t('account_info:team_info')}
          </Flex>
        )}

        {feConfigs.isPlus && (
          <Flex mt={6} alignItems={'center'}>
            <Box {...labelStyles}>{t('account_info:user_team_team_name')}&nbsp;</Box>
            <Flex flex={'1 0 0'} w={0} align={'center'}>
              <TeamSelector height={'28px'} w={'100%'} showManage />
            </Flex>
          </Flex>
        )}

        <AvatarUploader />
        {isPc ? (
          <Flex mt={4} alignItems={'center'} cursor={'pointer'}>
            <Box {...labelStyles}>{t('account_info:avatar')}&nbsp;</Box>

            <MyTooltip label={t('account_info:select_avatar')}>
              <Box
                w={['22px', '32px']}
                h={['22px', '32px']}
                borderRadius={'50%'}
                border={theme.borders.base}
                overflow={'hidden'}
                boxShadow={'0 0 5px rgba(0,0,0,0.1)'}
                onClick={handleFileSelectorOpen}
              >
                <Avatar src={userInfo?.avatar} borderRadius={'50%'} w={'100%'} h={'100%'} />
              </Box>
            </MyTooltip>
          </Flex>
        ) : (
          <Flex mt={4} alignItems={'center'}>
            <Box {...labelStyles}>{t('account_info:avatar')}&nbsp;</Box>
            <Flex
              flex={'1 0 0'}
              w={0}
              alignItems={'center'}
              gap={2}
              cursor={'pointer'}
              onClick={handleFileSelectorOpen}
            >
              <MyTooltip label={t('account_info:choose_avatar')}>
                <Box
                  w={'40px'}
                  h={'40px'}
                  borderRadius={'50%'}
                  border={'1px solid'}
                  borderColor={'borderColor.base'}
                  overflow={'hidden'}
                  p={'2px'}
                  bg={'white'}
                >
                  <Avatar src={userInfo?.avatar} borderRadius={'50%'} w={'100%'} h={'100%'} />
                </Box>
              </MyTooltip>

              <Flex alignItems={'center'} fontSize={'sm'} color={'myGray.600'}>
                <MyIcon mr={1} name={'edit'} w={'14px'} />
                {t('account_info:change')}
              </Flex>
            </Flex>
          </Flex>
        )}

        {feConfigs?.isPlus && (
          <Flex mt={[4, 4]} alignItems={'center'}>
            <Box {...labelStyles}>{t('account_info:member_name')}&nbsp;</Box>
            <Input
              flex={'1 0 0'}
              disabled={isSyncMember}
              defaultValue={userInfo?.team?.memberName || 'Member'}
              title={t('account_info:click_modify_nickname')}
              borderColor={'transparent'}
              transform={['none', 'translateX(-11px)']}
              maxLength={100}
              onBlur={async (e) => {
                const val = e.target.value;
                if (val === userInfo?.team?.memberName) return;
                try {
                  await putUpdateMemberName(val);
                  initUserInfo();
                } catch {}
              }}
            />
          </Flex>
        )}
        {feConfigs?.isPlus && (userInfo?.team?.balance ?? 0) > 0 && (
          <Box mt={4} whiteSpace={'nowrap'}>
            <Flex alignItems={'center'}>
              <Box {...labelStyles}>{t('account_info:team_balance')}&nbsp;</Box>
              <Box flex={1}>
                <strong>{formatStorePrice2Read(userInfo?.team?.balance).toFixed(3)}</strong>{' '}
                {t('account_info:yuan')}
              </Box>

              {userInfo?.permission.hasManagePer && !!standardPlan && (
                <Button
                  {...actionButtonStyles}
                  variant={'primary'}
                  ml={5}
                  onClick={onOpenConversionModal}
                >
                  {t('account_info:exchange')}
                </Button>
              )}
            </Flex>
          </Box>
        )}

        {showEnterpriseAuth && (
          <EnterpriseAuthStatusRow
            labelStyles={labelStyles}
            buttonProps={actionButtonStyles}
            autoOpen={autoOpenEnterpriseAuth}
            onAutoOpenFinish={() => {
              clearCertificationHash();
              setAutoOpenEnterpriseAuth(false);
            }}
          />
        )}

        <MyDivider my={6} />
      </Box>
      {isOpenConversionModal && (
        <ConversionModal onClose={onCloseConversionModal} onOpenContact={onOpenContact} />
      )}
      {canManagePassword && isOpenUpdatePsw && <UpdatePswModal onClose={onCloseUpdatePsw} />}
      {isOpenUpdateContact && <UpdateContact onClose={onCloseUpdateContact} mode="contact" />}
    </Box>
  );
};

const PlanUsage = () => {
  const router = useRouter();
  const { t } = useTranslation();
  const { userInfo, teamPlanStatus, initTeamPlanStatus } = useUserStore();
  const { subPlans, feConfigs } = useSystemStore();

  // Check if it's a wecom team
  const isWecomTeam = !!userInfo?.team?.isWecomTeam;
  const {
    isOpen: isOpenStandardModal,
    onClose: onCloseStandardModal,
    onOpen: onOpenStandardModal
  } = useDisclosure();

  const {
    isOpen: isOpenRedeemCouponModal,
    onClose: onCloseRedeemCouponModal,
    onOpen: onOpenRedeemCouponModal
  } = useDisclosure();

  const {
    isOpen: isOpenDiscountCouponsModal,
    onClose: onCloseDiscountCouponsModal,
    onOpen: onOpenDiscountCouponsModal
  } = useDisclosure();

  const planName = useMemo(() => {
    if (!teamPlanStatus?.standard?.currentSubLevel) return '';
    if (isWecomTeam && teamPlanStatus.standard.currentSubLevel === StandardSubLevelEnum.free)
      return i18nT('common:support.wallet.subscription.standardSubLevel.trial');

    return (
      subPlans?.standard?.[teamPlanStatus.standard.currentSubLevel]?.name ||
      standardSubLevelMap[teamPlanStatus.standard.currentSubLevel].label
    );
  }, [teamPlanStatus?.standard?.currentSubLevel, isWecomTeam, subPlans]);
  const standardPlan = teamPlanStatus?.standard;

  const isFreeTeam = useMemo(() => {
    if (!teamPlanStatus || !teamPlanStatus?.standard) return false;
    const hasExtraDatasetSize =
      teamPlanStatus.datasetMaxSize > teamPlanStatus.standard.maxDatasetSize;
    const hasExtraPoints = teamPlanStatus.totalPoints > teamPlanStatus.standard.totalPoints;
    if (
      teamPlanStatus?.standard?.currentSubLevel === StandardSubLevelEnum.free &&
      !hasExtraDatasetSize &&
      !hasExtraPoints
    ) {
      return true;
    }
    return false;
  }, [teamPlanStatus]);

  const datasetIndexUsageMap = useMemo(() => {
    if (!teamPlanStatus) {
      return {
        total: t('account_info:unlimited'),
        rate: 0
      };
    }

    const rate = teamPlanStatus.datasetMaxSize
      ? (teamPlanStatus.usedDatasetIndexSize / teamPlanStatus.datasetMaxSize) * 100
      : 0;

    return {
      total: teamPlanStatus.datasetMaxSize ?? t('account_info:unlimited'),
      rate
    };
  }, [t, teamPlanStatus]);

  const aiPointsUsageMap = useMemo(() => {
    if (!teamPlanStatus) {
      return {
        total: t('account_info:unlimited'),
        rate: 0
      };
    }

    const rate = teamPlanStatus.totalPoints
      ? (teamPlanStatus.usedPoints / teamPlanStatus.totalPoints) * 100
      : 0;

    return {
      total: teamPlanStatus.totalPoints ?? t('account_info:unlimited'),
      rate
    };
  }, [t, teamPlanStatus]);

  const limitData = useMemo(() => {
    if (!teamPlanStatus) {
      return [];
    }

    const data = [
      {
        label: t('account_info:member_amount'),
        value: teamPlanStatus.usedMember,
        max: teamPlanStatus?.standard?.maxTeamMember ?? t('account_info:unlimited'),
        rate: (teamPlanStatus.usedMember / (teamPlanStatus?.standard?.maxTeamMember || 1)) * 100
      },
      {
        label: t('account_info:app_amount'),
        value: teamPlanStatus.usedAppAmount,
        max: teamPlanStatus?.standard?.maxAppAmount ?? t('account_info:unlimited'),
        rate: (teamPlanStatus.usedAppAmount / (teamPlanStatus?.standard?.maxAppAmount || 1)) * 100
      },
      {
        label: t('account_info:dataset_amount'),
        value: teamPlanStatus.usedDatasetSize,
        max: teamPlanStatus?.standard?.maxDatasetAmount ?? t('account_info:unlimited'),
        rate:
          (teamPlanStatus.usedDatasetSize / (teamPlanStatus?.standard?.maxDatasetAmount || 1)) * 100
      }
    ];

    if (teamPlanStatus?.standard?.appRegistrationCount) {
      data.push({
        label: t('account_info:app_registration_count'),
        value: teamPlanStatus.usedRegistrationCount || 0,
        max: teamPlanStatus.standard.appRegistrationCount,
        rate:
          ((teamPlanStatus.usedRegistrationCount || 0) /
            teamPlanStatus.standard.appRegistrationCount) *
          100
      });
    }

    return data;
  }, [t, teamPlanStatus]);

  return standardPlan ? (
    <Box mt={[6, 0]}>
      <Flex fontSize={['md', 'lg']} h={'30px'}>
        <Flex
          alignItems={'center'}
          color="var(--light-general-on-surface, var(--Gray-Modern-900, #111824))"
          fontFamily='"PingFang SC"'
          fontSize="16px"
          fontStyle="normal"
          fontWeight={500}
          lineHeight="24px"
          letterSpacing="0.15px"
        >
          <MyIcon mr={2} name={'support/account/plans'} w={'20px'} />
          {t('account_info:package_and_usage')}
        </Flex>
        <ModelPriceModal>
          {({ onOpen }) => (
            <Button ml={3} size={'sm'} onClick={onOpen}>
              {t('account_info:billing_standard')}
            </Button>
          )}
        </ModelPriceModal>
        <Button ml={3} variant={'whitePrimary'} size={'sm'} onClick={onOpenStandardModal}>
          {t('account_info:package_details')}
        </Button>
        {userInfo?.permission.isOwner && feConfigs?.show_coupon && (
          <Button ml={3} variant={'whitePrimary'} size={'sm'} onClick={onOpenRedeemCouponModal}>
            {t('account_info:redeem_coupon')}
          </Button>
        )}
        {userInfo?.permission.isOwner && feConfigs?.show_discount_coupon && (
          <Button ml={3} variant={'whitePrimary'} size={'sm'} onClick={onOpenDiscountCouponsModal}>
            {t('account_info:discount_coupon')}
          </Button>
        )}
      </Flex>
      <Box
        mt={[3, 6]}
        bg={'white'}
        borderWidth={'1px'}
        borderColor={'borderColor.low'}
        borderRadius={'md'}
      >
        <Flex px={[5, 7]} pt={[3, 6]}>
          <Box flex={'1 0 0'}>
            <Box color={'myGray.600'} fontSize="sm">
              {t('account_info:current_package')}
            </Box>
            <Box fontWeight={'bold'} fontSize="lg">
              {t(planName as any)}
            </Box>
          </Box>
          <Button
            onClick={() => {
              router.push(
                subPlans?.planDescriptionUrl ? getDocPath(subPlans.planDescriptionUrl) : '/price'
              );
            }}
            w={'8rem'}
            size="sm"
          >
            {t('account_info:upgrade_package')}
          </Button>
        </Flex>
        <Box px={[5, 7]} pb={[3, 6]}>
          {isFreeTeam && (
            <Box mt="2" color={'#485264'} fontSize="sm">
              {t('account_info:account_knowledge_base_cleanup_warning')}
            </Box>
          )}
          {(standardPlan.currentSubLevel !== StandardSubLevelEnum.free || isWecomTeam) && (
            <Flex mt="2" color={'#485264'} fontSize="xs">
              <Box>{t('account_info:package_expiry_time')}:</Box>
              <Box ml={2}>{formatTime2YMD(standardPlan?.expiredTime)}</Box>
            </Flex>
          )}
        </Box>

        <Box py={3} borderTopWidth={'1px'} borderTopColor={'borderColor.base'}>
          <Box py={[0, 3]} px={[5, 7]} overflow={'auto'}>
            <StandardPlanContentList
              level={standardPlan?.currentSubLevel}
              mode={'month'}
              standplan={standardPlan}
            />
          </Box>
        </Box>
      </Box>
      <Box
        mt={6}
        bg={'white'}
        borderWidth={'1px'}
        borderColor={'borderColor.low'}
        borderRadius={'md'}
        px={[5, 10]}
        pt={4}
        pb={[4, 7]}
      >
        <Flex>
          <Flex flex={'1 0 0'} alignItems={'flex-end'}>
            <Box fontSize={'md'} fontWeight={'bold'} color={'myGray.900'}>
              {t('account_info:resource_usage')}
            </Box>
            <Box ml={1} display={['none', 'block']} fontSize={'xs'} color={'myGray.500'}>
              {t('account_info:standard_package_and_extra_resource_package')}
            </Box>
          </Flex>
          <Link
            href={getWebReqUrl(getExtraPlanCardRoute())}
            transform={'translateX(15px)'}
            display={'flex'}
            alignItems={'center'}
            color={'primary.600'}
            cursor={'pointer'}
            fontSize={'sm'}
          >
            {t('account_info:purchase_extra_package')}
            <MyIcon ml={1} name={'common/rightArrowLight'} w={'12px'} />
          </Link>
        </Flex>
        <Box width={'100%'} mt={5} fontSize={'sm'}>
          <Flex alignItems={'center'} mb={2}>
            <Box fontSize={'16px'} fontWeight={'medium'} color={'myGray.900'} mr={1}>
              {t('common:support.wallet.subscription.AI points usage')}
            </Box>
            <QuestionTip label={t('account_info:ai_points_usage_tip')} />
            <Box ml={4} fontSize={'14px'} fontWeight={'medium'} color={'myGray.600'}>
              {Math.round(teamPlanStatus?.usedPoints || 0)} / {aiPointsUsageMap.total}
            </Box>
          </Flex>
          <Flex h={2} w={'full'} p={0.5} bg={'primary.50'} borderRadius={'md'}>
            <Box
              borderRadius={'sm'}
              transition="width 0.3s"
              w={`${aiPointsUsageMap.rate}%`}
              bg={`${aiPointsUsageMap.rate < 50 ? 'primary' : aiPointsUsageMap.rate < 80 ? 'yellow' : 'red'}.500`}
            />
          </Flex>
        </Box>

        <Box mt="6" width={'100%'} fontSize={'sm'}>
          <Flex gap={4} alignItems={'center'} mb={2}>
            <Box fontSize={'16px'} fontWeight={'medium'} color={'myGray.900'}>
              {t('common:support.user.team.Dataset usage')}
            </Box>
            <Box fontSize={'14px'} fontWeight={'medium'} color={'myGray.600'}>
              {Math.round(teamPlanStatus?.usedDatasetIndexSize || 0)} / {datasetIndexUsageMap.total}
            </Box>
          </Flex>
          <Flex h={2} w={'full'} p={0.5} bg={'primary.50'} borderRadius={'md'}>
            <Box
              borderRadius={'sm'}
              transition="width 0.3s"
              w={`${datasetIndexUsageMap.rate}%`}
              bg={`${datasetIndexUsageMap.rate < 50 ? 'primary' : datasetIndexUsageMap.rate < 80 ? 'yellow' : 'red'}.500`}
            />
          </Flex>
        </Box>

        <MyDivider />

        {limitData.map((item) => {
          const isAppRegistration = item.label === t('account_info:app_registration_count');

          return (
            <Box
              key={item.label}
              _notFirst={{
                mt: 6
              }}
              width={'100%'}
              fontSize={'sm'}
            >
              <Flex gap={4} alignItems={'center'} mb={2}>
                <Box fontSize={'16px'} fontWeight={'medium'} color={'myGray.900'}>
                  {item.label}
                </Box>
                <Box fontSize={'14px'} fontWeight={'medium'} color={'myGray.600'}>
                  {item.value}/{item.max}
                </Box>
                {isAppRegistration && subPlans?.appRegistrationUrl && (
                  <Link
                    href={subPlans?.appRegistrationUrl}
                    target="_blank"
                    ml={'auto'}
                    display={'flex'}
                    alignItems={'center'}
                    color={'primary.600'}
                    cursor={'pointer'}
                    fontSize={'sm'}
                  >
                    {t('account_info:apply_app_registration')}
                    <MyIcon ml={1} name={'common/rightArrowLight'} w={'12px'} />
                  </Link>
                )}
              </Flex>
              <Flex h={2} w={'full'} p={0.5} bg={'primary.50'} borderRadius={'md'}>
                <Box
                  borderRadius={'sm'}
                  transition="width 0.3s"
                  w={`${item.rate}%`}
                  bg={`${item.rate < 50 ? 'green' : item.rate < 80 ? 'yellow' : 'red'}.500`}
                />
              </Flex>
            </Box>
          );
        })}
      </Box>
      {isOpenStandardModal && <StandDetailModal onClose={onCloseStandardModal} />}
      {isOpenRedeemCouponModal && (
        <RedeemCouponModal
          onClose={onCloseRedeemCouponModal}
          onSuccess={() => initTeamPlanStatus()}
        />
      )}
      {isOpenDiscountCouponsModal && <DiscountCouponsModal onClose={onCloseDiscountCouponsModal} />}
    </Box>
  ) : null;
};

const ButtonStyles = {
  bg: 'white',
  px: 6,
  h: '40px',
  borderWidth: '1.5px',
  borderColor: 'borderColor.low',
  borderRadius: 'md',
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  cursor: 'pointer',
  userSelect: 'none' as any,
  fontSize: 'sm'
};
const Other = ({ onOpenContact }: { onOpenContact: () => void }) => {
  const { feConfigs, setNotSufficientModalType, subPlans } = useSystemStore();
  const { teamPlanStatus, userInfo } = useUserStore();
  const { t } = useTranslation();
  const { isPc } = useSystem();
  const router = useRouter();
  const {
    isOpen: isCancellationConfirmOpen,
    onOpen: onOpenCancellationConfirm,
    onClose: onCloseCancellationConfirm
  } = useDisclosure();
  const { data: accountCancellationStatus } = useRequest(getAccountCancellationStatus, {
    manual: false,
    refreshDeps: [userInfo?._id]
  });

  const { runAsync: onFeedback } = useRequest(
    async () => {
      const plan = teamPlanStatus?.standard?.currentSubLevel
        ? subPlans?.standard?.[teamPlanStatus?.standard?.currentSubLevel]
        : undefined;

      const ticketResponseTime =
        teamPlanStatus?.standard?.ticketResponseTime ?? plan?.ticketResponseTime;
      const hasTicketAccess = !!ticketResponseTime;
      if (!hasTicketAccess) {
        setNotSufficientModalType(TeamErrEnum.ticketNotAvailable);
        return;
      }

      const data = await getWorkorderURL();
      if (data) {
        window.open(data.redirectUrl);
      }
    },
    {
      manual: true
    }
  );

  return (
    <Box>
      <Grid rowGap="16px" columnGap={4}>
        {feConfigs?.docUrl && (
          <Link
            href={getDocPath('/guide/getting-started')}
            target="_blank"
            textDecoration={'none !important'}
            {...ButtonStyles}
          >
            <MyIcon
              name={'common/quickActionBook'}
              w={'18px'}
              h={'18px'}
              color={'myGray.600'}
              flexShrink={0}
            />
            <Box flex={1}>{t('account_info:help_document')}</Box>
          </Link>
        )}

        {!isPc &&
          feConfigs?.navbarItems
            ?.filter((item) => item.isActive)
            .map((item) => (
              <Flex key={item.id} {...ButtonStyles} onClick={() => window.open(item.url, '_blank')}>
                <Avatar src={item.avatar} w={'18px'} h={'18px'} flexShrink={0} />
                <Box flex={1}>{item.name}</Box>
              </Flex>
            ))}
        {feConfigs?.concatMd && (
          <Flex onClick={onOpenContact} {...ButtonStyles}>
            <MyIcon
              name={'common/quickActionPhone'}
              w={'18px'}
              h={'18px'}
              color={'myGray.600'}
              fill={'none'}
              flexShrink={0}
            />
            <Box flex={1}>{t('account_info:contact_us')}</Box>
          </Flex>
        )}
        {feConfigs?.show_workorder && (
          <Flex onClick={onFeedback} {...ButtonStyles}>
            <MyIcon
              name={'common/quickActionFeedback'}
              w={'18px'}
              h={'18px'}
              color={'myGray.600'}
              flexShrink={0}
            />
            <Box flex={1}>{t('common:question_feedback')}</Box>
          </Flex>
        )}
        {(accountCancellationStatus?.status === 'pending' ||
          (accountCancellationStatus?.status === 'none' &&
            accountCancellationStatus.canRequestCancellation)) && (
          <Flex
            {...ButtonStyles}
            onClick={() => {
              if (accountCancellationStatus.status === 'pending') {
                void router.push('/account/cancel');
                return;
              }
              onOpenCancellationConfirm();
            }}
          >
            <MyIcon
              name={'common/quickActionUserX'}
              w={'18px'}
              h={'18px'}
              color={'myGray.600'}
              fill={'none'}
              flexShrink={0}
            />
            <Box flex={1}>{t('account_info:account_cancellation', '账号注销')}</Box>
          </Flex>
        )}
      </Grid>
      {accountCancellationStatus?.status === 'none' &&
        accountCancellationStatus.canRequestCancellation && (
          <AccountCancellationConfirmModal
            isOpen={isCancellationConfirmOpen}
            onClose={onCloseCancellationConfirm}
            onConfirm={() => {
              onCloseCancellationConfirm();
              void router.push('/account/cancel?confirmed=1');
            }}
          />
        )}
    </Box>
  );
};
