import React, { useCallback, useState } from 'react';
import { Card, Box, Flex, Button, Input, Image } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { UserUpdateParams } from '@/types/user';
import { putUserInfo } from '@/api/user';
import { useToast } from '@/hooks/useToast';
import { useGlobalStore } from '@/store/global';
import { useUserStore } from '@/store/user';
import { UserType } from '@/types/user';
import { clearToken } from '@/utils/user';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useSelectFile } from '@/hooks/useSelectFile';
import { compressImg } from '@/utils/file';

const PayRecordTable = dynamic(() => import('./components/PayRecordTable'));
const BilTable = dynamic(() => import('./components/BillTable'));
const PayModal = dynamic(() => import('./components/PayModal'));

const NumberSetting = () => {
  const router = useRouter();
  const { userInfo, updateUserInfo, initUserInfo, setUserInfo } = useUserStore();
  const { setLoading } = useGlobalStore();
  const { register, handleSubmit } = useForm<UserUpdateParams>({
    defaultValues: userInfo as UserType
  });
  const [showPay, setShowPay] = useState(false);
  const { toast } = useToast();

  const { File, onOpen: onOpenSelectFile } = useSelectFile({
    fileType: '.jpg,.png',
    multiple: false
  });

  const onclickSave = useCallback(
    async (data: UserUpdateParams) => {
      if (data.openaiKey === userInfo?.openaiKey) return;
      setLoading(true);
      try {
        await putUserInfo(data);
        updateUserInfo(data);
        toast({
          title: '更新成功',
          status: 'success'
        });
      } catch (error) {}
      setLoading(false);
    },
    [setLoading, toast, updateUserInfo, userInfo?.openaiKey]
  );

  const onSelectFile = useCallback(
    async (e: File[]) => {
      const file = e[0];
      if (!file) return;
      try {
        const base64 = await compressImg({
          file,
          maxW: 40,
          maxH: 60
        });
        onclickSave({
          ...userInfo,
          avatar: base64
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

  const onclickLogOut = useCallback(() => {
    clearToken();
    setUserInfo(null);
    router.replace('/login');
  }, [router, setUserInfo]);

  useQuery(['init'], initUserInfo);

  return (
    <Box py={[5, 10]} px={'5vw'}>
      {/* 核心信息 */}
      <Card px={6} py={4}>
        <Flex justifyContent={'space-between'}>
          <Box fontSize={'xl'} fontWeight={'bold'}>
            账号信息
          </Box>
          <Button variant={'outline'} size={'xs'} onClick={onclickLogOut}>
            退出登录
          </Button>
        </Flex>
        <Flex mt={6} alignItems={'center'}>
          <Box flex={'0 0 50px'}>头像:</Box>
          <Image
            src={userInfo?.avatar}
            alt={'avatar'}
            w={['28px', '36px']}
            h={['28px', '36px']}
            objectFit={'cover'}
            cursor={'pointer'}
            title={'点击切换头像'}
            onClick={onOpenSelectFile}
          />
        </Flex>
        <Flex mt={6} alignItems={'center'}>
          <Box flex={'0 0 50px'}>账号:</Box>
          <Box>{userInfo?.username}</Box>
        </Flex>
        <Box mt={6}>
          <Flex alignItems={'center'}>
            <Box flex={'0 0 50px'}>余额:</Box>
            <Box>
              <strong>{userInfo?.balance}</strong> 元
            </Box>
            <Button
              size={['xs', 'sm']}
              w={['70px', '80px']}
              ml={5}
              onClick={() => setShowPay(true)}
            >
              充值
            </Button>
          </Flex>
          <Box fontSize={'xs'} color={'blackAlpha.500'}>
            如果填写了自己的 openai 账号，将不会计费
          </Box>
        </Box>
        <Flex mt={6} alignItems={'center'}>
          <Box flex={'0 0 85px'}>openaiKey:</Box>
          <Input
            {...register(`openaiKey`)}
            maxW={'300px'}
            placeholder={'openai账号。回车或失去焦点保存'}
            size={'sm'}
            onBlur={handleSubmit(onclickSave)}
            onKeyDown={(e) => {
              if (e.keyCode === 13) {
                handleSubmit(onclickSave)();
              }
            }}
          ></Input>
        </Flex>
      </Card>

      <File onSelect={onSelectFile} />
      {/* 充值记录 */}
      <PayRecordTable />
      {/* 账单表 */}
      <BilTable />
      {showPay && <PayModal onClose={() => setShowPay(false)} />}
    </Box>
  );
};

export default NumberSetting;
