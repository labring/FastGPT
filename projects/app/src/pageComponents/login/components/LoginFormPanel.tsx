import { Box } from '@chakra-ui/react';
import { LoginPageTypeEnum } from '@/web/support/user/login/constants';
import dynamic from 'next/dynamic';
import Loading from '@fastgpt/web/components/common/MyLoading';
import LoginForm from '@/pageComponents/login/LoginForm/LoginForm';
import { type Dispatch, useMemo } from 'react';
import type { LoginSuccessResponseType } from '@fastgpt/global/openapi/support/user/account/login/api';

type LoginSuccessHandler = (res: LoginSuccessResponseType) => void | Promise<void>;

const RegisterForm = dynamic(() => import('@/pageComponents/login/RegisterForm'));
const ForgetPasswordForm = dynamic(() => import('@/pageComponents/login/ForgetPasswordForm'));
const WechatForm = dynamic(() => import('@/pageComponents/login/LoginForm/WechatForm'));

type LoginFormPanelProps = {
  pageType: `${LoginPageTypeEnum}`;
  setPageType: Dispatch<`${LoginPageTypeEnum}`>;
  loginSuccess: LoginSuccessHandler;
  reserveLoginGuideSpace?: boolean;
};

const LoginFormPanel = ({
  pageType,
  setPageType,
  loginSuccess,
  reserveLoginGuideSpace
}: LoginFormPanelProps) => {
  const DynamicComponent = useMemo(() => {
    if (!pageType) return null;

    const TypeMap = {
      [LoginPageTypeEnum.passwordLogin]: LoginForm,
      [LoginPageTypeEnum.register]: RegisterForm,
      [LoginPageTypeEnum.forgetPassword]: ForgetPasswordForm,
      [LoginPageTypeEnum.wechat]: WechatForm
    };

    const Component = TypeMap[pageType];
    if (!Component) return null;

    return <Component setPageType={setPageType} loginSuccess={loginSuccess} />;
  }, [pageType, setPageType, loginSuccess]);

  return (
    <Box w={['100%', '380px']} flex={['0 0 auto', reserveLoginGuideSpace ? '1 0 0' : '0 0 auto']}>
      {pageType && DynamicComponent ? DynamicComponent : <Loading fixed={false} />}
    </Box>
  );
};

export default LoginFormPanel;
