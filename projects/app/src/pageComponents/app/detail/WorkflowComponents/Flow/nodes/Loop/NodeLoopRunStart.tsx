import { FixedTableContainer } from '@fastgpt/web/components/common/FixedTable';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { useTranslation } from 'next-i18next';
import type { CanvasNodeProps } from '@/web/core/workflow/editor/canvas/canvasTypes';
import NodeCard from '../render/NodeCard';
import { Box, Flex, Table, Tbody, Td, Th, Thead, Tr } from '@chakra-ui/react';
import React from 'react';
import { FlowValueTypeMap } from '@fastgpt/global/core/workflow/node/constant';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useNode } from '@/web/core/workflow/editor/react/useNode';

const emptyOutputs: FlowNodeItemType['outputs'] = [];

const NodeLoopRunStart = ({ data, selected }: CanvasNodeProps) => {
  const { t } = useTranslation();
  const { nodeId } = data;
  const outputs =
    useNode<FlowNodeItemType['outputs']>(nodeId, (current) => current?.data.outputs) ??
    emptyOutputs;

  return (
    <NodeCard
      selected={selected}
      {...data}
      menuForbid={{
        copy: true,
        delete: true,
        debug: true
      }}
    >
      <Box px={4} pt={2} w={'420px'}>
        <Box bg={'white'} borderRadius={'md'} overflow={'hidden'} border={'base'}>
          <FixedTableContainer flush className="nodrag nowheel">
            <Table bg={'white'} variant={'workflow'}>
              <Thead>
                <Tr>
                  <Th>{t('workflow:Variable_name')}</Th>
                  <Th>{t('common:core.workflow.Value type')}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {outputs.map((output) => (
                  <Tr key={output.id}>
                    <Td>
                      <Flex alignItems={'center'}>
                        <MyIcon
                          name={'core/workflow/inputType/array'}
                          w={'14px'}
                          mr={1}
                          color={'primary.600'}
                        />
                        {t(output.label as any)}
                      </Flex>
                    </Td>
                    {output.valueType && <Td>{FlowValueTypeMap[output.valueType]?.label}</Td>}
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </FixedTableContainer>
        </Box>
      </Box>
    </NodeCard>
  );
};

export default React.memo(NodeLoopRunStart);
