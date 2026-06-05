import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Box,
  Flex,
  HStack
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import React from 'react';

const RenderProcessingCollapse = React.memo(function RenderProcessingCollapse({
  children,
  isProcessing = true
}: {
  children: React.ReactNode;
  isProcessing?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <Accordion allowToggle>
      <AccordionItem borderTop={'none'} borderBottom={'none'}>
        <Box w={'full'} pb={'4px'} borderBottom={'1px solid'} borderBottomColor={'myGray.200'}>
          <AccordionButton
            w={'auto'}
            display={'inline-flex'}
            p={0}
            bg={'transparent'}
            border={'none'}
            boxShadow={'none'}
            color={'myGray.600'}
            _hover={{ color: 'myGray.600', bg: 'transparent' }}
            _expanded={{ color: 'myGray.600' }}
          >
            <HStack mr={1} spacing="0">
              <Box fontSize={'16px'} lineHeight={'24px'}>
                {t(isProcessing ? 'chat:processing' : 'chat:processed')}
              </Box>
            </HStack>

            <AccordionIcon ml={1} color={'myGray.500'} />
          </AccordionButton>
        </Box>
        <AccordionPanel py={0} pr={0} pl={0} mt={4}>
          <Flex flexDirection={'column'} gap={4}>
            {children}
          </Flex>
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  );
});

export default RenderProcessingCollapse;
