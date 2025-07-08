'use client';
import React, { useCallback, useMemo } from 'react';
import {
  Box,
  Flex,
  Button,
  useDisclosure,
  useTheme,
  Input,
  Link,
  Progress,
  Grid,
  type BoxProps
} from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { type UserUpdateParams } from '@/types/user';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useUserStore } from '@/web/support/user/useUserStore';
import type { UserType } from '@fastgpt/global/support/user/type.d';
import dynamic from 'next/dynamic';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
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
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useMount } from 'ahooks';
import MyDivider from '@fastgpt/web/components/common/MyDivider';

const RedeemCouponModal = dynamic(() => import('@/pageComponents/account/info/RedeemCouponModal'), {
  ssr: false
});
const StandDetailModal = dynamic(
  () => import('@/pageComponents/account/info/standardDetailModal'),
  { ssr: false }
);
const ConversionModal = dynamic(() => import('@/pageComponents/account/info/ConversionModal'));
const UpdatePswModal = dynamic(() => import('@/pageComponents/account/info/UpdatePswModal'));
const UpdateContact = dynamic(() => import('@/components/support/user/inform/UpdateContactModal'));
const CommunityModal = dynamic(() => import('@/components/CommunityModal'));

const ModelPriceModal = dynamic(() =>
  import('@/components/core/ai/ModelTable').then((mod) => mod.ModelPriceModal)
);

const Info = () => {
  const { isPc } = useSystem();
  const { teamPlanStatus, initUserInfo } = useUserStore();
  const standardPlan = teamPlanStatus?.standardConstants;
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
      ...(await serviceSideProps(content, ['account', 'account_info', 'user']))
    }
  };
}

export default React.memo(Info);

const MyInfo = ({ onOpenContact }: { onOpenContact: () => void }) => {
  const theme = useTheme();
  const { feConfigs } = useSystemStore();
  const { t } = useTranslation();
  const { userInfo, updateUserInfo, teamPlanStatus, initUserInfo } = useUserStore();
  const { reset } = useForm<UserUpdateParams>({
    defaultValues: userInfo as UserType
  });
  const standardPlan = teamPlanStatus?.standardConstants;
  const { isPc } = useSystem();
  const { toast } = useToast();

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
  const {
    isOpen: isOpenUpdateContact,
    onClose: onCloseUpdateContact,
    onOpen: onOpenUpdateContact
  } = useDisclosure();
  const {
    File,
    onOpen: onOpenSelectFile,
    onSelectImage
  } = useSelectFile({
    fileType: '.jpg,.png',
    multiple: false
  });

  const onclickSave = useCallback(
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

  const isSyncMember = feConfigs.register_method?.includes('sync');
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
        {feConfigs?.isPlus && (
          <Flex mt={4} alignItems={'center'}>
            <Box {...labelStyles}>{t('account_info:password')}&nbsp;</Box>
            <Box flex={1}>*****</Box>
            <Button size={'sm'} variant={'whitePrimary'} onClick={onOpenUpdatePsw}>
              {t('account_info:change')}
            </Button>
          </Flex>
        )}
        {feConfigs?.isPlus && (
          <Flex mt={4} alignItems={'center'}>
            <Box {...labelStyles}>{t('common:contact_way')}&nbsp;</Box>
            <Box flex={1} {...(!userInfo?.contact ? { color: 'red.600' } : {})}>
              {userInfo?.contact ? userInfo?.contact : t('account_info:please_bind_contact')}
            </Box>

            <Button size={'sm'} variant={'whitePrimary'} onClick={onOpenUpdateContact}>
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
                onClick={onOpenSelectFile}
              >
                <Avatar src={userInfo?.avatar} borderRadius={'50%'} w={'100%'} h={'100%'} />
              </Box>
            </MyTooltip>
          </Flex>
        ) : (
          <Flex
            flexDirection={'column'}
            alignItems={'center'}
            cursor={'pointer'}
            onClick={onOpenSelectFile}
          >
            <MyTooltip label={t('account_info:choose_avatar')}>
              <Box
                w={['44px', '54px']}
                h={['44px', '54px']}
                borderRadius={'50%'}
                border={theme.borders.base}
                overflow={'hidden'}
                p={'2px'}
                boxShadow={'0 0 5px rgba(0,0,0,0.1)'}
                mb={2}
              >
                <Avatar src={userInfo?.avatar} borderRadius={'50%'} w={'100%'} h={'100%'} />
              </Box>
            </MyTooltip>

            <Flex alignItems={'center'} fontSize={'sm'} color={'myGray.600'}>
              <MyIcon mr={1} name={'edit'} w={'14px'} />
              {t('account_info:change')}
            </Flex>
          </Flex>
        )}
        {feConfigs?.isPlus && (
          <Flex mt={[0, 4]} alignItems={'center'}>
            <Box {...labelStyles}>{t('account_info:member_name')}&nbsp;</Box>
            <Input
              flex={'1 0 0'}
              disabled={isSyncMember}
              defaultValue={userInfo?.team?.memberName || 'Member'}
              title={t('account_info:click_modify_nickname')}
              borderColor={'transparent'}
              transform={'translateX(-11px)'}
              maxLength={100}
              onBlur={async (e) => {
                const val = e.target.value;
                if (val === userInfo?.team?.memberName) return;
                try {
                  await putUpdateMemberName(val);
                  initUserInfo();
                } catch (error) {}
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
                <Button variant={'primary'} size={'sm'} ml={5} onClick={onOpenConversionModal}>
                  {t('account_info:exchange')}
                </Button>
              )}
            </Flex>
          </Box>
        )}

        <MyDivider my={6} />
      </Box>
      {isOpenConversionModal && (
        <ConversionModal onClose={onCloseConversionModal} onOpenContact={onOpenContact} />
      )}
      {isOpenUpdatePsw && <UpdatePswModal onClose={onCloseUpdatePsw} />}
      {isOpenUpdateContact && <UpdateContact onClose={onCloseUpdateContact} mode="contact" />}
      <File
        onSelect={(e) =>
          onSelectImage(e, {
            maxW: 300,
            maxH: 300,
            callback: (src) => {
              if (!userInfo) return;
              onclickSave({
                ...userInfo,
                avatar: src
              });
            }
          })
        }
      />
    </Box>
  );
};

const PlanUsage = () => {
  const router = useRouter();
  const { t } = useTranslation();
  const { userInfo, teamPlanStatus, initTeamPlanStatus } = useUserStore();
  const { subPlans, feConfigs } = useSystemStore();
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

  const planName = useMemo(() => {
    if (!teamPlanStatus?.standard?.currentSubLevel) return '';
    return standardSubLevelMap[teamPlanStatus.standard.currentSubLevel].label;
  }, [teamPlanStatus?.standard?.currentSubLevel]);
  const standardPlan = teamPlanStatus?.standard;

  const isFreeTeam = useMemo(() => {
    if (!teamPlanStatus || !teamPlanStatus?.standardConstants) return false;
    const hasExtraDatasetSize =
      teamPlanStatus.datasetMaxSize > teamPlanStatus.standardConstants.maxDatasetSize;
    const hasExtraPoints =
      teamPlanStatus.totalPoints > teamPlanStatus.standardConstants.totalPoints;
    if (
      teamPlanStatus?.standard?.currentSubLevel === StandardSubLevelEnum.free &&
      !hasExtraDatasetSize &&
      !hasExtraPoints
    ) {
      return true;
    }
    return false;
  }, [teamPlanStatus]);

  const valueColorSchema = useCallback((val: number) => {
    if (val < 50) return 'green';
    if (val < 80) return 'yellow';
    return 'red';
  }, []);

  const datasetIndexUsageMap = useMemo(() => {
    if (!teamPlanStatus) {
      return {
        value: 0,
        max: t('account_info:unlimited'),
        rate: 0
      };
    }
    const rate = teamPlanStatus.usedDatasetIndexSize / teamPlanStatus.datasetMaxSize;

    return {
      value: teamPlanStatus.usedDatasetIndexSize,
      rate: rate * 100,
      max: teamPlanStatus.datasetMaxSize || 1
    };
  }, [t, teamPlanStatus]);
  const aiPointsUsageMap = useMemo(() => {
    if (!teamPlanStatus) {
      return {
        value: 0,
        max: t('account_info:unlimited'),
        rate: 0
      };
    }

    return {
      value: Math.round(teamPlanStatus.usedPoints),
      max: teamPlanStatus.totalPoints,
      rate: (teamPlanStatus.usedPoints / teamPlanStatus.totalPoints) * 100
    };
  }, [t, teamPlanStatus]);

  const limitData = useMemo(() => {
    if (!teamPlanStatus) {
      return [];
    }

    return [
      {
        label: t('account_info:member_amount'),
        value: teamPlanStatus.usedMember,
        max: teamPlanStatus?.standardConstants?.maxTeamMember || t('account_info:unlimited'),
        rate:
          (teamPlanStatus.usedMember / (teamPlanStatus?.standardConstants?.maxTeamMember || 1)) *
          100
      },
      {
        label: t('account_info:app_amount'),
        value: teamPlanStatus.usedAppAmount,
        max: teamPlanStatus?.standardConstants?.maxAppAmount || t('account_info:unlimited'),
        rate:
          (teamPlanStatus.usedAppAmount / (teamPlanStatus?.standardConstants?.maxAppAmount || 1)) *
          100
      },
      {
        label: t('account_info:dataset_amount'),
        value: teamPlanStatus.usedDatasetSize,
        max: teamPlanStatus?.standardConstants?.maxDatasetAmount || t('account_info:unlimited'),
        rate:
          (teamPlanStatus.usedDatasetSize /
            (teamPlanStatus?.standardConstants?.maxDatasetAmount || 1)) *
          100
      }
    ];
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
          {standardPlan.currentSubLevel !== StandardSubLevelEnum.free && (
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
              mode={standardPlan.currentMode}
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
          <Flex alignItems={'center'}>
            <Flex alignItems={'center'}>
              <Box fontWeight={'bold'} color={'myGray.900'}>
                {t('account_info:knowledge_base_capacity')}
              </Box>
              <Box color={'myGray.600'} ml={2}>
                {datasetIndexUsageMap.value}/{datasetIndexUsageMap.max}
              </Box>
            </Flex>
          </Flex>
          <Box mt={1}>
            <Progress
              size={'sm'}
              value={datasetIndexUsageMap.rate}
              colorScheme={valueColorSchema(datasetIndexUsageMap.rate)}
              borderRadius={'md'}
              isAnimated
              hasStripe
              borderWidth={'1px'}
              borderColor={'borderColor.low'}
            />
          </Box>
        </Box>
        <Box mt="6" width={'100%'} fontSize={'sm'}>
          <Flex alignItems={'center'}>
            <Flex alignItems={'center'}>
              <Box fontWeight={'bold'} color={'myGray.900'}>
                {t('account_info:ai_points_usage')}
              </Box>
              <QuestionTip ml={1} label={t('account_info:ai_points_usage_tip')}></QuestionTip>
              <Box color={'myGray.600'} ml={2}>
                {aiPointsUsageMap.value}/{aiPointsUsageMap.max}
              </Box>
            </Flex>
          </Flex>
          <Box mt={1}>
            <Progress
              size={'sm'}
              value={aiPointsUsageMap.rate}
              colorScheme={valueColorSchema(aiPointsUsageMap.rate)}
              borderRadius={'md'}
              isAnimated
              hasStripe
              borderWidth={'1px'}
              borderColor={'borderColor.low'}
            />
          </Box>
        </Box>

        <MyDivider />

        {limitData.map((item) => {
          return (
            <Box
              key={item.label}
              _notFirst={{
                mt: 4
              }}
              width={'100%'}
              fontSize={'sm'}
            >
              <Flex alignItems={'center'}>
                <Box fontWeight={'bold'} color={'myGray.900'}>
                  {item.label}
                </Box>
                <Box color={'myGray.600'} ml={2}>
                  {item.value}/{item.max}
                </Box>
              </Flex>
              <Box mt={1}>
                <Progress
                  size={'sm'}
                  value={item.rate}
                  colorScheme={valueColorSchema(item.rate)}
                  borderRadius={'md'}
                  isAnimated
                  hasStripe
                  borderWidth={'1px'}
                  borderColor={'borderColor.low'}
                />
              </Box>
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
    </Box>
  ) : null;
};

const ButtonStyles = {
  bg: 'white',
  py: 3,
  px: 6,
  border: 'sm',
  borderWidth: '1.5px',
  borderRadius: 'md',
  display: 'flex',
  alignItems: 'center',
  cursor: 'pointer',
  userSelect: 'none' as any,
  fontSize: 'sm'
};
const Other = ({ onOpenContact }: { onOpenContact: () => void }) => {
  const { feConfigs } = useSystemStore();
  const { teamPlanStatus } = useUserStore();
  const { t } = useTranslation();
  const { isPc } = useSystem();

  const { runAsync: onFeedback } = useRequest2(getWorkorderURL, {
    manual: true,
    onSuccess(data) {
      if (data) {
        window.open(data.redirectUrl);
      }
    }
  });

  return (
    <Box>
      <Grid gridGap={4}>
        {feConfigs?.docUrl && (
          <Link
            href={getDocPath('/docs/intro')}
            target="_blank"
            textDecoration={'none !important'}
            {...ButtonStyles}
          >
            <MyIcon name={'common/courseLight'} w={'18px'} color={'myGray.600'} />
            <Box ml={2} flex={1}>
              {t('account_info:help_document')}
            </Box>
          </Link>
        )}

        {!isPc &&
          feConfigs?.navbarItems
            ?.filter((item) => item.isActive)
            .map((item) => (
              <Flex key={item.id} {...ButtonStyles} onClick={() => window.open(item.url, '_blank')}>
                <Avatar src={item.avatar} w={'18px'} />
                <Box ml={2} flex={1}>
                  {item.name}
                </Box>
              </Flex>
            ))}
        {feConfigs?.concatMd && (
          <Flex onClick={onOpenContact} {...ButtonStyles}>
            <MyIcon name={'modal/concat'} w={'18px'} color={'myGray.600'} />
            <Box ml={2} flex={1}>
              {t('account_info:contact_us')}
            </Box>
          </Flex>
        )}
        {feConfigs?.show_workorder &&
          teamPlanStatus &&
          teamPlanStatus.standard?.currentSubLevel !== StandardSubLevelEnum.free && (
            <Flex onClick={onFeedback} {...ButtonStyles}>
              <MyIcon name={'feedback'} w={'18px'} color={'myGray.600'} />
              <Box ml={2} flex={1}>
                {t('common:question_feedback')}
              </Box>
            </Flex>
          )}
      </Grid>
    </Box>
  );
};
