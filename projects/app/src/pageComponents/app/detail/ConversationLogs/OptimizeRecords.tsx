/**
 * @file 优化记录组件
 * @description 智能客服应用的优化记录展示页面，当前为占位组件，显示功能开发中提示
 */
import React from 'react';
import { Flex, Box } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';

const OptimizeRecords = () => {
  const { t } = useTranslation();

  return (
    <Flex flexDirection={'column'} alignItems={'center'} justifyContent={'center'} h={'full'}>
      <MyIcon name="empty" w={16} h={16} color={'myGray.400'} />
      <Box mt={4} color={'myGray.500'}>
        功能开发中，敬请期待
      </Box>
    </Flex>
  );
};

export default React.memo(OptimizeRecords);
