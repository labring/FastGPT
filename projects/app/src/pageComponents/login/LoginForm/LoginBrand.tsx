import { Box, Flex } from '@chakra-ui/react';
import { LOGO_ICON } from '@fastgpt/global/common/system/constants';
import MyImage from '@fastgpt/web/components/common/Image/MyImage';
import { useSystemStore } from '@/web/common/system/useSystemStore';

/** 登录表单与登录方式选择页共用的品牌区域。 */
const LoginBrand = () => {
  const { feConfigs } = useSystemStore();

  return (
    <Flex
      alignItems="center"
      justifyContent={['flex-start', 'center']}
      w={['fit-content', '100%']}
      alignSelf={['flex-start', 'auto']}
    >
      <Flex alignItems="center" pr={[0, 4]} w="fit-content" justifyContent="flex-start">
        <Flex
          w={['42px', '56px']}
          h={['42px', '56px']}
          bg={['myGray.25', 'white']}
          borderRadius={['semilg', 'lg']}
          borderWidth={['1px', '1.5px']}
          borderColor="myGray.200"
          alignItems="center"
          justifyContent="center"
        >
          <MyImage src={LOGO_ICON} w={['22.5px', '36px']} h={['22.5px', '36px']} alt="" />
        </Flex>
        <Box ml={[3, 5]} fontSize={['lg', 'xl']} fontWeight="bold" color="myGray.900">
          {feConfigs?.systemTitle}
        </Box>
      </Flex>
    </Flex>
  );
};

export default LoginBrand;
