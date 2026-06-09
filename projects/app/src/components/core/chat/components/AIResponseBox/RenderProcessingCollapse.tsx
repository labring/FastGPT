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
import React, { useState } from 'react';

const RenderProcessingCollapse = React.memo(function RenderProcessingCollapse({
  children,
  label,
  preview,
  isProcessing = true
}: {
  children: React.ReactNode;
  label?: string;
  preview?: React.ReactNode;
  isProcessing?: boolean;
}) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Accordion
      allowToggle
      index={isExpanded ? 0 : -1}
      onChange={(index) => setIsExpanded(Array.isArray(index) ? index.length > 0 : index === 0)}
    >
      <AccordionItem borderTop={'none'} borderBottom={'none'}>
        <Box w={'full'} pb={'4px'} borderBottom={'1px solid'} borderBottomColor={'myGray.100'}>
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
                {isProcessing && label && (
                  <Box as="span">
                    {' · '}
                    {t(label)}
                    {'...'}
                  </Box>
                )}
              </Box>
            </HStack>

            <AccordionIcon ml={1} color={'myGray.500'} />
          </AccordionButton>
        </Box>
        {isProcessing && !isExpanded && preview && <Box mt={2}>{preview}</Box>}
        <AccordionPanel py={0} pr={0} pl={0} mt={2}>
          <Flex flexDirection={'column'} gap={2}>
            {children}
          </Flex>
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  );
});

export default RenderProcessingCollapse;
