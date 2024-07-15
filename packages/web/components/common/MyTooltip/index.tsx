import React from 'react';
import { Box, Tooltip, TooltipProps } from '@chakra-ui/react';
import { useSystem } from '../../../hooks/useSystem';

interface Props extends TooltipProps {}

const MyTooltip = ({ children, shouldWrapChildren = true, ...props }: Props) => {
  const { isPc } = useSystem();

  return (
    <Tooltip
      className="chakra-tooltip"
      bg={'white'}
      arrowShadowColor={'rgba(0,0,0,0.05)'}
      hasArrow
      arrowSize={12}
      offset={[-15, 15]}
      color={'myGray.800'}
      px={4}
      py={2}
      borderRadius={'8px'}
      whiteSpace={'pre-wrap'}
      boxShadow={'1px 1px 10px rgba(0,0,0,0.2)'}
      shouldWrapChildren={shouldWrapChildren}
      {...props}
    >
      {children}
    </Tooltip>
  );
};

export default MyTooltip;
