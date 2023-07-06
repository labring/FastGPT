import React from 'react';
import { Tooltip, TooltipProps } from '@chakra-ui/react';

const MyTooltip = ({ children, ...props }: TooltipProps) => {
  return (
    <Tooltip
      bg={'white'}
      arrowShadowColor={' rgba(0,0,0,0.1)'}
      hasArrow
      arrowSize={12}
      offset={[-15, 15]}
      color={'myGray.800'}
      px={4}
      py={2}
      borderRadius={'8px'}
      whiteSpace={'pre-wrap'}
      {...props}
    >
      {children}
    </Tooltip>
  );
};

export default MyTooltip;
