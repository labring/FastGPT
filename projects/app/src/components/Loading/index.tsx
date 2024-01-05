import React from 'react';
import { Spinner, Flex, Box } from '@chakra-ui/react';

const Loading = ({
  fixed = true,
  text = '',
  bg = 'rgba(255,255,255,0.5)',
  zIndex = 1000
}: {
  fixed?: boolean;
  text?: string;
  bg?: string;
  zIndex?: number;
}) => {
  return (
    <Flex
      position={fixed ? 'fixed' : 'absolute'}
      zIndex={zIndex}
      bg={bg}
      top={0}
      left={0}
      right={0}
      bottom={0}
      alignItems={'center'}
      justifyContent={'center'}
      flexDirection={'column'}
    >
      <Spinner
        thickness="4px"
        speed="0.65s"
        emptyColor="myGray.100"
        color="primary.500"
        size="xl"
      />
      {text && (
        <Box mt={2} color="primary.600" fontWeight={'bold'}>
          {text}
        </Box>
      )}
    </Flex>
  );
};

export default Loading;
