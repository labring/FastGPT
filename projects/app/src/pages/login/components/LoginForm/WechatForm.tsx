import React, { Dispatch, useCallback, useState } from 'react';
import { PageTypeEnum } from '@/constants/user';
import type { ResLogin } from '@/global/support/api/userRes';
import { Box, Center, Image, Spinner } from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import { getWechatQR, getWechatResult, oauthLogin } from '@/web/support/user/api';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useRouter } from 'next/router';
import { useToast } from '@fastgpt/web/hooks/useToast';
import FormLayout from './components/FormLayout';

interface Props {
  loginSuccess: (e: ResLogin) => void;
  setPageType: Dispatch<`${PageTypeEnum}`>;
}

const WechatForm = ({ setPageType, loginSuccess }: Props) => {
  const [wechatInfo, setWechatInfo] = useState<{
    code: string;
    codeUrl: string;
  }>();
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  useQuery(['getWechatQR'], () => getWechatQR(), {
    onSuccess(data) {
      setWechatInfo(data);
    }
  });

  useQuery(
    ['getWechatResult', wechatInfo?.code],
    () => getWechatResult({ code: wechatInfo?.code || '' }),
    {
      refetchInterval: 3 * 1000,
      enabled: !!wechatInfo?.code,
      onSuccess(data: any) {
        if (data?.openid) {
          login(data.openid);
        }
      }
    }
  );

  const login = useCallback(
    async (openid: string) => {
      try {
        setIsLoading(true);
        const res = await oauthLogin({
          type: 'wechat',
          code: openid,
          callbackUrl: `${location.origin}/login/provider`,
          inviterId: localStorage.getItem('inviterId') || undefined
        });

        if (!res) {
          toast({
            status: 'warning',
            title: '登录异常'
          });
          return setTimeout(() => {
            router.replace('/login');
          }, 1000);
        }
        loginSuccess(res);
      } catch (error) {
        toast({
          status: 'warning',
          title: getErrText(error, '登录异常')
        });
        setTimeout(() => {
          router.replace('/login');
        }, 1000);
      }
    },
    [loginSuccess, router, toast]
  );

  return (
    <FormLayout setPageType={setPageType} pageType={PageTypeEnum.wechat}>
      <Box>
        <Box
          fontSize={24}
          fontWeight={600}
          w={'full'}
          display={'flex'}
          justifyContent={'center'}
          pt={12}
        >
          微信扫码登录
        </Box>
        <Box p={5} display={'flex'} w={'full'} justifyContent={'center'}>
          {wechatInfo?.codeUrl && !isLoading ? (
            <Image w="200px" src={wechatInfo?.codeUrl} alt="qrcode"></Image>
          ) : (
            <Center w={200} h={200}>
              <Spinner />
            </Center>
          )}
        </Box>
      </Box>
    </FormLayout>
  );
};

export default WechatForm;
