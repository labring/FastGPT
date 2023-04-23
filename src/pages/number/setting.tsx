import React, { useCallback, useState } from 'react';
import { Card, Box, Flex, Button, Input } from '@chakra-ui/react';
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

  useQuery(['init'], initUserInfo);

  const onclickLogOut = useCallback(() => {
    clearToken();
    setUserInfo(null);
    router.replace('/login');
  }, [router, setUserInfo]);

  return (
    <>
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
          <Box flex={'0 0 60px'}>账号:</Box>
          <Box>{userInfo?.username}</Box>
        </Flex>
        <Box mt={6}>
          <Flex alignItems={'center'}>
            <Box flex={'0 0 60px'}>余额:</Box>
            <Box>
              <strong>{userInfo?.balance}</strong> 元
            </Box>
            <Button size={'sm'} w={'80px'} ml={5} onClick={() => setShowPay(true)}>
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

      {/* 充值记录 */}
      <PayRecordTable />
      {/* 账单表 */}
      <BilTable />
      {showPay && <PayModal onClose={() => setShowPay(false)} />}
    </>
  );
};

export default NumberSetting;
