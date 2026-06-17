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
      <AccordionItem borderTop={'none'} borderBottom={'none'} lineHeight={'24px'}>
        <Box w={'full'} pb={'4px'} borderBottom={'1px solid'} borderBottomColor={'myGray.100'}>
          <AccordionButton
            w={'fit-content'}
            h={'24px'}
            minH={'24px'}
            display={'flex'}
            alignItems={'center'}
            lineHeight={'24px'}
            p={0}
            bg={'transparent'}
            border={'none'}
            boxShadow={'none'}
            color={'myGray.600'}
            _hover={{ color: 'myGray.600', bg: 'transparent' }}
            _expanded={{ color: 'myGray.600' }}
          >
            <HStack h={'24px'} lineHeight={'24px'} mr={1} spacing="0">
              <Box fontSize={'16px'} lineHeight={'24px'}>
                {isProcessing ? t('chat:processing') : t('chat:processed')}
                {isProcessing && label && (
                  <Box as="span">
                    {' · '}
                    {t(label)}
                    {'...'}
                  </Box>
                )}
              </Box>
            </HStack>

            <AccordionIcon ml={1} w={'16px'} h={'16px'} color={'myGray.500'} />
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
