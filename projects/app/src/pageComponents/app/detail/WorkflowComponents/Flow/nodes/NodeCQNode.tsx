import React, { useMemo } from 'react';
import { type NodeProps, Position } from 'reactflow';
import { Box, Button, Flex, Textarea } from '@chakra-ui/react';
import NodeCard from './render/NodeCard';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node.d';
import Container from '../components/Container';
import RenderInput from './render/RenderInput';
import type { ClassifyQuestionAgentItemType } from '@fastgpt/global/core/workflow/template/system/classifyQuestion/type';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useTranslation } from 'next-i18next';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { type FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io.d';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { MySourceHandle } from './render/Handle';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../context';

const NodeCQNode = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const { nodeId, inputs } = data;
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

  const CustomComponent = useMemo(
    () => ({
      [NodeInputKeyEnum.agents]: ({
        key: agentKey,
        value = [],
        ...props
      }: FlowNodeInputItemType) => {
        const agents = value as ClassifyQuestionAgentItemType[];
        return (
          <Box>
            {agents.map((item, i) => (
              <Box key={item.key} mb={4}>
                <Flex alignItems={'center'}>
                  <MyTooltip label={t('common:Delete')}>
                    <MyIcon
                      mt={1}
                      mr={2}
                      name={'circleMinus'}
                      w={'12px'}
                      cursor={'pointer'}
                      color={'myGray.600'}
                      _hover={{ color: 'red.600' }}
                      onClick={() => {
                        onChangeNode({
                          nodeId,
                          type: 'updateInput',
                          key: agentKey,
                          value: {
                            ...props,
                            key: agentKey,
                            value: agents.filter((input) => input.key !== item.key)
                          }
                        });
                        onChangeNode({
                          nodeId,
                          type: 'delOutput',
                          key: item.key
                        });
                      }}
                    />
                  </MyTooltip>
                  <Box flex={1} color={'myGray.600'} fontWeight={'medium'}>
                    {t('common:classification') + (i + 1)}
                  </Box>
                </Flex>
                <Box position={'relative'}>
                  <Textarea
                    rows={2}
                    mt={1}
                    defaultValue={item.value}
                    bg={'white'}
                    fontSize={'sm'}
                    onChange={(e) => {
                      const newVal = agents.map((val) =>
                        val.key === item.key
                          ? {
                              ...val,
                              value: e.target.value
                            }
                          : val
                      );
                      onChangeNode({
                        nodeId,
                        type: 'updateInput',
                        key: agentKey,
                        value: {
                          ...props,
                          key: agentKey,
                          value: newVal
                        }
                      });
                    }}
                  />
                  <MySourceHandle
                    nodeId={nodeId}
                    handleId={getHandleId(nodeId, 'source', item.key)}
                    position={Position.Right}
                    translate={[34, 0]}
                  />
                </Box>
              </Box>
            ))}
            <Button
              fontSize={'sm'}
              onClick={() => {
                const key = getNanoid();

                onChangeNode({
                  nodeId,
                  type: 'updateInput',
                  key: agentKey,
                  value: {
                    ...props,
                    key: agentKey,
                    value: agents.concat({ value: '', key })
                  }
                });
              }}
            >
              {t('common:core.module.Add question type')}
            </Button>
          </Box>
        );
      }
    }),
    [nodeId, onChangeNode, t]
  );

  const Render = useMemo(() => {
    return (
      <NodeCard minW={'400px'} selected={selected} {...data}>
        <Container>
          <RenderInput nodeId={nodeId} flowInputList={inputs} CustomComponent={CustomComponent} />
        </Container>
      </NodeCard>
    );
  }, [CustomComponent, data, inputs, nodeId, selected]);

  return Render;
};
export default React.memo(NodeCQNode);
