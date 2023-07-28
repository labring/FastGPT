import React, { useCallback } from 'react';
import { Box, Flex, Button, useDisclosure, useTheme, Divider } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { UserUpdateParams } from '@/types/user';
import { useToast } from '@/hooks/useToast';
import { useUserStore } from '@/store/user';
import { UserType } from '@/types/user';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useSelectFile } from '@/hooks/useSelectFile';
import { compressImg } from '@/utils/file';
import { getErrText } from '@/utils/tools';
import { feConfigs } from '@/store/static';
import { useTranslation } from 'react-i18next';

import Loading from '@/components/Loading';
import Avatar from '@/components/Avatar';
import MyIcon from '@/components/Icon';
import MyTooltip from '@/components/MyTooltip';

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
  const { t } = useTranslation();
  const { userInfo, updateUserInfo, initUserInfo } = useUserStore();
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
    <Box display={['block', 'flex']} py={[2, 10]} justifyContent={'center'} fontSize={['lg', 'xl']}>
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
            boxShadow={'0 0 5px rgba(0,0,0,0.1)'}
            mb={2}
          >
            <Avatar src={userInfo?.avatar} w={'100%'} h={'100%'} />
          </Box>
        </MyTooltip>

        <Flex alignItems={'center'} fontSize={'sm'} color={'myGray.600'}>
          <MyIcon mr={1} name={'edit'} w={'14px'} />
          更换
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
          <Box flex={'0 0 50px'}>账号:</Box>
          <Box flex={1}>{userInfo?.username}</Box>
        </Flex>
        <Flex mt={6} alignItems={'center'} w={['85%', '300px']}>
          <Box flex={'0 0 50px'}>密码:</Box>
          <Box flex={1}>*****</Box>
          <Button size={['sm', 'md']} variant={'base'} ml={5} onClick={onOpenUpdatePsw}>
            变更
          </Button>
        </Flex>
        {feConfigs?.show_userDetail && (
          <>
            <Box mt={6} whiteSpace={'nowrap'} w={['85%', '300px']}>
              <Flex alignItems={'center'}>
                <Box flex={'0 0 50px'}>余额:</Box>
                <Box flex={1}>
                  <strong>{userInfo?.balance.toFixed(3)}</strong> 元
                </Box>
                <Button size={['sm', 'md']} ml={5} onClick={onOpenPayModal}>
                  充值
                </Button>
              </Flex>
            </Box>

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
