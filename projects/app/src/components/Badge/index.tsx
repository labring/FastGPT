import React from 'react';
import { Box } from '@chakra-ui/react';

const Badge = ({
  children,
  isDot = false,
  max = 99,
  count = 0
}: {
  children: React.ReactNode;
  isDot?: boolean;
  max?: number;
  count?: number;
}) => {
  return (
    <Box position={'relative'}>
      {children}
      {count > 0 && (
        <Box position={'absolute'} right={0} top={0} transform={'translate(70%,-50%)'}>
          {isDot ? (
            <Box w={'5px'} h={'5px'} bg={'red.600'} borderRadius={'20px'}></Box>
          ) : (
            <Box
              color={'white'}
              bg={'red.600'}
              lineHeight={0.9}
              borderRadius={'100px'}
              px={'4px'}
              py={'2px'}
              fontSize={'12px'}
              border={'1px solid white'}
            >
              {count > max ? `${max}+` : count}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
};

export default Badge;
