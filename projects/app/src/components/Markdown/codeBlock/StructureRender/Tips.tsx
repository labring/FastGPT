import React from 'react';
import { Flex, Box } from '@chakra-ui/react';
import Icon from '@fastgpt/web/components/common/Icon';

interface TipsProps {
  content: string;
  type?: 'error' | 'warning';
}

const Tips: React.FC<TipsProps> = ({ content, type = 'error' }) => {
  const isError = type === 'error';

  return (
    <Flex
      maxW="200px"
      alignItems="start"
      p={4}
      bg={isError ? 'red.50' : 'yellow.50'}
      border="1px solid"
      borderColor={isError ? 'red.200' : 'yellow.200'}
      borderRadius="md"
      gap={3}
    >
      <Icon
        name={isError ? 'common/errorFill' : 'common/errorFill'}
        w="20px"
        h="20px"
        color={isError ? 'red.500' : 'yellow.500'}
      />
      <Box color={isError ? 'red.700' : 'yellow.700'} fontSize="sm" fontWeight="medium">
        {content}
      </Box>
    </Flex>
  );
};

export default Tips;
