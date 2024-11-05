import React, { Dispatch } from 'react';
import { LoginPageTypeEnum } from '@/web/support/user/login/constants';
import type { ResLogin } from '@/global/support/api/userRes';
import { Box, Center } from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import { getWXLoginQR, getWXLoginResult } from '@/web/support/user/api';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useToast } from '@fastgpt/web/hooks/useToast';
import FormLayout from './components/FormLayout';
import { useTranslation } from 'next-i18next';
import Loading from '@fastgpt/web/components/common/MyLoading';
import MyImage from '@fastgpt/web/components/common/Image/MyImage';

interface Props {
  loginSuccess: (e: ResLogin) => void;
  setPageType: Dispatch<`${LoginPageTypeEnum}`>;
}

const WechatForm = ({ setPageType, loginSuccess }: Props) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const { data: wechatInfo } = useQuery(['getWXLoginQR'], getWXLoginQR, {
    onError(err) {
      toast({
        status: 'warning',
        title: getErrText(err, t('common:get_QR_failed'))
      });
    }
  });

  useQuery(['getWXLoginResult', wechatInfo?.code], () => getWXLoginResult(wechatInfo?.code || ''), {
    refetchInterval: 3 * 1000,
    enabled: !!wechatInfo?.code,
    onSuccess(data: ResLogin) {
      loginSuccess(data);
    }
  });

  return (
    <FormLayout setPageType={setPageType} pageType={LoginPageTypeEnum.wechat}>
      <Box>
        <Box w={'full'} textAlign={'center'} pt={6} fontWeight={'medium'}>
          {t('common:support.user.login.wx_qr_login')}
        </Box>
        <Box p={5} display={'flex'} w={'full'} justifyContent={'center'}>
          {wechatInfo?.codeUrl ? (
            <MyImage w="200px" src={wechatInfo?.codeUrl} alt="qrcode"></MyImage>
          ) : (
            <Center w={200} h={200} position={'relative'}>
              <Loading fixed={false} />
            </Center>
          )}
        </Box>
      </Box>
    </FormLayout>
  );
};

export default WechatForm;
