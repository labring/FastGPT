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
  BoxProps
} from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { UserUpdateParams } from '@/types/user';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useUserStore } from '@/web/support/user/useUserStore';
import type { UserType } from '@fastgpt/global/support/user/type.d';
import { useQuery } from '@tanstack/react-query';
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
import AccountContainer from '../components/AccountContainer';
import { serviceSideProps } from '@fastgpt/web/common/system/nextjs';
import { useRouter } from 'next/router';
import TeamSelector from '../components/TeamSelector';

const StandDetailModal = dynamic(() => import('./components/standardDetailModal'), { ssr: false });
const ConversionModal = dynamic(() => import('./components/ConversionModal'));
const UpdatePswModal = dynamic(() => import('./components/UpdatePswModal'));
const UpdateNotification = dynamic(
  () => import('@/components/support/user/inform/UpdateNotificationModal')
);
const CommunityModal = dynamic(() => import('@/components/CommunityModal'));

const ModelPriceModal = dynamic(() =>
  import('@/components/core/ai/ModelTable').then((mod) => mod.ModelPriceModal)
);

const Info = () => {
  const { isPc } = useSystem();
  const { teamPlanStatus, initUserInfo } = useUserStore();
  const standardPlan = teamPlanStatus?.standardConstants;
  const { isOpen: isOpenContact, onClose: onCloseContact, onOpen: onOpenContact } = useDisclosure();

  useQuery(['init'], initUserInfo);

  return (
    <AccountContainer>
      <Box py={[3, '28px']} px={[5, 10]} mx={'auto'}>
        {isPc ? (
          <Flex justifyContent={'center'} maxW={'1080px'}>
            <Box flex={'0 0 330px'}>
              <MyInfo onOpenContact={onOpenContact} />
              <Box mt={9}>
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
  const { userInfo, updateUserInfo, teamPlanStatus } = useUserStore();
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
    isOpen: isOpenUpdateNotification,
    onClose: onCloseUpdateNotification,
    onOpen: onOpenUpdateNotification
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
    fontSize: 'sm',
    color: 'myGray.900'
  };

  const isSyncMember = feConfigs.register_method?.includes('sync');
  return (
    <Box>
      {/* user info */}
      {isPc && (
        <Flex alignItems={'center'} fontSize={'md'} h={'30px'}>
          <MyIcon mr={2} name={'support/user/userLight'} w={'1.25rem'} />
          {t('account_info:personal_information')}
        </Flex>
      )}

      <Box mt={[0, 6]} fontSize={'sm'}>
        {isPc ? (
          <Flex alignItems={'center'} cursor={'pointer'}>
            <Box {...labelStyles}>{t('account_info:avatar')}:&nbsp;</Box>

            <MyTooltip label={t('account_info:select_avatar')}>
              <Box
                w={['44px', '56px']}
                h={['44px', '56px']}
                borderRadius={'50%'}
                border={theme.borders.base}
                overflow={'hidden'}
                p={'2px'}
                boxShadow={'0 0 5px rgba(0,0,0,0.1)'}
                mb={2}
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
            <Box {...labelStyles}>{t('account_info:member_name')}:&nbsp;</Box>
            <Input
              flex={'1 0 0'}
              disabled={isSyncMember}
              defaultValue={userInfo?.team?.memberName || 'Member'}
              title={t('account_info:click_modify_nickname')}
              borderColor={'transparent'}
              transform={'translateX(-11px)'}
              maxLength={20}
              onBlur={(e) => {
                const val = e.target.value;
                if (val === userInfo?.team?.memberName) return;
                try {
                  putUpdateMemberName(val);
                } catch (error) {}
              }}
            />
          </Flex>
        )}
        <Flex alignItems={'center'} mt={6}>
          <Box {...labelStyles}>{t('account_info:user_account')}:&nbsp;</Box>
          <Box flex={1}>{userInfo?.username}</Box>
        </Flex>
        {feConfigs?.isPlus && (
          <Flex mt={6} alignItems={'center'}>
            <Box {...labelStyles}>{t('account_info:password')}:&nbsp;</Box>
            <Box flex={1}>*****</Box>
            <Button size={'sm'} variant={'whitePrimary'} onClick={onOpenUpdatePsw}>
              {t('account_info:change')}
            </Button>
          </Flex>
        )}
        {feConfigs?.isPlus && (
          <Flex mt={6} alignItems={'center'}>
            <Box {...labelStyles}>{t('account_info:notification_receiving')}:&nbsp;</Box>
            <Box
              flex={1}
              {...(!userInfo?.team.notificationAccount && userInfo?.permission.isOwner
                ? { color: 'red.600' }
                : {})}
            >
              {userInfo?.team.notificationAccount
                ? userInfo?.team.notificationAccount
                : userInfo?.permission.isOwner
                  ? t('account_info:please_bind_notification_receiving_path')
                  : t('account_info:reminder_create_bound_notification_account')}
            </Box>

            {userInfo?.permission.isOwner && (
              <Button size={'sm'} variant={'whitePrimary'} onClick={onOpenUpdateNotification}>
                {t('account_info:change')}
              </Button>
            )}
          </Flex>
        )}
        {feConfigs.isPlus && (
          <Flex mt={6} alignItems={'center'}>
            <Box {...labelStyles}>{t('account_info:user_team_team_name')}:&nbsp;</Box>
            <Flex flex={'1 0 0'} w={0} align={'center'}>
              <TeamSelector height={'28px'} w={'100%'} showManage />
            </Flex>
          </Flex>
        )}
        {feConfigs?.isPlus && (userInfo?.team?.balance ?? 0) > 0 && (
          <Box mt={6} whiteSpace={'nowrap'}>
            <Flex alignItems={'center'}>
              <Box {...labelStyles}>{t('account_info:team_balance')}:&nbsp;</Box>
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
      </Box>
      {isOpenConversionModal && (
        <ConversionModal onClose={onCloseConversionModal} onOpenContact={onOpenContact} />
      )}
      {isOpenUpdatePsw && <UpdatePswModal onClose={onCloseUpdatePsw} />}
      {isOpenUpdateNotification && <UpdateNotification onClose={onCloseUpdateNotification} />}
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
  const { userInfo, initUserInfo, teamPlanStatus } = useUserStore();
  const { subPlans } = useSystemStore();
  const { reset } = useForm<UserUpdateParams>({
    defaultValues: userInfo as UserType
  });

  const {
    isOpen: isOpenStandardModal,
    onClose: onCloseStandardModal,
    onOpen: onOpenStandardModal
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

  useQuery(['init'], initUserInfo, {
    onSuccess(res) {
      reset(res);
    }
  });

  const datasetUsageMap = useMemo(() => {
    if (!teamPlanStatus) {
      return {
        colorScheme: 'green',
        value: 0,
        maxSize: t('account_info:unlimited'),
        usedSize: 0
      };
    }
    const rate = teamPlanStatus.usedDatasetSize / teamPlanStatus.datasetMaxSize;

    const colorScheme = (() => {
      if (rate < 0.5) return 'green';
      if (rate < 0.8) return 'yellow';
      return 'red';
    })();

    return {
      colorScheme,
      value: rate * 100,
      maxSize: teamPlanStatus.datasetMaxSize || t('account_info:unlimited'),
      usedSize: teamPlanStatus.usedDatasetSize
    };
  }, [teamPlanStatus, t]);
  const aiPointsUsageMap = useMemo(() => {
    if (!teamPlanStatus) {
      return {
        colorScheme: 'green',
        value: 0,
        maxSize: t('account_info:unlimited'),
        usedSize: 0
      };
    }

    const rate = teamPlanStatus.usedPoints / teamPlanStatus.totalPoints;

    const colorScheme = (() => {
      if (rate < 0.5) return 'green';
      if (rate < 0.8) return 'yellow';
      return 'red';
    })();

    return {
      colorScheme,
      value: rate * 100,
      max: teamPlanStatus.totalPoints ? teamPlanStatus.totalPoints : t('account_info:unlimited'),
      used: teamPlanStatus.usedPoints ? Math.round(teamPlanStatus.usedPoints) : 0
    };
  }, [teamPlanStatus, t]);

  return standardPlan ? (
    <Box mt={[6, 0]}>
      <Flex fontSize={['md', 'lg']} h={'30px'}>
        <Flex alignItems={'center'}>
          <MyIcon mr={2} name={'support/account/plans'} w={'20px'} />
          {t('account_info:package_and_usage')}
        </Flex>
        <ModelPriceModal>
          {({ onOpen }) => (
            <Button ml={4} size={'sm'} onClick={onOpen}>
              {t('account_info:billing_standard')}
            </Button>
          )}
        </ModelPriceModal>
        <Button ml={4} variant={'whitePrimary'} size={'sm'} onClick={onOpenStandardModal}>
          {t('account_info:package_details')}
        </Button>
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
                {datasetUsageMap.usedSize}/{datasetUsageMap.maxSize}
              </Box>
            </Flex>
          </Flex>
          <Box mt={3}>
            <Progress
              size={'sm'}
              value={datasetUsageMap.value}
              colorScheme={datasetUsageMap.colorScheme}
              borderRadius={'md'}
              isAnimated
              hasStripe
              borderWidth={'1px'}
              borderColor={'borderColor.low'}
            />
          </Box>
        </Box>
        <Box mt="9" width={'100%'} fontSize={'sm'}>
          <Flex alignItems={'center'}>
            <Flex alignItems={'center'}>
              <Box fontWeight={'bold'} color={'myGray.900'}>
                {t('account_info:ai_points_usage')}
              </Box>
              <QuestionTip ml={1} label={t('account_info:ai_points_usage_tip')}></QuestionTip>
              <Box color={'myGray.600'} ml={2}>
                {aiPointsUsageMap.used}/{aiPointsUsageMap.max}
              </Box>
            </Flex>
          </Flex>
          <Box mt={3}>
            <Progress
              size={'sm'}
              value={aiPointsUsageMap.value}
              colorScheme={aiPointsUsageMap.colorScheme}
              borderRadius={'md'}
              isAnimated
              hasStripe
              borderWidth={'1px'}
              borderColor={'borderColor.low'}
            />
          </Box>
        </Box>
      </Box>
      {isOpenStandardModal && <StandDetailModal onClose={onCloseStandardModal} />}
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
  const { t } = useTranslation();
  const { isPc } = useSystem();

  return (
    <Box>
      <Grid gridGap={4} mt={3}>
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
      </Grid>
    </Box>
  );
};
