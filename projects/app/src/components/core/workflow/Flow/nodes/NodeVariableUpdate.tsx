import React, { useCallback, useMemo } from 'react';
import NodeCard from './render/NodeCard';
import { NodeProps } from 'reactflow';
import { FlowNodeItemType } from '@fastgpt/global/core/workflow/type';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Button,
  Flex,
  NumberDecrementStepper,
  NumberIncrementStepper,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  Switch,
  Textarea
} from '@chakra-ui/react';
import { TUpdateListItem } from '@fastgpt/global/core/workflow/template/system/variableUpdate/type';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '@/components/core/workflow/context';
import {
  FlowNodeInputMap,
  FlowNodeInputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import Container from '../components/Container';
import { Reference } from './NodeIfElse';
import MyIcon from '@fastgpt/web/components/common/Icon';
import JsonEditor from '@fastgpt/web/components/common/Textarea/JsonEditor';
import { SmallAddIcon } from '@chakra-ui/icons';

const NodeVariableUpdate = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { inputs = [], nodeId } = data;
  const { t } = useTranslation();

  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);
  const nodes = useContextSelector(WorkflowContext, (v) => v.nodes);

  const updateList = useMemo(
    () =>
      (inputs.find((input) => input.key === NodeInputKeyEnum.updateList)
        ?.value as TUpdateListItem[]) || [],
    [inputs]
  );

  const onUpdateList = useCallback(
    (value: TUpdateListItem[]) => {
      const updateListInput = inputs.find((input) => input.key === NodeInputKeyEnum.updateList);
      if (!updateListInput) return;

      onChangeNode({
        nodeId,
        type: 'updateInput',
        key: NodeInputKeyEnum.updateList,
        value: {
          ...updateListInput,
          value
        }
      });
    },
    [inputs, nodeId, onChangeNode]
  );

  const menuList = [
    {
      renderType: FlowNodeInputTypeEnum.input,
      icon: FlowNodeInputMap[FlowNodeInputTypeEnum.input].icon,
      label: t('core.workflow.inputType.Manual input')
    },
    {
      renderType: FlowNodeInputTypeEnum.reference,
      icon: FlowNodeInputMap[FlowNodeInputTypeEnum.reference].icon,
      label: t('core.workflow.inputType.Reference')
    }
  ];

  return (
    <NodeCard selected={selected} maxW={'1000px'} {...data}>
      <Box px={4} pb={4}>
        {/* <RenderInput nodeId={nodeId} flowInputList={inputs} /> */}
        {updateList.map((updateItem, index) => {
          const type = (() => {
            const variable = updateItem.variable;
            const variableNodeId = variable?.[0];
            const variableNode = nodes.find((node) => node.id === variableNodeId);
            if (!variableNode) return 'any';
            const variableInput = variableNode.data.outputs.find(
              (output) => output.id === variable?.[1]
            );
            if (!variableInput) return 'any';
            return variableInput.valueType;
          })();

          const renderTypeData = menuList.find((item) => item.renderType === updateItem.renderType);

          return (
            <Flex key={index}>
              <Container mt={4}>
                <Flex alignItems={'center'}>
                  <Flex w={'60px'}>变量</Flex>
                  <Reference
                    nodeId={nodeId}
                    variable={updateItem.variable}
                    onSelect={(value) => {
                      onUpdateList(
                        updateList.map((update, i) => {
                          if (i === index) {
                            return {
                              ...update,
                              variable: value
                            };
                          }
                          return update;
                        })
                      );
                    }}
                  />
                </Flex>
                <Flex mt={2} w={'full'} alignItems={'center'}>
                  <Flex w={'60px'} flex={0}>
                    <Box>值</Box>
                    <Button
                      size={'xs'}
                      bg={'white'}
                      borderRadius={'xs'}
                      mx={2}
                      onClick={() => {
                        onUpdateList(
                          updateList.map((update, i) => {
                            if (i === index) {
                              return {
                                ...update,
                                value: ['', ''],
                                renderType:
                                  updateItem.renderType === FlowNodeInputTypeEnum.input
                                    ? FlowNodeInputTypeEnum.reference
                                    : FlowNodeInputTypeEnum.input
                              };
                            }
                            return update;
                          })
                        );
                      }}
                    >
                      <MyIcon name={renderTypeData?.icon as any} w={'14px'} />
                    </Button>
                  </Flex>
                  {updateItem.renderType === FlowNodeInputTypeEnum.reference && (
                    <Reference
                      nodeId={nodeId}
                      variable={updateItem.value}
                      onSelect={(value) => {
                        onUpdateList(
                          updateList.map((update, i) => {
                            if (i === index) {
                              return {
                                ...update,
                                value
                              };
                            }
                            return update;
                          })
                        );
                      }}
                    />
                  )}
                  {updateItem.renderType !== FlowNodeInputTypeEnum.reference &&
                    type === 'string' && (
                      <Textarea
                        bg={'white'}
                        value={updateItem.value?.[1] || ''}
                        w={'300px'}
                        onChange={(e) => {
                          onUpdateList(
                            updateList.map((update, i) => {
                              if (i === index) {
                                return {
                                  ...update,
                                  value: ['', e.target.value]
                                };
                              }
                              return update;
                            })
                          );
                        }}
                      />
                    )}
                  {updateItem.renderType !== FlowNodeInputTypeEnum.reference &&
                    type === 'number' && (
                      <NumberInput value={Number(updateItem.value?.[1]) || 0}>
                        <NumberInputField
                          bg={'white'}
                          onChange={(e) => {
                            onUpdateList(
                              updateList.map((update, i) => {
                                if (i === index) {
                                  return {
                                    ...update,
                                    value: ['', e.target.value]
                                  };
                                }
                                return update;
                              })
                            );
                          }}
                        />
                        <NumberInputStepper>
                          <NumberIncrementStepper />
                          <NumberDecrementStepper />
                        </NumberInputStepper>
                      </NumberInput>
                    )}
                  {updateItem.renderType !== FlowNodeInputTypeEnum.reference &&
                    type === 'boolean' && (
                      <Switch
                        size={'lg'}
                        defaultChecked={updateItem.value?.[1] === 'true'}
                        onChange={(e) => {
                          onUpdateList(
                            updateList.map((update, i) => {
                              if (i === index) {
                                return {
                                  ...update,
                                  value: ['', String(e.target.checked)]
                                };
                              }
                              return update;
                            })
                          );
                        }}
                      />
                    )}
                  {updateItem.renderType !== FlowNodeInputTypeEnum.reference &&
                    type !== 'string' &&
                    type !== 'number' &&
                    type !== 'boolean' && (
                      <JsonEditor
                        bg={'white'}
                        resize
                        w={'300px'}
                        value={updateItem.value?.[1] || ''}
                        onChange={(e) => {
                          onUpdateList(
                            updateList.map((update, i) => {
                              if (i === index) {
                                return {
                                  ...update,
                                  value: ['', e]
                                };
                              }
                              return update;
                            })
                          );
                        }}
                      />
                    )}
                </Flex>
              </Container>
              <MyIcon
                className="delete"
                name={'delete'}
                w={'14px'}
                color={'myGray.600'}
                cursor={'pointer'}
                ml={2}
                _hover={{ color: 'red.500' }}
                onClick={() => {
                  onUpdateList(updateList.filter((_, i) => i !== index));
                }}
              />
            </Flex>
          );
        })}
        <Flex className="nodrag" cursor={'default'} alignItems={'center'} position={'relative'}>
          <Button
            variant={'whiteBase'}
            leftIcon={<SmallAddIcon />}
            iconSpacing={1}
            w={'full'}
            size={'sm'}
            onClick={() => {
              onUpdateList([
                ...updateList,
                {
                  variable: ['', ''],
                  value: ['', ''],
                  renderType: FlowNodeInputTypeEnum.input
                }
              ]);
            }}
          >
            {t('common.Add New')}
          </Button>
        </Flex>
      </Box>
    </NodeCard>
  );
};
export default React.memo(NodeVariableUpdate);
