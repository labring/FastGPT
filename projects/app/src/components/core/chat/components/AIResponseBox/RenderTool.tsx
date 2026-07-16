import Markdown from '@/components/Markdown';
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
import type { ToolModuleResponseItemType } from '@fastgpt/global/core/chat/type';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import React, { useMemo, useState } from 'react';
import { accordionButtonStyle } from './constants';

const formatJson = (value: string) => {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
};

const PlainTextContent = ({ label, value }: { label: string; value: string }) => (
  <Box _notLast={{ mb: 3 }}>
    <Box mb={1} color={'myGray.600'} fontSize={'12px'} fontWeight={500} lineHeight={'18px'}>
      {label}
    </Box>
    <Box
      as="pre"
      m={0}
      p={3}
      maxH={'360px'}
      overflow={'auto'}
      border={'1px solid'}
      borderColor={'myGray.200'}
      borderRadius={'sm'}
      bg={'myGray.50'}
      color={'myGray.700'}
      fontFamily={'mono'}
      fontSize={'12px'}
      lineHeight={'18px'}
      letterSpacing={0}
      whiteSpace={'pre-wrap'}
      overflowWrap={'anywhere'}
    >
      {value}
    </Box>
  </Box>
);

const ToolDetail = ({
  isToolGenerating,
  tool
}: {
  isToolGenerating: boolean;
  tool: ToolModuleResponseItemType;
}) => {
  const params = tool.params;
  const response = tool.response || '';
  const formattedParams = useMemo(
    () => (isToolGenerating ? params : formatJson(params)),
    [isToolGenerating, params]
  );
  const formattedResponse = useMemo(
    () => (isToolGenerating ? response : formatJson(response)),
    [isToolGenerating, response]
  );

  if (isToolGenerating) {
    return (
      <>
        {formattedParams && formattedParams !== '{}' && (
          <PlainTextContent label="Input" value={formattedParams} />
        )}
        {formattedResponse && <PlainTextContent label="Response" value={formattedResponse} />}
      </>
    );
  }

  return (
    <>
      {formattedParams && formattedParams !== '{}' && (
        <Box mb={3}>
          <Markdown
            source={`~~~json#Input
${formattedParams}`}
          />
        </Box>
      )}
      {formattedResponse && (
        <Markdown
          source={`~~~json#Response
${formattedResponse}`}
        />
      )}
    </>
  );
};

const RenderTool = React.memo(function RenderTool({
  showAnimation,
  tool
}: {
  showAnimation: boolean;
  tool: ToolModuleResponseItemType;
}) {
  const { t } = useSafeTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const isToolGenerating = showAnimation && tool.response === undefined;

  return (
    <Accordion
      allowToggle
      index={isExpanded ? 0 : -1}
      onChange={(index) => setIsExpanded(Array.isArray(index) ? index.length > 0 : index === 0)}
    >
      <AccordionItem borderTop={'none'} borderBottom={'none'} lineHeight={'24px'}>
        <AccordionButton
          {...accordionButtonStyle}
          h={'24px'}
          minH={'24px'}
          w={'fit-content'}
          maxW={'100%'}
          display={'flex'}
          alignItems={'center'}
          overflow={'hidden'}
          lineHeight={'24px'}
          p={0}
          bg={'transparent'}
          border={'none'}
          borderRadius={0}
          boxShadow={'none'}
          color={'myGray.600'}
          _hover={{ bg: 'transparent', color: 'myGray.600' }}
          _expanded={{ color: 'myGray.600' }}
        >
          <HStack h={'24px'} lineHeight={'24px'} mr={1} spacing="0" minW={0} overflow={'hidden'}>
            <Flex w="24px" h="24px" flexShrink={0} alignItems="center" justifyContent="center">
              <Avatar src={tool.toolAvatar} w="16px" h="16px" borderRadius="xs" />
            </Flex>
            <Box
              fontSize="16px"
              lineHeight="24px"
              color="myGray.600"
              minW={0}
              overflow={'hidden'}
              textOverflow={'ellipsis'}
              whiteSpace={'nowrap'}
            >
              {t(tool.toolName)}
            </Box>
          </HStack>
          {isToolGenerating && <MyIcon name={'common/loading'} w={'14px'} color="myGray.500" />}
          <AccordionIcon ml={1} w={'16px'} h={'16px'} color={'myGray.500'} />
        </AccordionButton>
        {isExpanded && (
          <AccordionPanel
            py={0}
            px={0}
            mt={2}
            borderRadius={'md'}
            overflow={'hidden'}
            maxH={'500px'}
            overflowY={'auto'}
          >
            <ToolDetail isToolGenerating={isToolGenerating} tool={tool} />
          </AccordionPanel>
        )}
      </AccordionItem>
    </Accordion>
  );
});

export default RenderTool;
