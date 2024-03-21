import { Box, BoxProps, CloseButton, Heading } from '@chakra-ui/react';
import React, { useState } from 'react';
import MyBox from '@/components/common/MyBox';

type CloseBoxProps = BoxProps & {
  title?: string | Comment;
};

const MyCloseBox = ({ title, children, ...props }: CloseBoxProps) => {
  const [isClose, setClose] = useState(false);
  return (
    <Box position={'relative'} zIndex={2} display={!isClose ? 'block' : 'none'} {...props}>
      <MyBox mb={2}>
        <CloseButton
          size="sm"
          position={'absolute'}
          right={0}
          bottom={['4px', '8px']}
          onClick={() => {
            setClose(true);
          }}
        />
        <Heading as="h5" size="sm" color={'gray.500'}>
          {title}
        </Heading>
      </MyBox>
      {children}
    </Box>
  );
};

export default MyCloseBox;
