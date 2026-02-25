import React from 'react';
import {
  Box,
  Flex,
  VStack,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { FlowValueTypeMap } from '@fastgpt/global/core/workflow/node/constant';
import type {
  FlowNodeInputItemType,
  FlowNodeOutputItemType
} from '@fastgpt/global/core/workflow/type/io';
import type { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import type { ToolDetailExtendedType } from './types';

export const ParamSection = ({
  title,
  params
}: {
  title: string;
  params: (FlowNodeInputItemType | FlowNodeOutputItemType)[];
}) => {
  const { i18n } = useTranslation();

  return (
    <VStack
      align="stretch"
      p={4}
      gap={0}
      border="1px solid"
      borderColor="myGray.200"
      borderRadius="md"
      bg="myGray.50"
    >
      <Flex alignItems="center" gap={2} mb={4}>
        <Box w="4px" h="16px" bg="primary.600" borderRadius="2px" flexShrink={0} />
        <Box fontSize="sm" color="myGray.900">
          {title}
        </Box>
      </Flex>
      {params.map((param, index) => {
        const isInput = 'required' in param;
        return (
          <Box key={index}>
            <Flex alignItems="center" gap={2} mb={1}>
              {isInput && param.required && (
                <Box as="span" color="red.500" fontSize="xs" fontWeight="medium" ml={-2} mr={-1}>
                  *
                </Box>
              )}
              <Box fontWeight={500}>{parseI18nString(param.label || param.key, i18n.language)}</Box>
              <Box
                px={1}
                borderRadius="4px"
                fontSize={'11px'}
                color="myGray.500"
                bg={'myGray.100'}
                border={'1px solid'}
                borderColor={'myGray.200'}
              >
                {FlowValueTypeMap[param.valueType as WorkflowIOValueTypeEnum]?.label || 'String'}
              </Box>
            </Flex>
            {param.description && (
              <Box fontSize="sm" color="myGray.500" mt={1}>
                {parseI18nString(param.description, i18n.language)}
              </Box>
            )}
            {index !== params.length - 1 && <Box h={'1px'} w={'full'} bg={'myGray.200'} my={4} />}
          </Box>
        );
      })}
    </VStack>
  );
};

export const SubToolAccordionItem = ({ tool }: { tool: ToolDetailExtendedType }) => {
  const { t, i18n } = useTranslation();

  return (
    <AccordionItem borderRadius="md" mb={2} border={'none'}>
      <AccordionButton
        px={2}
        py={2}
        _hover={{ bg: 'myGray.50' }}
        borderRadius="md"
        alignItems={'center'}
      >
        <Box flex={1} textAlign="left">
          <Box fontSize="md" color="myGray.900">
            {parseI18nString(tool.name, i18n.language)}
          </Box>
          <Box fontSize={'sm'} color={'myGray.600'}>
            {tool.intro || parseI18nString(tool.description, i18n.language)}
          </Box>
        </Box>
        <AccordionIcon />
      </AccordionButton>

      <AccordionPanel px={2} pb={4} pt={0}>
        {tool.versionList && tool.versionList.length > 0 && (
          <VStack align="stretch" spacing={3} mt={3}>
            {tool.versionList[0]?.inputs && tool.versionList[0].inputs.length > 0 && (
              <ParamSection title={t('app:toolkit_inputs')} params={tool.versionList[0].inputs} />
            )}
            {tool.versionList[0]?.outputs && tool.versionList[0].outputs.length > 0 && (
              <ParamSection title={t('app:toolkit_outputs')} params={tool.versionList[0].outputs} />
            )}
          </VStack>
        )}
      </AccordionPanel>
    </AccordionItem>
  );
};
