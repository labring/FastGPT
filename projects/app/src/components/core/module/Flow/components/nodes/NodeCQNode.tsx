import React from 'react';
import { NodeProps } from 'reactflow';
import { Box, Button, Flex, Textarea } from '@chakra-ui/react';
import NodeCard from '../render/NodeCard';
import { FlowModuleItemType } from '@fastgpt/global/core/module/type.d';
import Divider from '../modules/Divider';
import Container from '../modules/Container';
import RenderInput from '../render/RenderInput';
import type { ClassifyQuestionAgentItemType } from '@fastgpt/global/core/module/type.d';
import { customAlphabet } from 'nanoid';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 4);
import MyIcon from '@fastgpt/web/components/common/Icon';
import { FlowNodeOutputTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { ModuleIOValueTypeEnum, ModuleInputKeyEnum } from '@fastgpt/global/core/module/constants';
import { useTranslation } from 'next-i18next';
import SourceHandle from '../render/SourceHandle';
import MyTooltip from '@/components/MyTooltip';
import { onChangeNode } from '../../FlowProvider';

const NodeCQNode = React.memo(function NodeCQNode({ data }: { data: FlowModuleItemType }) {
  const { t } = useTranslation();
  const { moduleId, inputs } = data;

  return (
    <NodeCard minW={'400px'} {...data}>
      <Divider text="Input" />
      <Container>
        <RenderInput
          moduleId={moduleId}
          flowInputList={inputs}
          CustomComponent={{
            [ModuleInputKeyEnum.agents]: ({ key: agentKey, value = [], ...props }) => {
              const agents = value as ClassifyQuestionAgentItemType[];
              return (
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
                              onChangeNode({
                                moduleId,
                                type: 'updateInput',
                                key: agentKey,
                                value: {
                                  ...props,
                                  key: agentKey,
                                  value: agents.filter((input) => input.key !== item.key)
                                }
                              });
                              onChangeNode({
                                moduleId,
                                type: 'delOutput',
                                key: item.key
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
                        <SourceHandle
                          handleKey={item.key}
                          valueType={ModuleIOValueTypeEnum.boolean}
                        />
                      </Box>
                    </Box>
                  ))}
                  <Button
                    onClick={() => {
                      const key = nanoid();

                      onChangeNode({
                        moduleId,
                        type: 'updateInput',
                        key: agentKey,
                        value: {
                          ...props,
                          key: agentKey,
                          value: agents.concat({ value: '', key })
                        }
                      });

                      onChangeNode({
                        moduleId,
                        type: 'addOutput',
                        value: {
                          key,
                          label: '',
                          type: FlowNodeOutputTypeEnum.hidden,
                          targets: []
                        }
                      });
                    }}
                  >
                    添加问题类型
                  </Button>
                </Box>
              );
            }
          }}
        />
      </Container>
    </NodeCard>
  );
});
export default function Node({ data }: NodeProps<FlowModuleItemType>) {
  return <NodeCQNode data={data} />;
}
