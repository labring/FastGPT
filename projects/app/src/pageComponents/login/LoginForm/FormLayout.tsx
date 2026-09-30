import type { LoginPageTypeEnum } from '@/web/support/user/login/constants';
import { Box, Flex, IconButton, Button } from '@chakra-ui/react';
import { type Dispatch } from 'react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import dynamic from 'next/dynamic';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import LoginBrand from './LoginBrand';
import { useLoginMethods } from './useLoginMethods';

type Props = {
  children: React.ReactNode;
  setPageType: Dispatch<`${LoginPageTypeEnum}`>;
  pageType: `${LoginPageTypeEnum}`;
};

const FormLayout = ({ children, setPageType, pageType }: Props) => {
  const { methods, startLogin } = useLoginMethods({
    mode: 'alternatives',
    pageType,
    setPageType
  });

  return (
    <Flex
      flexDirection="column"
      h="100%"
      alignItems={['center', 'stretch']}
      justifyContent={['center', 'flex-start']}
    >
      <LoginBrand />
      <Box w="100%" mt={[8, 0]}>
        {children}
      </Box>
      {methods.length > 0 && (
        <Box mt={8} w="100%">
          <Flex position="relative" mb={4} alignItems="center">
            <Box h="1px" flex="1" bg="myGray.250" />
            <Box px={3} color="myGray.500" fontSize="mini">
              or
            </Box>
            <Box h="1px" flex="1" bg="myGray.250" />
          </Flex>

          {methods.length > 2 ? (
            <Flex gap={4} alignItems="center" justifyContent="center">
              {methods.map((method) => (
                <MyTooltip key={method.id} label={method.label}>
                  <IconButton
                    size="lgSquare"
                    borderRadius="50%"
                    aria-label={method.label}
                    variant="whitePrimary"
                    icon={<Avatar src={method.icon} w="20px" h="20px" />}
                    onClick={() => void startLogin(method).catch(() => undefined)}
                  />
                </MyTooltip>
              ))}
            </Flex>
          ) : (
            <Flex gap={4} alignItems="center" justifyContent="center">
              {methods.map((method) => (
                <Box key={method.id} flex={1}>
                  <Button
                    variant="whitePrimary"
                    w="100%"
                    h="40px"
                    borderRadius="sm"
                    fontWeight="medium"
                    leftIcon={<Avatar src={method.icon} w="20px" h="20px" />}
                    onClick={() => void startLogin(method).catch(() => undefined)}
                  >
                    {method.label}
                  </Button>
                </Box>
              ))}
            </Flex>
          )}
        </Box>
      )}
    </Flex>
  );
};

export default dynamic(() => Promise.resolve(FormLayout), {
  ssr: false
});
