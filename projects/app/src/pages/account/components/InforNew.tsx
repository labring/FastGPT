import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Box,
  Flex,
  Button,
  useDisclosure,
  useTheme,
  Text,
  Spacer,
  Stack,
  Divider,
  Select,
  Input,
  Link,
  Progress
} from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { UserUpdateParams } from '@/types/user';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useUserStore } from '@/web/support/user/useUserStore';
import type { UserType } from '@fastgpt/global/support/user/type.d';
import { FeTeamSubType, TeamSubSchema } from '@fastgpt/global/support/wallet/sub/type';
import { standardInfoMap } from '@fastgpt/global/support/user/constant';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { compressImgFileAndUpload } from '@/web/common/file/controller';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useTranslation } from 'next-i18next';
import { timezoneList } from '@fastgpt/global/common/time/timezone';
import Avatar from '@/components/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@/components/MyTooltip';
import { langMap, setLngStore } from '@/web/common/utils/i18n';
import { useRouter } from 'next/router';
import { formatStorePrice2Read } from '@fastgpt/global/support/wallet/usage/tools';
import { putUpdateMemberName } from '@/web/support/user/team/api';
import { getDocPath } from '@/web/common/system/doc';
import { getTeamDatasetValidSub } from '@/web/support/wallet/sub/api';
import { MongoImageTypeEnum } from '@fastgpt/global/common/file/image/constants';
const StandDetailModal = dynamic(() => import('./standardDetailModal'));
const TeamMenu = dynamic(() => import('@/components/support/user/team/TeamMenu'));
const PayModal = dynamic(() => import('./PayModal'));
const UpdatePswModal = dynamic(() => import('./UpdatePswModal'));
const OpenAIAccountModal = dynamic(() => import('./OpenAIAccountModal'));
const SubDatasetModal = dynamic(() => import('@/components/support/wallet/QRCodePayModal'));

const UserInfo = () => {
  const theme = useTheme();
  const router = useRouter();
  const { feConfigs, systemVersion } = useSystemStore();
  const { t, i18n } = useTranslation();
  const { userInfo, updateUserInfo, setUserInfo, initUserInfo } = useUserStore();
  const [standardInfo, setStandardInfo] = useState<FeTeamSubType>();
  const timezones = useRef(timezoneList());
  const { reset } = useForm<UserUpdateParams>({
    defaultValues: userInfo as UserType
  });
  const IconList = {
    baseInfor: {
      icon: 'acount/cube',
      label: t('user.Personal Information'),
      id: null
    }
  };

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
  const {
    isOpen: isOpenStandardModal,
    onClose: onCloseStandardModal,
    onOpen: onOpenStandardModal
  } = useDisclosure();
  const { isOpen: isOpenOpenai, onClose: onCloseOpenai, onOpen: onOpenOpenai } = useDisclosure();
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
        title: '更新数据成功',
        status: 'success'
      });
    },
    [reset, toast, updateUserInfo]
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

  useQuery(['init'], initUserInfo, {
    onSuccess(res) {
      reset(res);
    }
  });

  const {
    data: teamSubPlan = { totalPoints: 0, usedPoints: 0, datasetMaxSize: 800, usedDatasetSize: 0 }
  } = useQuery(['getTeamDatasetValidSub'], async () => {
    const res = await getTeamDatasetValidSub();
    if (res) {
      const {
        standard = { currentSubLevel: 'free', expiredTime: new Date() },
        datasetMaxSize = 0,
        standardMaxDatasetSize = 0,
        standardMaxPoints = 0,
        totalPoints = 0,
        usedDatasetSize = 0,
        usedPoints = 0
      } = res;

      setStandardInfo({
        standard: standard as TeamSubSchema,
        datasetMaxSize: datasetMaxSize,
        standardMaxDatasetSize: standardMaxDatasetSize,
        standardMaxPoints: standardMaxPoints,
        totalPoints: totalPoints,
        usedDatasetSize: usedDatasetSize,
        usedPoints: usedPoints
      });
      return res;
    }
  });
  const datasetUsageMap = useMemo(() => {
    const rate = teamSubPlan.usedDatasetSize / teamSubPlan.datasetMaxSize;

    const colorScheme = (() => {
      if (rate < 0.5) return 'green';
      if (rate < 0.8) return 'yellow';
      return 'red';
    })();

    return {
      colorScheme,
      value: rate * 100,
      maxSize: teamSubPlan.datasetMaxSize || t('common.Unlimited'),
      usedSize: teamSubPlan.usedDatasetSize
    };
  }, [teamSubPlan.usedDatasetSize, teamSubPlan.datasetMaxSize, t]);

  return (
    <Box m={[24, 16]}>
      <Flex alignItems={'center'} fontSize={'2xl'} as="b">
        <MyIcon mr={2} name={'acount/user'} w={'20px'} />
        个人信息
      </Flex>
      <Flex
        mt="5"
        p={[8, 12]}
        bg={'white'}
        borderWidth={'1px'}
        borderColor={'borderColor.base'}
        borderRadius={'md'}
        alignItems={'center'}
        w={'100%'}
      >
        <Flex
          flexDirection={'column'}
          alignItems={'center'}
          cursor={'pointer'}
          onClick={onOpenSelectFile}
        >
          <MyTooltip label={'更换头像'}>
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
        <Spacer></Spacer>
        <Flex ml="8" justifyContent={'space-between'} w={'100%'}>
          <Box w={'50%'}>
            {feConfigs.isPlus && (
              <Flex mb={4} alignItems={'center'} w={'100%'}>
                <Box flex={'0 0 80px'} as="b">
                  {t('user.Member Name')}:&nbsp;
                </Box>
                <Input
                  flex={1}
                  defaultValue={userInfo?.team?.memberName || 'Member'}
                  title={t('user.Edit name')}
                  borderColor={'transparent'}
                  pl={'10px'}
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
            <Flex alignItems={'center'} w={'90%'}>
              <Box flex={'0 0 80px'} as="b">
                {t('user.Account')}:&nbsp;
              </Box>
              <Box flex={1}>{userInfo?.username}</Box>
            </Flex>
            <Flex mt={3.5} alignItems={'center'} w={'80%'}>
              <Box flex={'0 0 80px'} as="b">
                {t('user.Password')}:&nbsp;
              </Box>
              <Box flex={1}>*****</Box>
              <Button size={['sm', 'md']} variant={'whitePrimary'} ml={5} onClick={onOpenUpdatePsw}>
                {t('user.Change')}
              </Button>
            </Flex>
          </Box>
          <Box w={'50%'}>
            <Flex alignItems={'center'} w={'90%'}>
              <Box flex={'0 0 80px'} as="b">
                {t('user.Team')}:&nbsp;
              </Box>
              <Box flex={1}>
                <TeamMenu />
              </Box>
            </Flex>
            {feConfigs.isPlus && (
              <>
                <Box mt={3.5} whiteSpace={'nowrap'} w={'90%'}>
                  <Flex alignItems={'center'}>
                    <Box flex={'0 0 80px'} fontSize={'md'} as="b">
                      {t('user.team.Balance')}:&nbsp;
                    </Box>
                    <Box flex={1}>
                      <strong>{formatStorePrice2Read(userInfo?.team?.balance).toFixed(3)}</strong>{' '}
                      元
                    </Box>
                    {feConfigs?.show_pay && userInfo?.team?.canWrite && (
                      <Button size={['sm', 'md']} ml={5} onClick={onOpenPayModal}>
                        {t('user.Pay')}
                      </Button>
                    )}
                  </Flex>
                </Box>
              </>
            )}
          </Box>
        </Flex>
      </Flex>
      <Flex mt="20" alignItems={'center'} fontSize={'2xl'} as="b">
        <MyIcon mr={2} name={'acount/plans'} w={'20px'} />
        套餐与用量
        <Button ml="4" variant={'whitePrimary'}>
          计费标准
        </Button>
        <Button ml="4" variant={'whitePrimary'} onClick={onOpenStandardModal}>
          套餐详情
        </Button>
      </Flex>
      <Flex mt="5" justifyContent={'space-between'} w={'100%'}>
        <Flex
          bg={'white'}
          borderWidth={'1px'}
          borderColor={'E8EBF0'}
          alignItems={'center'}
          borderRadius="md"
          height={250}
          width={'48%'}
        >
          <Stack
            borderLeftWidth={'1px'}
            bg={'white'}
            p="6"
            spacing={3}
            borderLeftRadius="md"
            minWidth={280}
            borderRightWidth={'.5px'}
            borderColor={'E8EBF0'}
          >
            <Text color={'#485264'} fontSize="l">
              当前套餐
            </Text>
            <Text color={'#485264'} fontSize="xl" as="b">
              {'免费套餐'}
            </Text>
            <Text mt="4" color={'#485264'} fontSize="m">
              {'过期时间：  ' + standardInfo?.standard?.expiredTime}
            </Text>
            <Button mt="7" colorScheme="blue">
              升级套餐
            </Button>
          </Stack>
          <Stack bg={'white'} overflow={'scroll'} p={[8, 8]} mr="2" width={'100%'} height={'100%'}>
            <Flex alignItems={'center'}>
              <MyIcon mr={2} name={'acount/check'} w={'20px'} />
              {standardInfo?.standard?.currentSubLevel &&
                standardInfoMap[
                  standardInfo.standard?.currentSubLevel as keyof typeof standardInfoMap
                ].maxTeamNum + '个成员'}
            </Flex>
            <Flex mt="1" alignItems={'center'}>
              <MyIcon mr={2} name={'acount/check'} w={'20px'} />
              {standardInfo?.standard?.currentSubLevel &&
                standardInfoMap[
                  standardInfo.standard?.currentSubLevel as keyof typeof standardInfoMap
                ]?.maxAppNum + '个应用插件'}
            </Flex>
            <Flex mt="1" alignItems={'center'}>
              <MyIcon mr={2} name={'acount/check'} w={'20px'} />
              {standardInfo?.standardMaxPoints + '个知识库'}
            </Flex>
            <Flex mt="1" alignItems={'center'}>
              <MyIcon mr={2} name={'acount/check'} w={'20px'} />
              {standardInfo?.standard?.currentSubLevel &&
                standardInfoMap[
                  standardInfo.standard?.currentSubLevel as keyof typeof standardInfoMap
                ]?.maxPreservation + '天历史记录保持'}
            </Flex>
            <Flex mt="1" alignItems={'center'}>
              <MyIcon mr={2} name={'acount/check'} w={'20px'} />
              {standardInfo?.datasetMaxSize + '个向量存储'}
            </Flex>
            {standardInfo?.standard?.currentSubLevel &&
              standardInfoMap[
                standardInfo.standard?.currentSubLevel as keyof typeof standardInfoMap
              ]?.other.map((item: string, index: number) => {
                return (
                  <Flex key={index} mt="1" alignItems={'center'}>
                    <MyIcon mr={2} name={'acount/check'} w={'20px'} />
                    {item}
                  </Flex>
                );
              })}
          </Stack>
        </Flex>
        <Box
          p={[10, 12]}
          bg={'white'}
          borderWidth={'1px'}
          borderColor={'E8EBF0'}
          alignItems={'center'}
          borderRadius="md"
          height={250}
          width={'48%'}
        >
          <Box width={'100%'}>
            <Flex alignItems={'center'} justifyContent={'space-between'} width={'100%'}>
              <Flex alignItems={'center'} as="b" mr="3" fontSize="2xl">
                知识库存储
                <Text fontWeight="500" fontSize="xl" color="#485264" ml="3">
                  {standardInfo?.usedDatasetSize + ' / ' + standardInfo?.standardMaxPoints + '  组'}
                </Text>
              </Flex>
              <Flex alignItems={'center'}>
                <Text color={'#2B5FD9'} fontWeight={'500'} mr="2" fontSize="l">
                  购买额外存储
                </Text>
                <MyIcon name={'acount/arrowRight'} w={'20px'} />
              </Flex>
            </Flex>
            <Box mt={3}>
              <Progress
                value={datasetUsageMap.value}
                colorScheme={datasetUsageMap.colorScheme}
                borderRadius={'md'}
                isAnimated
                hasStripe
                borderWidth={'1px'}
                borderColor={'borderColor.base'}
              />
            </Box>
          </Box>
          <Box mt="9" width={'100%'}>
            <Flex alignItems={'center'} justifyContent={'space-between'} width={'100%'}>
              <Flex alignItems={'center'} as="b" fontSize="2xl">
                AI 积分
                <Text color="#485264" fontWeight="500" ml="3" fontSize="l">
                  {standardInfo?.usedDatasetSize +
                    ' / ' +
                    standardInfo?.standardMaxPoints +
                    '  积分'}
                </Text>
              </Flex>
              <Flex alignItems={'center'}>
                <Text color={'#2B5FD9'} fontWeight="500" mr="2" fontSize="l">
                  购买额外积分
                </Text>
                <MyIcon name={'acount/arrowRight'} w={'20px'} />
              </Flex>
            </Flex>
            <Box mt={3}>
              <Progress
                value={30}
                borderRadius={'md'}
                isAnimated
                borderWidth={'1px'}
                borderColor={'#E8EBF0'}
              />
            </Box>
          </Box>
          <Flex></Flex>
        </Box>
      </Flex>
      <Flex alignItems={'center'} mt="20" fontSize={'2xl'} as="b">
        <MyIcon mr={2} name={'acount/cube'} w={'20px'} />
        其它
      </Flex>
      <Flex mt="5" width={'100%'} justifyContent={'space-between'}>
        {feConfigs?.docUrl && (
          <Link
            bg={'white'}
            href={getDocPath('/docs/intro')}
            target="_blank"
            display={'flex'}
            w={'32%'}
            py={3}
            px={6}
            border={theme.borders.sm}
            borderWidth={'1.5px'}
            borderRadius={'md'}
            alignItems={'center'}
            userSelect={'none'}
            textDecoration={'none !important'}
          >
            <MyIcon name={'common/courseLight'} w={'18px'} color={'myGray.600'} />
            <Box ml={2} flex={1}>
              {t('system.Help Document')}
            </Box>
            <Box w={'8px'} h={'8px'} borderRadius={'50%'} bg={'#67c13b'} />
            <Box fontSize={'md'} ml={2}>
              V{systemVersion}
            </Box>
          </Link>
        )}
        <Link
          href={feConfigs.chatbotUrl}
          target="_blank"
          display={'flex'}
          w={'32%'}
          py={3}
          px={6}
          bg={'white'}
          border={theme.borders.sm}
          borderWidth={'1.5px'}
          borderRadius={'md'}
          alignItems={'center'}
          userSelect={'none'}
          textDecoration={'none !important'}
        >
          <MyIcon name={'core/app/aiLight'} w={'18px'} />
          <Box ml={2} flex={1}>
            {t('common.system.Help Chatbot')}
          </Box>
        </Link>

        {feConfigs?.show_openai_account && (
          <Flex
            bg={'white'}
            width={'32%'}
            py={4}
            px={6}
            border={theme.borders.sm}
            borderWidth={'1.5px'}
            borderRadius={'md'}
            alignItems={'center'}
            cursor={'pointer'}
            userSelect={'none'}
            onClick={onOpenOpenai}
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
      </Flex>

      {isOpenPayModal && <PayModal onClose={onClosePayModal} />}
      {isOpenUpdatePsw && <UpdatePswModal onClose={onCloseUpdatePsw} />}
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
      {isOpenStandardModal && <StandDetailModal onClose={onCloseStandardModal} />}
      <File onSelect={onSelectFile} />
    </Box>
  );
};

export default React.memo(UserInfo);
