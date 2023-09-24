import React, { useCallback, useRef, useState } from 'react';
import {
  Box,
  Flex,
  Button,
  useDisclosure,
  useTheme,
  Divider,
  Select,
  Menu,
  MenuButton,
  MenuList,
  MenuItem
} from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { UserUpdateParams } from '@/types/user';
import { useToast } from '@/hooks/useToast';
import { useUserStore } from '@/store/user';
import { UserType } from '@/types/user';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useSelectFile } from '@/hooks/useSelectFile';
import { compressImg } from '@/utils/web/file';
import { feConfigs, systemVersion } from '@/store/static';
import { useTranslation } from 'next-i18next';
import { timezoneList } from '@/utils/user';
import Loading from '@/components/Loading';
import Avatar from '@/components/Avatar';
import MyIcon from '@/components/Icon';
import MyTooltip from '@/components/MyTooltip';
import { getLangStore, LangEnum, langMap, setLangStore } from '@/utils/web/i18n';
import { useRouter } from 'next/router';
import MyMenu from '@/components/MyMenu';
import MySelect from '@/components/Select';

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

  const [language, setLanguage] = useState<`${LangEnum}`>(getLangStore());

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
        const src = await compressImg({
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
        <Flex alignItems={'center'} w={['85%', '300px']}>
          <Box flex={'0 0 80px'}>{t('user.Account')}:&nbsp;</Box>
          <Box flex={1}>{userInfo?.username}</Box>
        </Flex>
        <Flex mt={6} alignItems={'center'} w={['85%', '300px']}>
          <Box flex={'0 0 80px'}>{t('user.Language')}:&nbsp;</Box>
          <Box flex={'1 0 0'}>
            <MySelect
              value={language}
              list={Object.entries(langMap).map(([key, lang]) => ({
                label: lang.label,
                value: key
              }))}
              onchange={(val: any) => {
                const lang = val;
                setLangStore(lang);
                setLanguage(lang);
                i18n?.changeLanguage?.(lang);
                router.reload();
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
            <Box flex={'0 0 80px'}>{t('user.Balance')}:&nbsp;</Box>
            <Box flex={1}>
              <strong>{userInfo?.balance.toFixed(3)}</strong> 元
            </Box>
            {feConfigs?.show_pay && (
              <Button size={['sm', 'md']} ml={5} onClick={onOpenPayModal}>
                {t('user.Pay')}
              </Button>
            )}
          </Flex>
        </Box>
        {feConfigs?.show_doc && (
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
                window.open(`https://doc.fastgpt.run/docs/intro`);
              }}
            >
              <MyIcon name={'courseLight'} w={'18px'} />
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
                  OpenAI 账号
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
