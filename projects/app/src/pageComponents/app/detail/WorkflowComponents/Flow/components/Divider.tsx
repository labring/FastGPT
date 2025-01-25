import React from 'react';
import { Box, useTheme } from '@chakra-ui/react';

const Divider = ({
  text,
  showBorderBottom = true,
  icon
}: {
  text?: 'Input' | 'Output' | string;
  showBorderBottom?: boolean;
  icon?: React.ReactNode;
}) => {
  const theme = useTheme();

  const isDivider = !text;

  return (
    <Box
      alignItems={'center'}
      display={'flex'}
      justifyContent={'center'}
      bg={'myGray.25'}
      py={isDivider ? '0' : 2}
      borderTop={theme.borders.base}
      borderBottom={showBorderBottom ? theme.borders.base : 0}
      fontWeight={'medium'}
    >
      {icon}
      {icon && <Box w={1} />}
      {text}
    </Box>
  );
};

export default React.memo(Divider);
