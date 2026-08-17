import { Button, Flex } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useState, type Dispatch } from 'react';
import { LoginPageTypeEnum } from '@/web/support/user/login/constants';
import LoginBrand from './LoginForm/LoginBrand';
import LoginGuideLink from './LoginForm/LoginGuideLink';
import PolicyTip from './LoginForm/PolicyTip';
import { useLoginMethods } from './LoginForm/useLoginMethods';

type Props = {
  setPageType: Dispatch<`${LoginPageTypeEnum}`>;
};

/** Figma 登录方式选择页：完整宽度展示所有可用渠道，密码登录固定在末尾。 */
const LoginMethodSelection = ({ setPageType }: Props) => {
  const [pendingMethod, setPendingMethod] = useState<string>();
  const { methods, startLogin } = useLoginMethods({
    mode: 'selection',
    pageType: LoginPageTypeEnum.methodSelection,
    setPageType
  });

  return (
    <Flex flexDirection="column" h="100%" alignItems={['center', 'stretch']}>
      <LoginBrand />
      <Flex mt={8} w="100%" flexDirection="column" gap={4}>
        {methods.map((method) => (
          <Button
            key={method.id}
            aria-label={method.label}
            size="base"
            variant="whitePrimary"
            w="100%"
            h={['44px', '40px']}
            minH={['44px', '40px']}
            borderRadius="sm"
            fontWeight="medium"
            leftIcon={<Avatar src={method.icon} w="20px" h="20px" />}
            isLoading={pendingMethod === method.id}
            isDisabled={pendingMethod !== undefined && pendingMethod !== method.id}
            onClick={async () => {
              setPendingMethod(method.id);
              try {
                await startLogin(method);
              } catch {
                setPendingMethod(undefined);
              }
            }}
          >
            {method.label}
          </Button>
        ))}
      </Flex>
      <PolicyTip textAlign={['left', 'center']} />
      <LoginGuideLink mt={8} />
    </Flex>
  );
};

export default LoginMethodSelection;
