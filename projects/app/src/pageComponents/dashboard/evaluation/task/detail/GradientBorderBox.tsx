import React from 'react';
import type { BoxProps } from '@chakra-ui/react';
import { Box } from '@chakra-ui/react';

interface GradientBorderBoxProps extends BoxProps {
  children: React.ReactNode;
}

const GradientBorderBox: React.FC<GradientBorderBoxProps> = ({ children, ...boxProps }) => {
  return (
    <Box
      minH={'150px'}
      position={'relative'}
      p={4}
      borderRadius={'lg'}
      bg={'linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(168, 85, 247, 0.05) 100%)'}
      _before={{
        content: '""',
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        borderRadius: 'lg',
        padding: '2px',
        background:
          'linear-gradient(234deg, #A0D8FF 0%, rgba(213, 128, 255, 0.6322) 54%, rgba(64, 224, 208, 0.4178) 98%)',
        mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
        maskComposite: 'xor',
        WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
        WebkitMaskComposite: 'xor',
        pointerEvents: 'none'
      }}
      {...boxProps}
    >
      {children}
    </Box>
  );
};

export default GradientBorderBox;
