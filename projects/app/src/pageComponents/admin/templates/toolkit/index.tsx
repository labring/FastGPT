'use client';
import { Box, Center, VStack } from '@chakra-ui/react';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyIcon from '@fastgpt/web/components/common/Icon';

const Index = () => {
  return (
    <MyBox>
      <Center h={'calc(100vh - 100px)'}>
        <VStack spacing={4}>
          <MyIcon name="empty" w={16} color={'transparent'} />
          <Box>相关功能配置已移至前台，</Box>
          <Box>您可在前台登陆root账号，进行工具配置~</Box>
        </VStack>
      </Center>
    </MyBox>
  );
};

export default Index;
