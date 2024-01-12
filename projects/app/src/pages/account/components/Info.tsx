import React, { useCallback, useMemo, useRef } from 'react';
import {
  Box,
  Flex,
  Button,
  useDisclosure,
  useTheme,
  Divider,
  Select,
  Input,
  Link,
  Progress
} from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { UserUpdateParams } from '@/types/user';
import { useToast } from '@/web/common/hooks/useToast';
import { useUserStore } from '@/web/support/user/useUserStore';
import type { UserType } from '@fastgpt/global/support/user/type.d';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { compressImgFileAndUpload } from '@/web/common/file/controller';
import { feConfigs, systemVersion } from '@/web/common/system/staticData';
import { useTranslation } from 'next-i18next';
import { timezoneList } from '@fastgpt/global/common/time/timezone';
import Avatar from '@/components/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@/components/MyTooltip';
import { langMap, setLngStore } from '@/web/common/utils/i18n';
import { useRouter } from 'next/router';
import MySelect from '@/components/Select';
import { formatStorePrice2Read } from '@fastgpt/global/support/wallet/bill/tools';
import { putUpdateMemberName } from '@/web/support/user/team/api';
import { getDocPath } from '@/web/common/system/doc';
import { getTeamDatasetValidSub } from '@/web/support/wallet/sub/api';
import { MongoImageTypeEnum } from '@fastgpt/global/common/file/image/constants';

const TeamMenu = dynamic(() => import('@/components/support/user/team/TeamMenu'));
const PayModal = dynamic(() => import('./PayModal'));
const UpdatePswModal = dynamic(() => import('./UpdatePswModal'));
const OpenAIAccountModal = dynamic(() => import('./OpenAIAccountModal'));
const SubDatasetModal = dynamic(() => import('@/components/support/wallet/SubDatasetModal'));

const UserInfo = () => {
  const theme = useTheme();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { userInfo, updateUserInfo, initUserInfo } = useUserStore();
  const timezones = useRef(timezoneList());
  const { reset } = useForm<UserUpdateParams>({
    defaultValues: userInfo as UserType
  });

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
  const { isOpen: isOpenOpenai, onClose: onCloseOpenai, onOpen: onOpenOpenai } = useDisclosure();
  const {
    isOpen: isOpenSubDatasetModal,
    onClose: onCloseSubDatasetModal,
    onOpen: onOpenSubDatasetModal
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
          title: typeof err === 'string' ? err : '头像选择异常',
          status: 'warning'
        });
      }
    },
    [onclickSave, toast, userInfo]
  );

  useQuery(['init'], initUserInfo, {
    onSuccess(res) {
      reset(res);
    }
  });

  const { data: datasetSub = { maxSize: 0, usedSize: 0 } } = useQuery(
    ['getTeamDatasetValidSub'],
    getTeamDatasetValidSub
  );
  const datasetUsageMap = useMemo(() => {
    const rate = datasetSub.usedSize / datasetSub.maxSize;

    const colorScheme = (() => {
      if (rate < 0.5) return 'green';
      if (rate < 0.8) return 'yellow';
      return 'red';
    })();

    return {
      colorScheme,
      value: rate * 100,
      maxSize: datasetSub.maxSize,
      usedSize: datasetSub.usedSize
    };
  }, [datasetSub.maxSize, datasetSub.usedSize]);

  return (
    <Box
      display={['block', 'flex']}
      py={[2, 10]}
      justifyContent={'center'}
      alignItems={'flex-start'}
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
      <Box
        display={['flex', 'block']}
        flexDirection={'column'}
        alignItems={'center'}
        ml={[0, 10]}
        mt={[6, 0]}
      >
        {feConfigs.isPlus && (
          <Flex mb={4} alignItems={'center'} w={['85%', '300px']}>
            <Box flex={'0 0 80px'}>{t('user.Member Name')}:&nbsp;</Box>
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
        <Flex alignItems={'center'} w={['85%', '300px']}>
          <Box flex={'0 0 80px'}>{t('user.Account')}:&nbsp;</Box>
          <Box flex={1}>{userInfo?.username}</Box>
        </Flex>
        <Flex mt={6} alignItems={'center'} w={['85%', '300px']}>
          <Box flex={'0 0 80px'}>{t('user.Team')}:&nbsp;</Box>
          <Box flex={1}>
            <TeamMenu />
          </Box>
        </Flex>
        <Flex mt={6} alignItems={'center'} w={['85%', '300px']}>
          <Box flex={'0 0 80px'}>{t('user.Language')}:&nbsp;</Box>
          <Box flex={'1 0 0'}>
            <MySelect
              value={i18n.language}
              list={Object.entries(langMap).map(([key, lang]) => ({
                label: lang.label,
                value: key
              }))}
              onchange={(val: any) => {
                const lang = val;
                setLngStore(lang);
                router.replace(router.basePath, router.asPath, { locale: lang });
              }}
            />
          </Box>
        </Flex>
        <Flex mt={6} alignItems={'center'} w={['85%', '300px']}>
          <Box flex={'0 0 80px'}>{t('user.Timezone')}:&nbsp;</Box>
          <Select
            value={userInfo?.timezone}
            onChange={(e) => {
              if (!userInfo) return;
              onclickSave({ ...userInfo, timezone: e.target.value });
            }}
          >
            {timezones.current.map((item) => (
              <option key={item.value} value={item.value}>
                {item.name}
              </option>
            ))}
          </Select>
        </Flex>
        <Flex mt={6} alignItems={'center'} w={['85%', '300px']}>
          <Box flex={'0 0 80px'}>{t('user.Password')}:&nbsp;</Box>
          <Box flex={1}>*****</Box>
          <Button size={['sm', 'md']} variant={'whitePrimary'} ml={5} onClick={onOpenUpdatePsw}>
            {t('user.Change')}
          </Button>
        </Flex>
        {feConfigs.isPlus && (
          <>
            <Box mt={6} whiteSpace={'nowrap'} w={['85%', '300px']}>
              <Flex alignItems={'center'}>
                <Box flex={'0 0 80px'} fontSize={'md'}>
                  {t('user.team.Balance')}:&nbsp;
                </Box>
                <Box flex={1}>
                  <strong>{formatStorePrice2Read(userInfo?.team?.balance).toFixed(3)}</strong> 元
                </Box>
                {feConfigs?.show_pay && userInfo?.team?.canWrite && (
                  <Button size={['sm', 'md']} ml={5} onClick={onOpenPayModal}>
                    {t('user.Pay')}
                  </Button>
                )}
              </Flex>
            </Box>
            <Box mt={6} whiteSpace={'nowrap'} w={['85%', '300px']}>
              <Flex alignItems={'center'}>
                <Box flex={'1 0 0'} fontSize={'md'}>
                  {t('support.user.team.Dataset usage')}:&nbsp;{datasetUsageMap.usedSize}/
                  {datasetSub.maxSize}
                </Box>
                <Button size={'sm'} onClick={onOpenSubDatasetModal}>
                  {t('support.wallet.Buy more')}
                </Button>
              </Flex>
              <Box mt={1}>
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
          </>
        )}

        {feConfigs?.docUrl && (
          <Link
            href={getDocPath('/docs/intro')}
            target="_blank"
            display={'flex'}
            mt={4}
            w={['85%', '300px']}
            py={3}
            px={6}
            border={theme.borders.sm}
            borderWidth={'1.5px'}
            borderRadius={'md'}
            alignItems={'center'}
            userSelect={'none'}
            textDecoration={'none !important'}
          >
            <MyIcon name={'common/courseLight'} w={'18px'} />
            <Box ml={2} flex={1}>
              {t('system.Help Document')}
            </Box>
            <Box w={'8px'} h={'8px'} borderRadius={'50%'} bg={'#67c13b'} />
            <Box fontSize={'md'} ml={2}>
              V{systemVersion}
            </Box>
          </Link>
        )}
        {feConfigs?.chatbotUrl && (
          <Link
            href={feConfigs.chatbotUrl}
            target="_blank"
            display={'flex'}
            mt={4}
            w={['85%', '300px']}
            py={3}
            px={6}
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
        )}
        {feConfigs?.show_openai_account && (
          <>
            <Divider my={3} />

            <MyTooltip label={'点击配置账号'}>
              <Flex
                w={['85%', '300px']}
                py={4}
                px={6}
                border={theme.borders.sm}
                borderWidth={'1.5px'}
                borderRadius={'md'}
                bg={'myWhite.300'}
                alignItems={'center'}
                cursor={'pointer'}
                userSelect={'none'}
                onClick={onOpenOpenai}
              >
                <Avatar src={'/imgs/openai.png'} w={'18px'} />
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
            </MyTooltip>
          </>
        )}
      </Box>

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
      {isOpenSubDatasetModal && <SubDatasetModal onClose={onCloseSubDatasetModal} />}
      <File onSelect={onSelectFile} />
    </Box>
  );
};

export default React.memo(UserInfo);
