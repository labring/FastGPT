import React from 'react';
import { Box, Text, Link, Flex } from '@chakra-ui/react';

const LinkBlock: React.FC<{ data: { text: string; url: string } }> = ({ data }) => {
  const handleClick = () => {
    window.open(data.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <Box my={4}>
      <Link
        onClick={handleClick}
        cursor="pointer"
        textDecoration="none"
        _hover={{ textDecoration: 'none' }}
      >
        <Text
          fontWeight="medium"
          color="blue.600"
          _hover={{ color: 'blue.700' }}
          noOfLines={1}
          flex="1"
        >
          {data.text}
        </Text>
      </Link>
    </Box>
  );
};

export default LinkBlock;
