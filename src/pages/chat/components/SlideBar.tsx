import React from 'react';
import { Box, Button } from '@chakra-ui/react';
import { AddIcon } from '@chakra-ui/icons';

const SlideBar = ({ resetChat }: { resetChat: () => void }) => {
  return (
    <Box flex={'0 0 250px'} p={3} backgroundColor={'blackAlpha.800'} color={'white'}>
      {/* 新对话 */}
      <Button w={'100%'} variant={'white'} h={'40px'} leftIcon={<AddIcon />} onClick={resetChat}>
        新对话
      </Button>
      {/* 我的模型 */}

      {/* 历史记录 */}
    </Box>
  );
};

export default SlideBar;
