import React from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import type { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node';

type ToolSetListItemType = {
  name: string;
  description?: string;
};

export const getNodeToolSetList = (tool: Pick<FlowNodeTemplateType, 'toolConfig'>) => {
  const toolList =
    tool.toolConfig?.mcpToolSet?.toolList ??
    tool.toolConfig?.httpToolSet?.toolList ??
    tool.toolConfig?.systemToolSet?.toolList;

  return toolList ?? [];
};

const ToolSetList = ({
  toolList,
  title
}: {
  toolList: ToolSetListItemType[];
  title?: React.ReactNode;
}) => {
  const { t } = useTranslation();

  return (
    <>
      {title}
      <Box maxH={'500px'} overflowY={'auto'} className="nowheel">
        {toolList.map((tool, index) => (
          <Flex
            key={`${tool.name}-${index}`}
            borderBottom={'1px solid'}
            borderColor={'myGray.200'}
            alignItems={'center'}
            py={2}
            px={3}
          >
            <Box w={'20px'} fontSize={'14px'} color={'myGray.500'} fontWeight={'medium'}>
              {index + 1 < 10 ? `0${index + 1}` : index + 1}
            </Box>
            <Box maxW={'full'} pl={2} position="relative" width="400px">
              <Box
                fontSize={'14px'}
                color={'myGray.900'}
                whiteSpace="nowrap"
                overflow="hidden"
                textOverflow="ellipsis"
              >
                {tool.name}
              </Box>
              <Box
                fontSize={'12px'}
                color={'myGray.500'}
                whiteSpace="nowrap"
                overflow="hidden"
                textOverflow="ellipsis"
              >
                {tool.description || t('app:tools_no_description')}
              </Box>
            </Box>
            <Box flex={1} />
          </Flex>
        ))}
      </Box>
    </>
  );
};

export default React.memo(ToolSetList);
