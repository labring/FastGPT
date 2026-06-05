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
import { isEqual } from 'lodash';
import React, { useCallback, useMemo } from 'react';
import { accordionButtonStyle } from './constants';

const RenderTool = React.memo(
  function RenderTool({
    showAnimation,
    tool
  }: {
    showAnimation: boolean;
    tool: ToolModuleResponseItemType;
  }) {
    const { t } = useSafeTranslation();
    const formatJson = useCallback((string: string) => {
      try {
        return JSON.stringify(JSON.parse(string), null, 2);
      } catch {
        return string;
      }
    }, []);
    const params = useMemo(() => formatJson(tool.params), [formatJson, tool.params]);
    const response = useMemo(() => formatJson(tool.response || ''), [formatJson, tool.response]);

    return (
      <Accordion allowToggle>
        <AccordionItem borderTop={'none'} borderBottom={'none'}>
          <AccordionButton
            {...accordionButtonStyle}
            p={0}
            bg={'transparent'}
            border={'none'}
            borderRadius={0}
            boxShadow={'none'}
            color={'myGray.600'}
            _hover={{ bg: 'transparent', color: 'myGray.600' }}
            _expanded={{ color: 'myGray.600' }}
          >
            <HStack mr={1} spacing="0">
              <Flex w="24px" h="24px" alignItems="center" justifyContent="flex-start">
                <Avatar src={tool.toolAvatar} w="16px" h="16px" borderRadius="sm" />
              </Flex>
              <Box fontSize="16px" lineHeight="24px" color="myGray.600">
                {t(tool.toolName)}
              </Box>
            </HStack>
            {showAnimation && tool.response === undefined && (
              <MyIcon name={'common/loading'} w={'14px'} color="myGray.500" />
            )}
            <AccordionIcon ml={1} color={'myGray.500'} />
          </AccordionButton>
          <AccordionPanel
            py={0}
            px={0}
            mt={3}
            borderRadius={'md'}
            overflow={'hidden'}
            maxH={'500px'}
            overflowY={'auto'}
          >
            {params && params !== '{}' && (
              <Box mb={3}>
                <Markdown
                  source={`~~~json#Input
${params}`}
                />
              </Box>
            )}
            {response && (
              <Markdown
                source={`~~~json#Response
${response}`}
              />
            )}
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    );
  },
  (prevProps, nextProps) => isEqual(prevProps, nextProps)
);

export default RenderTool;
