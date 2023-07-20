import React, { useCallback, useRef } from 'react';
import { Card, Box, Flex, Button, Grid, useDisclosure } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { UserUpdateParams } from '@/types/user';
import { putUserInfo } from '@/api/user';
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
import { getErrText } from '@/utils/tools';
import { feConfigs } from '@/store/static';

import Loading from '@/components/Loading';
import Avatar from '@/components/Avatar';
import MyIcon from '@/components/Icon';
import Tabs from '@/components/Tabs';
import BillTable from './components/BillTable';

const PayRecordTable = dynamic(() => import('./components/PayRecordTable'), {
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
    { label: '通知', id: TableEnum.inform, Component: <InformTable /> }
  ]);

  const router = useRouter();
  const { userInfo, updateUserInfo, initUserInfo, setUserInfo } = useUserStore();
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

  return (
    <Box h={'100%'} overflow={'overlay'}>
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
            {feConfigs?.show_userDetail && (
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
              </Box>
            )}
          </Card>
        </Grid>

        {feConfigs?.show_userDetail && (
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
        )}
      </Box>
      {isOpenPayModal && <PayModal onClose={onClosePayModal} />}
      <File onSelect={onSelectFile} />
    </Box>
  );
};

export async function getServerSideProps({ query }: any) {
  return {
    props: {
      tableType: query?.type || TableEnum.bill
    }
  };
}

export default NumberSetting;
