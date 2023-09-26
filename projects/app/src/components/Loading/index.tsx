import React from 'react';
import { Spinner, Flex, Box } from '@chakra-ui/react';

const Loading = ({
  fixed = true,
  text = '',
  bg = 'rgba(255,255,255,0.5)'
}: {
  fixed?: boolean;
  text?: string;
  bg?: string;
}) => {
  return (
    <Flex
      position={fixed ? 'fixed' : 'absolute'}
      zIndex={1000}
      bg={bg}
      top={0}
      left={0}
      right={0}
      bottom={0}
      alignItems={'center'}
      justifyContent={'center'}
      flexDirection={'column'}
    >
      <Spinner thickness="4px" speed="0.65s" emptyColor="myGray.100" color="myBlue.600" size="xl" />
      {text && (
        <Box mt={2} color="myBlue.700" fontWeight={'bold'}>
          {text}
        </Box>
      )}
    </Flex>
  );
};

export default Loading;
