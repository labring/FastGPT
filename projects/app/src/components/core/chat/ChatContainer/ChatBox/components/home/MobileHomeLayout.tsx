import type { ReactNode } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import MobileHomeHero from './MobileHomeHero';
import QuickApps from './QuickApps';

type MobileHomeLayoutProps = {
  inputSlot: ReactNode;
};

const MobileHomeLayout = ({ inputSlot }: MobileHomeLayoutProps) => {
  return (
    <>
      <Box flex="1 0 0" h={0}>
        <Flex flex="1 0 0" h={0} flexDir="column" pb="24px" w="100%">
          <MobileHomeHero />
        </Flex>
      </Box>

      <Box mb="24px" w="100%">
        <QuickApps variant="mobile" />
      </Box>

      <Box flexShrink={0}>{inputSlot}</Box>
    </>
  );
};

export default MobileHomeLayout;
