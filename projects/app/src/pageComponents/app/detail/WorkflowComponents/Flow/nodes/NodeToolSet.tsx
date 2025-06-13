import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import React from 'react';
import { type NodeProps } from 'reactflow';
import NodeCard from './render/NodeCard';
import IOTitle from '../components/IOTitle';
import Container from '../components/Container';
import { useTranslation } from 'react-i18next';
import { type McpToolConfigType } from '@fastgpt/global/core/app/type';
import { Box, Flex } from '@chakra-ui/react';

const NodeToolSet = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();

  const { inputs } = data;
  const toolList: McpToolConfigType[] = inputs[0]?.value?.toolList;

  return (
    <NodeCard minW={'350px'} selected={selected} {...data}>
      <Container>
        <IOTitle text={t('app:MCP_tools_list')} />
        <Box maxH={'500px'} overflowY={'auto'} className="nowheel">
          {toolList?.map((tool, index) => (
            <Flex
              key={index}
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
      </Container>
    </NodeCard>
  );
};

export default React.memo(NodeToolSet);
