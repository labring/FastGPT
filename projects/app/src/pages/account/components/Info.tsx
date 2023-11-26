import React, { useCallback, useRef } from 'react';
import {
  Box,
  Flex,
  Button,
  useDisclosure,
  useTheme,
  Divider,
  Select,
  Input
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
import Loading from '@/components/Loading';
import Avatar from '@/components/Avatar';
import MyIcon from '@/components/Icon';
import MyTooltip from '@/components/MyTooltip';
import { langMap, setLngStore } from '@/web/common/utils/i18n';
import { useRouter } from 'next/router';
import MySelect from '@/components/Select';
import { formatPrice } from '@fastgpt/global/support/wallet/bill/tools';
import { putUpdateMemberName } from '@/web/support/user/team/api';

const TeamMenu = dynamic(() => import('@/components/support/user/team/TeamMenu'));
const PayModal = dynamic(() => import('./PayModal'), {
  loading: () => <Loading fixed={false} />,
  ssr: false
});
const UpdatePswModal = dynamic(() => import('./UpdatePswModal'), {
  loading: () => <Loading fixed={false} />,
  ssr: false
});
const OpenAIAccountModal = dynamic(() => import('./OpenAIAccountModal'), {
  loading: () => <Loading fixed={false} />,
  ssr: false
});

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
          file,
          maxW: 100,
          maxH: 100
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

  return (
    <Box
      display={['block', 'flex']}
      py={[2, 10]}
      justifyContent={'center'}
      alignItems={'flex-start'}
      fontSize={['lg', 'xl']}
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
          <Button size={['sm', 'md']} variant={'base'} ml={5} onClick={onOpenUpdatePsw}>
            {t('user.Change')}
          </Button>
        </Flex>
        <Box mt={6} whiteSpace={'nowrap'} w={['85%', '300px']}>
          <Flex alignItems={'center'}>
            <Box flex={'0 0 80px'} fontSize={'md'}>
              {t('user.team.Balance')}:&nbsp;
            </Box>
            <Box flex={1}>
              <strong>{formatPrice(userInfo?.team?.balance).toFixed(3)}</strong> 元
            </Box>
            {feConfigs?.show_pay && userInfo?.team?.canWrite && (
              <Button size={['sm', 'md']} ml={5} onClick={onOpenPayModal}>
                {t('user.Pay')}
              </Button>
            )}
          </Flex>
        </Box>
        {feConfigs?.docUrl && (
          <>
            <Flex
              mt={4}
              w={['85%', '300px']}
              py={3}
              px={6}
              border={theme.borders.sm}
              borderWidth={'1.5px'}
              borderRadius={'md'}
              alignItems={'center'}
              cursor={'pointer'}
              userSelect={'none'}
              onClick={() => {
                window.open(`${feConfigs.docUrl}/docs/intro`);
              }}
            >
              <MyIcon name={'common/courseLight'} w={'18px'} />
              <Box ml={2} flex={1}>
                {t('system.Help Document')}
              </Box>
              <Box w={'8px'} h={'8px'} borderRadius={'50%'} bg={'#67c13b'} />
              <Box fontSize={'md'} ml={2}>
                V{systemVersion}
              </Box>
            </Flex>
          </>
        )}
        {feConfigs?.show_openai_account && (
          <>
            <Divider my={3} />

            <MyTooltip label={'点击配置账号'}>
              <Flex
                w={['85%', '300px']}
                py={3}
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
      <File onSelect={onSelectFile} />
    </Box>
  );
};

export default UserInfo;
