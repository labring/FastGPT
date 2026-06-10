import type { ReactNode } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import DesktopHomeHero from './DesktopHomeHero';
import QuickApps from './QuickApps';

type DesktopHomeLayoutProps = {
  inputSlot: ReactNode;
};

const DesktopHomeLayout = ({ inputSlot }: DesktopHomeLayoutProps) => {
  return (
    <Flex h="100%" flexDir="column" justifyContent="center" w="100%">
      <DesktopHomeHero />

      <Box mt="32px" mb="16px" w="100%">
        <QuickApps />
      </Box>

      {inputSlot}
    </Flex>
  );
};

export default DesktopHomeLayout;
