import { Card } from '@chakra-ui/react';
import React from 'react';

const InteractiveCard = ({ children }: { children: React.ReactNode }) => {
  return (
    <Card
      w={['100%', '360px']}
      maxW={'100%'}
      minW={'250px'}
      bg={'white'}
      border={'1px solid'}
      borderColor={'myGray.200'}
      borderRadius={'8px'}
      boxShadow={'0 4px 10px 0 rgba(19, 51, 107, 0.08), 0 0 1px 0 rgba(19, 51, 107, 0.08)'}
      p={4}
    >
      {children}
    </Card>
  );
};

export default InteractiveCard;
