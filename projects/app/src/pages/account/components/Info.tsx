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
  Image,
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
import { compressImgFileAndUpload } from '@/web/common/file/controller';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useTranslation } from 'next-i18next';
import Avatar from '@/components/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useRouter } from 'next/router';
import { formatStorePrice2Read } from '@fastgpt/global/support/wallet/usage/tools';
import { putUpdateMemberName } from '@/web/support/user/team/api';
import { getDocPath } from '@/web/common/system/doc';
import { MongoImageTypeEnum } from '@fastgpt/global/common/file/image/constants';
import {
  StandardSubLevelEnum,
  standardSubLevelMap
} from '@fastgpt/global/support/wallet/sub/constants';
import { formatTime2YMD } from '@fastgpt/global/common/string/time';
import {
  AI_POINT_USAGE_CARD_ROUTE,
  EXTRA_PLAN_CARD_ROUTE
} from '@/web/support/wallet/sub/constants';

import StandardPlanContentList from '@/components/support/wallet/StandardPlanContentList';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';

const StandDetailModal = dynamic(() => import('./standardDetailModal'));
const TeamMenu = dynamic(() => import('@/components/support/user/team/TeamMenu'));
const PayModal = dynamic(() => import('./PayModal'));
const UpdatePswModal = dynamic(() => import('./UpdatePswModal'));
const OpenAIAccountModal = dynamic(() => import('./OpenAIAccountModal'));
const LafAccountModal = dynamic(() => import('@/components/support/laf/LafAccountModal'));
const CommunityModal = dynamic(() => import('@/components/CommunityModal'));

const Account = () => {
  const { isPc } = useSystemStore();
  const { teamPlanStatus } = useUserStore();
  const standardPlan = teamPlanStatus?.standardConstants;

  const { initUserInfo } = useUserStore();

  useQuery(['init'], initUserInfo);

  return (
    <Box py={[3, '28px']} maxW={['95vw', '1080px']} px={[5, 10]} mx={'auto'}>
      {isPc ? (
        <Flex justifyContent={'center'}>
          <Box flex={'0 0 330px'}>
            <MyInfo />
            <Box mt={9}>
              <Other />
            </Box>
          </Box>
          {!!standardPlan && (
            <Box ml={'45px'} flex={'1 0 0'} maxW={'600px'}>
              <PlanUsage />
            </Box>
          )}
        </Flex>
      ) : (
        <>
          <MyInfo />
          {!!standardPlan && <PlanUsage />}
          <Other />
        </>
      )}
    </Box>
  );
};

export default React.memo(Account);

const MyInfo = () => {
  const theme = useTheme();
  const { feConfigs } = useSystemStore();
  const { t } = useTranslation();
  const { userInfo, updateUserInfo } = useUserStore();
  const { reset } = useForm<UserUpdateParams>({
    defaultValues: userInfo as UserType
  });
  const { isPc } = useSystemStore();

  const { toast } = useToast();
  const {
    isOpen: isOpenPayModal,
    onClose: onClosePayModal,
    onOpen: onOpenPayModal
  } = useDisclosure();
  const {
    isOpen: isOpenUpdatePsw,
    onClose: onCloseUpdatePsw,
    onOpen: onOpenUpdatePsw
  } = useDisclosure();
  const { File, onOpen: onOpenSelectFile } = useSelectFile({
    fileType: '.jpg,.png',
    multiple: false
  });

  const onclickSave = useCallback(
    async (data: UserType) => {
      await updateUserInfo({
        avatar: data.avatar,
        timezone: data.timezone,
        openaiAccount: data.openaiAccount
      });
      reset(data);
      toast({
        title: t('dataset.data.Update Success Tip'),
        status: 'success'
      });
    },
    [reset, t, toast, updateUserInfo]
  );

  const onSelectFile = useCallback(
    async (e: File[]) => {
      const file = e[0];
      if (!file || !userInfo) return;
      try {
        const src = await compressImgFileAndUpload({
          type: MongoImageTypeEnum.userAvatar,
          file,
          maxW: 300,
          maxH: 300
        });

        onclickSave({
          ...userInfo,
          avatar: src
        });
      } catch (err: any) {
        toast({
          title: typeof err === 'string' ? err : t('common.error.Select avatar failed'),
          status: 'warning'
        });
      }
    },
    [onclickSave, t, toast, userInfo]
  );

  const labelStyles: BoxProps = {
    flex: '0 0 80px',
    fontSize: 'sm',
    color: 'myGray.900'
  };

  return (
    <Box>
      {/* user info */}
      {isPc && (
        <Flex alignItems={'center'} fontSize={'md'} h={'30px'}>
          <MyIcon mr={2} name={'support/user/userLight'} w={'1.25rem'} />
          {t('support.user.User self info')}
        </Flex>
      )}

      <Box mt={[0, 6]} fontSize={'sm'}>
        {isPc ? (
          <Flex alignItems={'center'} cursor={'pointer'}>
            <Box {...labelStyles}>{t('support.user.Avatar')}:&nbsp;</Box>

            <MyTooltip label={t('common.avatar.Select Avatar')}>
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
            <MyTooltip label={t('common.avatar.Select Avatar')}>
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
              {t('user.Replace')}
            </Flex>
          </Flex>
        )}
        {feConfigs.isPlus && (
          <Flex mt={[0, 4]} alignItems={'center'}>
            <Box {...labelStyles}>{t('user.Member Name')}:&nbsp;</Box>
            <Input
              flex={'1 0 0'}
              defaultValue={userInfo?.team?.memberName || 'Member'}
              title={t('user.Edit name')}
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
          <Box {...labelStyles}>{t('user.Account')}:&nbsp;</Box>
          <Box flex={1}>{userInfo?.username}</Box>
        </Flex>
        {feConfigs.isPlus && (
          <Flex mt={6} alignItems={'center'}>
            <Box {...labelStyles}>{t('user.Password')}:&nbsp;</Box>
            <Box flex={1}>*****</Box>
            <Button size={'sm'} variant={'whitePrimary'} onClick={onOpenUpdatePsw}>
              {t('user.Change')}
            </Button>
          </Flex>
        )}
        <Flex mt={6} alignItems={'center'}>
          <Box {...labelStyles}>{t('user.Team')}:&nbsp;</Box>
          <Box flex={1}>
            <TeamMenu />
          </Box>
        </Flex>
        {feConfigs.isPlus && (
          <Box mt={6} whiteSpace={'nowrap'}>
            <Flex alignItems={'center'}>
              <Box {...labelStyles}>{t('user.team.Balance')}:&nbsp;</Box>
              <Box flex={1}>
                <strong>{formatStorePrice2Read(userInfo?.team?.balance).toFixed(3)}</strong> 元
              </Box>
              {feConfigs?.show_pay && userInfo?.team?.permission.hasWritePer && (
                <Button variant={'whitePrimary'} size={'sm'} ml={5} onClick={onOpenPayModal}>
                  {t('user.Pay')}
                </Button>
              )}
            </Flex>
          </Box>
        )}
      </Box>
      {isOpenPayModal && <PayModal onClose={onClosePayModal} />}
      {isOpenUpdatePsw && <UpdatePswModal onClose={onCloseUpdatePsw} />}
      <File onSelect={onSelectFile} />
    </Box>
  );
};
const PlanUsage = () => {
  const router = useRouter();
  const { t } = useTranslation();
  const { userInfo, initUserInfo, teamPlanStatus } = useUserStore();
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
        maxSize: t('common.Unlimited'),
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
      maxSize: teamPlanStatus.datasetMaxSize || t('common.Unlimited'),
      usedSize: teamPlanStatus.usedDatasetSize
    };
  }, [teamPlanStatus, t]);
  const aiPointsUsageMap = useMemo(() => {
    if (!teamPlanStatus) {
      return {
        colorScheme: 'green',
        value: 0,
        maxSize: t('common.Unlimited'),
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
      max: teamPlanStatus.totalPoints ? teamPlanStatus.totalPoints : t('common.Unlimited'),
      used: teamPlanStatus.usedPoints ? Math.round(teamPlanStatus.usedPoints) : 0
    };
  }, [teamPlanStatus, t]);

  return standardPlan ? (
    <Box mt={[6, 0]}>
      <Flex fontSize={'lg'} h={'30px'}>
        <Flex alignItems={'center'}>
          <MyIcon mr={2} name={'support/account/plans'} w={'20px'} />
          {t('support.wallet.subscription.Team plan and usage')}
        </Flex>
        <Button ml={4} size={'sm'} onClick={() => router.push(AI_POINT_USAGE_CARD_ROUTE)}>
          {t('support.user.Price')}
        </Button>
        <Button ml={4} variant={'whitePrimary'} size={'sm'} onClick={onOpenStandardModal}>
          {t('support.wallet.Standard Plan Detail')}
        </Button>
      </Flex>
      <Box
        mt={[3, 6]}
        bg={'white'}
        borderWidth={'1px'}
        borderColor={'borderColor.low'}
        borderRadius={'md'}
      >
        <Flex px={[5, 7]} py={[3, 6]}>
          <Box flex={'1 0 0'}>
            <Box color={'myGray.600'} fontSize="sm">
              {t('support.wallet.subscription.Current plan')}
            </Box>
            <Box fontWeight={'bold'} fontSize="lg">
              {t(planName)}
            </Box>

            {isFreeTeam ? (
              <>
                <Flex mt="2" color={'#485264'} fontSize="sm">
                  <Box>{t('support.wallet.Plan reset time')}:</Box>
                  <Box ml={2}>{formatTime2YMD(standardPlan?.expiredTime)}</Box>
                </Flex>
                <Box mt="2" color={'#485264'} fontSize="sm">
                  免费版用户30天无任何使用记录时，系统会自动清理账号知识库。
                </Box>
              </>
            ) : (
              <Flex mt="2" color={'#485264'} fontSize="xs">
                <Box>{t('support.wallet.Plan expired time')}:</Box>
                <Box ml={2}>{formatTime2YMD(standardPlan?.expiredTime)}</Box>
              </Flex>
            )}
          </Box>
          <Button onClick={() => router.push('/price')} w={'8rem'} size="sm">
            {t('support.wallet.subscription.Upgrade plan')}
          </Button>
        </Flex>
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
        pt={[2, 4]}
        pb={[4, 7]}
      >
        <Flex>
          <Flex flex={'1 0 0'} alignItems={'flex-end'}>
            <Box fontSize={'md'}>资源用量</Box>
            <Box fontSize={'xs'} color={'myGray.500'}>
              (包含标准套餐与额外资源包)
            </Box>
          </Flex>
          <Link
            href={EXTRA_PLAN_CARD_ROUTE}
            transform={'translateX(15px)'}
            display={'flex'}
            alignItems={'center'}
            color={'primary.600'}
            cursor={'pointer'}
            fontSize={'sm'}
          >
            购买额外套餐
            <MyIcon ml={1} name={'common/rightArrowLight'} w={'12px'} />
          </Link>
        </Flex>
        <Box width={'100%'} mt={5} fontSize={'sm'}>
          <Flex alignItems={'center'}>
            <Flex alignItems={'center'}>
              <Box fontWeight={'bold'} color={'myGray.900'}>
                {t('support.user.team.Dataset usage')}
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
                {t('support.wallet.subscription.AI points usage')}
              </Box>
              <QuestionTip
                ml={1}
                label={t('support.wallet.subscription.AI points usage tip')}
              ></QuestionTip>
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
const Other = () => {
  const theme = useTheme();
  const { toast } = useToast();
  const { feConfigs } = useSystemStore();
  const { t } = useTranslation();
  const { userInfo, updateUserInfo } = useUserStore();
  const { reset } = useForm<UserUpdateParams>({
    defaultValues: userInfo as UserType
  });
  const { isOpen: isOpenLaf, onClose: onCloseLaf, onOpen: onOpenLaf } = useDisclosure();
  const { isOpen: isOpenOpenai, onClose: onCloseOpenai, onOpen: onOpenOpenai } = useDisclosure();
  const { isOpen: isOpenConcat, onClose: onCloseConcat, onOpen: onOpenConcat } = useDisclosure();

  const onclickSave = useCallback(
    async (data: UserType) => {
      await updateUserInfo({
        avatar: data.avatar,
        timezone: data.timezone,
        openaiAccount: data.openaiAccount
      });
      reset(data);
      toast({
        title: '更新数据成功',
        status: 'success'
      });
    },
    [reset, toast, updateUserInfo]
  );
  return (
    <Box>
      <Grid gridGap={4} mt={3}>
        {feConfigs?.docUrl && (
          <Link
            bg={'white'}
            href={getDocPath('/docs/intro')}
            target="_blank"
            display={'flex'}
            py={3}
            px={6}
            border={theme.borders.sm}
            borderWidth={'1.5px'}
            borderRadius={'md'}
            alignItems={'center'}
            userSelect={'none'}
            textDecoration={'none !important'}
            fontSize={'sm'}
          >
            <MyIcon name={'common/courseLight'} w={'18px'} color={'myGray.600'} />
            <Box ml={2} flex={1}>
              {t('system.Help Document')}
            </Box>
          </Link>
        )}
        {feConfigs?.chatbotUrl && (
          <Link
            href={feConfigs.chatbotUrl}
            target="_blank"
            display={'flex'}
            py={3}
            px={6}
            bg={'white'}
            border={theme.borders.sm}
            borderWidth={'1.5px'}
            borderRadius={'md'}
            alignItems={'center'}
            userSelect={'none'}
            textDecoration={'none !important'}
            fontSize={'sm'}
          >
            <MyIcon name={'core/app/aiLight'} w={'18px'} />
            <Box ml={2} flex={1}>
              {t('common.system.Help Chatbot')}
            </Box>
          </Link>
        )}

        {feConfigs?.lafEnv && userInfo?.team.role === TeamMemberRoleEnum.owner && (
          <Flex
            bg={'white'}
            py={3}
            px={6}
            border={theme.borders.sm}
            borderWidth={'1.5px'}
            borderRadius={'md'}
            alignItems={'center'}
            cursor={'pointer'}
            userSelect={'none'}
            onClick={onOpenLaf}
            fontSize={'sm'}
          >
            <Image src="/imgs/workflow/laf.png" w={'18px'} alt="laf" />
            <Box ml={2} flex={1}>
              laf 账号
            </Box>
            <Box
              w={'9px'}
              h={'9px'}
              borderRadius={'50%'}
              bg={userInfo?.team.lafAccount?.token ? '#67c13b' : 'myGray.500'}
            />
          </Flex>
        )}

        {feConfigs?.show_openai_account && (
          <Flex
            bg={'white'}
            py={3}
            px={6}
            border={theme.borders.sm}
            borderWidth={'1.5px'}
            borderRadius={'md'}
            alignItems={'center'}
            cursor={'pointer'}
            userSelect={'none'}
            onClick={onOpenOpenai}
            fontSize={'sm'}
          >
            <MyIcon name={'common/openai'} w={'18px'} color={'myGray.600'} />
            <Box ml={2} flex={1}>
              OpenAI/OneAPI 账号
            </Box>
            <Box
              w={'9px'}
              h={'9px'}
              borderRadius={'50%'}
              bg={userInfo?.openaiAccount?.key ? '#67c13b' : 'myGray.500'}
            />
          </Flex>
        )}
        {feConfigs?.concatMd && (
          <Button
            variant={'whiteBase'}
            justifyContent={'flex-start'}
            leftIcon={<MyIcon name={'modal/concat'} w={'18px'} color={'myGray.600'} />}
            onClick={onOpenConcat}
            h={'48px'}
            fontSize={'sm'}
          >
            联系我们
          </Button>
        )}
      </Grid>

      {isOpenLaf && userInfo && (
        <LafAccountModal defaultData={userInfo?.team.lafAccount} onClose={onCloseLaf} />
      )}
      {isOpenOpenai && userInfo && (
        <OpenAIAccountModal
          defaultData={userInfo?.openaiAccount}
          onSuccess={(data) =>
            onclickSave({
              ...userInfo,
              openaiAccount: data
            })
          }
          onClose={onCloseOpenai}
        />
      )}
      {isOpenConcat && <CommunityModal onClose={onCloseConcat} />}
    </Box>
  );
};
