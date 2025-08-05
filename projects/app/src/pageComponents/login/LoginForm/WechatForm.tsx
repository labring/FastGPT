import React, { type Dispatch } from 'react';
import { LoginPageTypeEnum } from '@/web/support/user/login/constants';
import type { ResLogin } from '@/global/support/api/userRes';
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

interface Props {
  loginSuccess: (e: ResLogin) => void;
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
      onSuccess(data: ResLogin | undefined) {
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
        <Box w={'full'} textAlign={'center'} pt={6} fontWeight={'medium'}>
          {t('common:support.user.login.wx_qr_login')}
        </Box>
        <Box my={5} display={'flex'} w={'full'} justifyContent={'center'}>
          {wechatInfo?.codeUrl ? (
            <Box border={'base'} borderRadius={'md'} bg={'#FBFBFB'} overflow={'hidden'}>
              <MyImage w={['180px', '220px']} src={wechatInfo?.codeUrl} alt="qrcode"></MyImage>
            </Box>
          ) : (
            <Center w={200} h={200} position={'relative'}>
              <Loading fixed={false} />
            </Center>
          )}
        </Box>
        {feConfigs?.docUrl && (
          <Flex
            alignItems={'center'}
            justifyContent={'center'}
            mt={7}
            fontSize={'mini'}
            color={'myGray.400'}
            fontWeight={'medium'}
          >
            {t('login:policy_tip')}
            <Link
              ml={1}
              href={getDocPath('/docs/protocol/terms/')}
              target={'_blank'}
              color={'primary.700'}
            >
              {t('login:terms')}
            </Link>
            <Box mx={1}>&</Box>
            <Link
              href={getDocPath('/docs/protocol/privacy/')}
              target={'_blank'}
              color={'primary.700'}
            >
              {t('login:privacy')}
            </Link>
          </Flex>
        )}
      </Box>
    </FormLayout>
  );
};

export default WechatForm;
