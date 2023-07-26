import React, { useCallback } from 'react';
import { Box, Flex, Button, useDisclosure } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { UserUpdateParams } from '@/types/user';
import { putUserInfo } from '@/api/user';
import { useToast } from '@/hooks/useToast';
import { useGlobalStore } from '@/store/global';
import { useUserStore } from '@/store/user';
import { UserType } from '@/types/user';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useSelectFile } from '@/hooks/useSelectFile';
import { compressImg } from '@/utils/file';
import { getErrText } from '@/utils/tools';
import { feConfigs } from '@/store/static';

import Loading from '@/components/Loading';
import Avatar from '@/components/Avatar';

const PayModal = dynamic(() => import('./PayModal'), {
  loading: () => <Loading fixed={false} />,
  ssr: false
});

const UserInfo = () => {
  const router = useRouter();
  const { userInfo, updateUserInfo, initUserInfo } = useUserStore();
  const { setLoading } = useGlobalStore();
  const { reset } = useForm<UserUpdateParams>({
    defaultValues: userInfo as UserType
  });
  const { toast } = useToast();
  const {
    isOpen: isOpenPayModal,
    onClose: onClosePayModal,
    onOpen: onOpenPayModal
  } = useDisclosure();
  const { File, onOpen: onOpenSelectFile } = useSelectFile({
    fileType: '.jpg,.png',
    multiple: false
  });

  const onclickSave = useCallback(
    async (data: UserUpdateParams) => {
      setLoading(true);
      try {
        await putUserInfo({
          avatar: data.avatar
        });
        updateUserInfo({
          avatar: data.avatar
        });
        reset(data);
        toast({
          title: '更新数据成功',
          status: 'success'
        });
      } catch (error) {
        toast({
          title: getErrText(error),
          status: 'error'
        });
      }
      setLoading(false);
    },
    [reset, setLoading, toast, updateUserInfo]
  );

  const onSelectFile = useCallback(
    async (e: File[]) => {
      const file = e[0];
      if (!file) return;
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
    <Flex flexDirection={'column'} alignItems={'center'} py={[0, 8]} fontSize={['lg', 'xl']}>
      <Flex mt={6} alignItems={'center'} w={'260px'}>
        <Box flex={'0 0 50px'}>头像:</Box>
        <Box flex={1} pl={10}>
          <Avatar
            src={userInfo?.avatar}
            w={['34px', '44px']}
            h={['34px', '44px']}
            cursor={'pointer'}
            title={'点击切换头像'}
            onClick={onOpenSelectFile}
          />
        </Box>
      </Flex>
      <Flex mt={6} alignItems={'center'} w={'260px'}>
        <Box flex={'0 0 50px'}>账号:</Box>
        <Box>{userInfo?.username}</Box>
      </Flex>
      {feConfigs?.show_userDetail && (
        <Box mt={6} w={'260px'} whiteSpace={'nowrap'}>
          <Flex alignItems={'center'}>
            <Box flex={'0 0 50px'}>余额:</Box>
            <Box>
              <strong>{userInfo?.balance.toFixed(3)}</strong> 元
            </Box>
            <Button size={['xs', 'sm']} w={['70px', '80px']} ml={5} onClick={onOpenPayModal}>
              充值
            </Button>
          </Flex>
        </Box>
      )}

      {isOpenPayModal && <PayModal onClose={onClosePayModal} />}
      <File onSelect={onSelectFile} />
    </Flex>
  );
};

export default UserInfo;
