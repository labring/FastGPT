import React, { useCallback, useRef, useState } from 'react';
import { Card, Box, Flex, Button, Input, Grid, useDisclosure } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { UserUpdateParams } from '@/types/user';
import { putUserInfo, getPromotionInitData } from '@/api/user';
import { useToast } from '@/hooks/useToast';
import { useGlobalStore } from '@/store/global';
import { useUserStore } from '@/store/user';
import { UserType } from '@/types/user';
import { clearCookie } from '@/utils/user';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useSelectFile } from '@/hooks/useSelectFile';
import { compressImg } from '@/utils/file';
import { getErrText, useCopyData } from '@/utils/tools';
import { authOpenAiKey } from '@/utils/plugin/openai';

import Loading from '@/components/Loading';
import Avatar from '@/components/Avatar';
import MyIcon from '@/components/Icon';
import Tabs from '@/components/Tabs';
import BillTable from './components/BillTable';

const PayRecordTable = dynamic(() => import('./components/PayRecordTable'), {
  ssr: false
});
const PromotionTable = dynamic(() => import('./components/PromotionTable'), {
  ssr: false
});
const InformTable = dynamic(() => import('./components/InformTable'), {
  ssr: false
});
const PayModal = dynamic(() => import('./components/PayModal'), {
  loading: () => <Loading fixed={false} />,
  ssr: false
});
const WxConcat = dynamic(() => import('@/components/WxConcat'), {
  loading: () => <Loading fixed={false} />,
  ssr: false
});

enum TableEnum {
  'bill' = 'bill',
  'pay' = 'pay',
  'promotion' = 'promotion',
  'inform' = 'inform'
}

const NumberSetting = ({ tableType }: { tableType: `${TableEnum}` }) => {
  const tableList = useRef([
    { label: '账单', id: TableEnum.bill, Component: <BillTable /> },
    { label: '充值', id: TableEnum.pay, Component: <PayRecordTable /> },
    { label: '佣金', id: TableEnum.promotion, Component: <PromotionTable /> },
    { label: '通知', id: TableEnum.inform, Component: <InformTable /> }
  ]);

  const router = useRouter();
  const { copyData } = useCopyData();
  const { userInfo, updateUserInfo, initUserInfo, setUserInfo } = useUserStore();
  const { setLoading } = useGlobalStore();
  const { register, handleSubmit, reset } = useForm<UserUpdateParams>({
    defaultValues: userInfo as UserType
  });
  const { toast } = useToast();
  const {
    isOpen: isOpenPayModal,
    onClose: onClosePayModal,
    onOpen: onOpenPayModal
  } = useDisclosure();
  const {
    isOpen: isOpenWxConcat,
    onClose: onCloseWxConcat,
    onOpen: onOpenWxConcat
  } = useDisclosure();

  const { File, onOpen: onOpenSelectFile } = useSelectFile({
    fileType: '.jpg,.png',
    multiple: false
  });

  const onclickSave = useCallback(
    async (data: UserUpdateParams) => {
      setLoading(true);
      try {
        if (data.openaiKey) {
          const text = await authOpenAiKey(data.openaiKey);
          text &&
            toast({
              title: text,
              status: 'warning'
            });
        }
        await putUserInfo({
          openaiKey: data.openaiKey,
          avatar: data.avatar
        });
        updateUserInfo({
          openaiKey: data.openaiKey,
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

  const onclickLogOut = useCallback(() => {
    clearCookie();
    setUserInfo(null);
    router.replace('/login');
  }, [router, setUserInfo]);

  useQuery(['init'], initUserInfo, {
    onSuccess(res) {
      reset(res);
    }
  });
  const { data: { invitedAmount = 0, historyAmount = 0, residueAmount = 0 } = {} } = useQuery(
    ['getPromotionInitData'],
    getPromotionInitData
  );

  return (
    <Box py={[5, 10]} px={'5vw'}>
      <Grid gridTemplateColumns={['1fr', '3fr 300px']} gridGap={4}>
        <Card px={6} py={4}>
          <Flex justifyContent={'space-between'}>
            <Box fontSize={'xl'} fontWeight={'bold'}>
              账号信息
            </Box>
            <Button variant={'base'} size={'xs'} onClick={onclickLogOut}>
              退出登录
            </Button>
          </Flex>
          <Flex mt={6} alignItems={'center'}>
            <Box flex={'0 0 50px'}>头像:</Box>
            <Avatar
              src={userInfo?.avatar}
              w={['28px', '36px']}
              h={['28px', '36px']}
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
              <Button size={['xs', 'sm']} w={['70px', '80px']} ml={5} onClick={onOpenPayModal}>
                充值
              </Button>
            </Flex>
            <Box fontSize={'xs'} color={'blackAlpha.500'}>
              如果填写了自己的 openai 账号，网页上 openai 模型对话不会计费。
            </Box>
          </Box>
          <Flex mt={6} alignItems={'center'}>
            <Box flex={'0 0 85px'}>openaiKey:</Box>
            <Input
              {...register(`openaiKey`)}
              maxW={'350px'}
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
        <Card px={6} py={4}>
          <Box fontSize={'xl'} fontWeight={'bold'}>
            我的邀请
          </Box>
          {[
            { label: '佣金比例', value: `${userInfo?.promotion.rate || 15}%` },
            { label: '已注册用户数', value: `${invitedAmount}人` },
            { label: '累计佣金', value: `￥${historyAmount}` }
          ].map((item) => (
            <Flex key={item.label} alignItems={'center'} mt={4} justifyContent={'space-between'}>
              <Box w={'120px'}>{item.label}</Box>
              <Box fontWeight={'bold'}>{item.value}</Box>
            </Flex>
          ))}
          <Button
            mt={4}
            variant={'base'}
            w={'100%'}
            onClick={() =>
              copyData(`${location.origin}/?inviterId=${userInfo?._id}`, '已复制邀请链接')
            }
          >
            复制邀请链接
          </Button>
          <Button
            mt={4}
            leftIcon={<MyIcon name="withdraw" w={'22px'} />}
            px={4}
            title={residueAmount < 50 ? '最低提现额度为50元' : ''}
            isDisabled={residueAmount < 50}
            variant={'base'}
            colorScheme={'myBlue'}
            onClick={onOpenWxConcat}
          >
            {residueAmount < 50 ? '50元起提' : '提现'}
          </Button>
        </Card>
      </Grid>

      <Card mt={4} px={[3, 6]} py={4}>
        <Tabs
          m={'auto'}
          w={'200px'}
          list={tableList.current}
          activeId={tableType}
          size={'sm'}
          onChange={(id: any) => router.replace(`/number?type=${id}`)}
        />
        <Box minH={'300px'}>
          {(() => {
            const item = tableList.current.find((item) => item.id === tableType);

            return item ? item.Component : null;
          })()}
        </Box>
      </Card>

      {isOpenPayModal && <PayModal onClose={onClosePayModal} />}
      {isOpenWxConcat && <WxConcat onClose={onCloseWxConcat} />}
      <File onSelect={onSelectFile} />
    </Box>
  );
};

export default NumberSetting;

NumberSetting.getInitialProps = ({ query, req }: any) => {
  return {
    tableType: query?.type || TableEnum.bill
  };
};
