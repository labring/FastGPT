import React, { type Dispatch } from 'react';
import { LoginPageTypeEnum } from '@/web/support/user/login/constants';
import type { LoginSuccessResponse } from '@/global/support/api/userRes';
import { Box, Center, Flex, Link } from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import { getWXLoginQR, getWXLoginResult } from '@/web/support/user/api';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useToast } from '@fastgpt/web/hooks/useToast';
import FormLayout from './FormLayout';
import { useTranslation } from 'next-i18next';
import Loading from '@fastgpt/web/components/common/MyLoading';
import MyImage from '@fastgpt/web/components/common/Image/MyImage';
import {
  getBdVId,
  getFastGPTSem,
  getMsclkid,
  getSourceDomain,
  removeFastGPTSem,
  getInviterId
} from '@/web/support/marketing/utils';
import { getDocPath } from '@/web/common/system/doc';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import PolicyTip from './PolicyTip';

interface Props {
  loginSuccess: (e: LoginSuccessResponse) => void;
  setPageType: Dispatch<`${LoginPageTypeEnum}`>;
}

const WechatForm = ({ setPageType, loginSuccess }: Props) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { feConfigs } = useSystemStore();

  const { data: wechatInfo } = useQuery(['getWXLoginQR'], getWXLoginQR, {
    onError(err) {
      toast({
        status: 'warning',
        title: getErrText(err, t('common:get_QR_failed'))
      });
    }
  });

  useQuery(
    ['getWXLoginResult', wechatInfo?.code],
    () =>
      getWXLoginResult({
        inviterId: getInviterId(),
        code: wechatInfo?.code || '',
        bd_vid: getBdVId(),
        msclkid: getMsclkid(),
        fastgpt_sem: getFastGPTSem(),
        sourceDomain: getSourceDomain()
      }),
    {
      refetchInterval: 3 * 1000,
      enabled: !!wechatInfo?.code,
      onSuccess(data: LoginSuccessResponse | undefined) {
        if (data) {
          removeFastGPTSem();
          loginSuccess(data);
        }
      }
    }
  );

  return (
    <FormLayout setPageType={setPageType} pageType={LoginPageTypeEnum.wechat}>
      <Box>
        <Box w={'full'} textAlign={'center'} pt={8} fontWeight={'medium'} fontSize={['sm', 'md']}>
          {t('common:support.user.login.wx_qr_login')}
        </Box>
        <Box my={5} display={'flex'} w={'full'} justifyContent={'center'}>
          {wechatInfo?.codeUrl ? (
            <Box
              border={'base'}
              borderRadius={'md'}
              p={'3.2px'}
              bg={'#FBFBFB'}
              overflow={'hidden'}
              w={['186px', '226px']}
              h={['186px', '226px']}
            >
              <MyImage w={'100%'} h={'100%'} src={wechatInfo?.codeUrl} alt="qrcode"></MyImage>
            </Box>
          ) : (
            <Center w={200} h={200} position={'relative'}>
              <Loading fixed={false} />
            </Center>
          )}
        </Box>
        <PolicyTip isCenter />
      </Box>
    </FormLayout>
  );
};

export default WechatForm;
