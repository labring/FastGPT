import { Box, Flex } from '@chakra-ui/react';
import type { ReactNode } from 'react';

const StepContent = ({ children, footer }: { children: ReactNode; footer?: ReactNode }) => (
  <Flex direction="column" h="100%" minH={0} px={8} pt={6} pb={8} gap={6}>
    <Box flex="1 1 0" minH={0} minW={0}>
      {children}
    </Box>
    {footer && (
      <Flex alignItems="center" justifyContent="flex-end" gap={3} flexShrink={0}>
        {footer}
      </Flex>
    )}
  </Flex>
);

export default StepContent;
