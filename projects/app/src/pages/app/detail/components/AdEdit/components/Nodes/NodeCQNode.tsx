import React from 'react';
import { NodeProps } from 'reactflow';
import { Box, Input, Button, Flex, Textarea } from '@chakra-ui/react';
import NodeCard from '../modules/NodeCard';
import { FlowModuleItemType } from '@/types/core/app/flow';
import Divider from '../modules/Divider';
import Container from '../modules/Container';
import RenderInput from '../render/RenderInput';
import type { ClassifyQuestionAgentItemType } from '@/types/app';
import { customAlphabet } from 'nanoid';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 4);
import MyIcon from '@/components/Icon';
import { FlowOutputItemTypeEnum, FlowValueTypeEnum, SpecialInputKeyEnum } from '@/constants/flow';
import { useTranslation } from 'react-i18next';
import SourceHandle from '../render/SourceHandle';
import MyTooltip from '@/components/MyTooltip';
import { useFlowStore } from '../Provider';

const NodeCQNode = ({ data }: NodeProps<FlowModuleItemType>) => {
  const { t } = useTranslation();
  const { moduleId, inputs, outputs } = data;
  const { onChangeNode } = useFlowStore();

  return (
    <NodeCard minW={'400px'} {...data}>
      <Divider text="Input" />
      <Container>
        <RenderInput
          moduleId={moduleId}
          flowInputList={inputs}
          CustomComponent={{
            [SpecialInputKeyEnum.agents]: ({
              key: agentKey,
              value: agents = [],
              ...props
            }: {
              key: string;
              value?: ClassifyQuestionAgentItemType[];
            }) => (
              <Box>
                {agents.map((item, i) => (
                  <Box key={item.key} mb={4}>
                    <Flex alignItems={'center'}>
                      <MyTooltip label={t('common.Delete')}>
                        <MyIcon
                          mt={1}
                          mr={2}
                          name={'minus'}
                          w={'14px'}
                          cursor={'pointer'}
                          color={'myGray.600'}
                          _hover={{ color: 'red.600' }}
                          onClick={() => {
                            const newInputValue = agents.filter((input) => input.key !== item.key);
                            const newOutputVal = outputs.filter(
                              (output) => output.key !== item.key
                            );

                            onChangeNode({
                              moduleId,
                              type: 'inputs',
                              key: agentKey,
                              value: {
                                ...props,
                                key: agentKey,
                                value: newInputValue
                              }
                            });
                            onChangeNode({
                              moduleId,
                              type: 'outputs',
                              key: '',
                              value: newOutputVal
                            });
                          }}
                        />
                      </MyTooltip>
                      <Box flex={1}>分类{i + 1}</Box>
                    </Flex>
                    <Box position={'relative'}>
                      <Textarea
                        rows={2}
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
                            type: 'inputs',
                            key: agentKey,
                            value: {
                              ...props,
                              key: agentKey,
                              value: newVal
                            }
                          });
                        }}
                      />
                      <SourceHandle handleKey={item.key} valueType={FlowValueTypeEnum.boolean} />
                    </Box>
                  </Box>
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
                      value: {
                        ...props,
                        key: agentKey,
                        value: newInputValue
                      }
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
