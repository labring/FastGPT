import React from 'react';
import { NodeProps } from 'reactflow';
import { Box, Input, Button, Flex } from '@chakra-ui/react';
import NodeCard from '../modules/NodeCard';
import { FlowModuleItemType } from '@/types/flow';
import Divider from '../modules/Divider';
import Container from '../modules/Container';
import RenderInput from '../render/RenderInput';
import type { ClassifyQuestionAgentItemType } from '@/types/app';
import { Handle, Position } from 'reactflow';
import { customAlphabet } from 'nanoid';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 4);
import MyIcon from '@/components/Icon';
import { FlowOutputItemTypeEnum, FlowValueTypeEnum } from '@/constants/flow';
import SourceHandle from '../render/SourceHandle';

const NodeCQNode = ({
  data: { moduleId, inputs, outputs, onChangeNode, ...props }
}: NodeProps<FlowModuleItemType>) => {
  return (
    <NodeCard minW={'400px'} moduleId={moduleId} {...props}>
      <Divider text="Input" />
      <Container>
        <RenderInput
          moduleId={moduleId}
          onChangeNode={onChangeNode}
          flowInputList={inputs}
          CustomComponent={{
            agents: ({
              key: agentKey,
              value: agents = []
            }: {
              key: string;
              value?: ClassifyQuestionAgentItemType[];
            }) => (
              <Box>
                {agents.map((item, i) => (
                  <Flex key={item.key} mb={4} alignItems={'center'}>
                    <MyIcon
                      mr={2}
                      name={'minus'}
                      w={'14px'}
                      cursor={'pointer'}
                      color={'myGray.600'}
                      _hover={{ color: 'myGray.900' }}
                      onClick={() => {
                        const newInputValue = agents.filter((input) => input.key !== item.key);
                        const newOutputVal = outputs.filter((output) => output.key !== item.key);

                        onChangeNode({
                          moduleId,
                          type: 'inputs',
                          key: agentKey,
                          value: newInputValue
                        });
                        onChangeNode({
                          moduleId,
                          type: 'outputs',
                          key: agentKey,
                          value: newOutputVal
                        });
                      }}
                    />
                    <Box flex={1}>
                      <Box flex={1}>类型{i + 1}</Box>
                      <Box position={'relative'}>
                        <Input
                          mt={1}
                          defaultValue={item.value}
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
                              moduleId,
                              key: agentKey,
                              value: newVal
                            });
                          }}
                        />
                        <SourceHandle handleKey={item.key} valueType={FlowValueTypeEnum.boolean} />
                      </Box>
                    </Box>
                  </Flex>
                ))}
                <Button
                  onClick={() => {
                    const key = nanoid();
                    const newInputValue = agents.concat({ value: '', key });
                    const newOutputValue = outputs.concat({
                      key,
                      label: '',
                      type: FlowOutputItemTypeEnum.hidden,
                      targets: []
                    });
                    onChangeNode({
                      moduleId,
                      type: 'inputs',
                      key: agentKey,
                      value: newInputValue
                    });
                    onChangeNode({
                      moduleId,
                      type: 'outputs',
                      key: agentKey,
                      value: newOutputValue
                    });
                  }}
                >
                  添加问题类型
                </Button>
              </Box>
            )
          }}
        />
      </Container>
    </NodeCard>
  );
};
export default React.memo(NodeCQNode);
