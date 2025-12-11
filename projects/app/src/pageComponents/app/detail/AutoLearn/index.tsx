/**
 * @file 自动学习组件
 * @description 智能客服应用的自动学习功能页面，当前为占位组件，显示功能开发中提示
 */
import React from 'react';
import { Flex, Box } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';

const AutoLearn = () => {
  return (
    <Flex flexDirection={'column'} alignItems={'center'} justifyContent={'center'} h={'full'}>
      <MyIcon name="empty" w={16} h={16} color={'myGray.400'} />
      <Box mt={4} color={'myGray.500'}>
        功能开发中，敬请期待
      </Box>
    </Flex>
  );
};

export default React.memo(AutoLearn);
