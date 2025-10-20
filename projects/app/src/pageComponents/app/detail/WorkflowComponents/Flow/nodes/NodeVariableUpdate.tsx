import React, { useCallback, useMemo, useRef } from 'react';
import NodeCard from './render/NodeCard';
import { type NodeProps } from 'reactflow';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { useTranslation } from 'next-i18next';
import { Box, Button, Flex } from '@chakra-ui/react';
import { type TUpdateListItem } from '@fastgpt/global/core/workflow/template/system/variableUpdate/type';
import type { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeInputKeyEnum, VARIABLE_NODE_ID } from '@fastgpt/global/core/workflow/constants';
import { useContextSelector } from 'use-context-selector';
import {
  FlowNodeInputMap,
  FlowNodeInputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import Container from '../components/Container';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { SmallAddIcon } from '@chakra-ui/icons';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import {
  type ReferenceItemValueType,
  type ReferenceValueType
} from '@fastgpt/global/core/workflow/type/io';
import { ReferSelector, useReference } from './render/RenderInput/templates/Reference';
import { getRefData } from '@/web/core/workflow/utils';
import { AppContext } from '@/pageComponents/app/detail/context';
import { useCreation, useMemoizedFn } from 'ahooks';
import { getEditorVariables } from '../../utils';
import {
  WorkflowBufferDataContext,
  WorkflowNodeDataContext
} from '../../context/workflowInitContext';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import InputRender from '@/components/core/app/formRender';
import {
  valueTypeToInputType,
  variableInputTypeToInputType
} from '@/components/core/app/formRender/utils';
import { InputTypeEnum } from '@/components/core/app/formRender/constant';
import { WorkflowActionsContext } from '../../context/workflowActionsContext';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';

const NodeVariableUpdate = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { inputs = [], nodeId } = data;
  const { t } = useTranslation();

  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  const { edges, getNodeById, systemConfigNode } = useContextSelector(
    WorkflowBufferDataContext,
    (v) => v
  );
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);

  const menuList = useRef([
    {
      renderType: FlowNodeInputTypeEnum.input,
      icon: FlowNodeInputMap[FlowNodeInputTypeEnum.input].icon,
      label: t('common:core.workflow.inputType.Manual input')
    },
    {
      renderType: FlowNodeInputTypeEnum.reference,
      icon: FlowNodeInputMap[FlowNodeInputTypeEnum.reference].icon,
      label: t('common:core.workflow.inputType.Reference')
    }
  ]);

  const variables = useMemoEnhance(() => {
    return getEditorVariables({
      nodeId,
      systemConfigNode,
      getNodeById,
      edges,
      appDetail,
      t
    });
  }, [nodeId, systemConfigNode, getNodeById, edges, appDetail, t]);
  const { feConfigs } = useSystemStore();
  const externalProviderWorkflowVariables = useMemo(() => {
    return (
      feConfigs?.externalProviderWorkflowVariables?.map((item) => ({
        key: item.key,
        label: item.name
      })) || []
    );
  }, [feConfigs?.externalProviderWorkflowVariables]);

  // Node inputs
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

  const ValueRender = useMemoizedFn(
    ({ updateItem, index }: { updateItem: TUpdateListItem; index: number }) => {
      const { inputType, formParams = {} } = (() => {
        const value = updateItem.variable;
        if (!value) {
          return {
            inputType: InputTypeEnum.input
          };
        }
        // Global variables: 根据变量的 inputType 决定
        if (value[0] === VARIABLE_NODE_ID) {
          const variableList = appDetail.chatConfig.variables || [];
          const variable = variableList.find((item) => item.key === value[1]);
          if (variable) {
            return {
              inputType: variableInputTypeToInputType(variable.type),
              formParams: {
                min: variable.min,
                max: variable.max,
                list: variable.list
              }
            };
          }
        }
        // Node output: 根据数据类型决定
        else if (value[0] && value[1]) {
          const output = getNodeById(value[0])?.outputs.find((output) => output.id === value[1]);
          if (output) {
            return {
              inputType: valueTypeToInputType(output.valueType)
            };
          }
        }

        return {
          inputType: InputTypeEnum.input
        };
      })();
      const { valueType } = getRefData({
        variable: updateItem.variable,
        getNodeById,
        systemConfigNode,
        chatConfig: appDetail.chatConfig
      });
      const renderTypeData = menuList.current.find(
        (item) => item.renderType === updateItem.renderType
      );

      const onUpdateNewValue = (value: any) => {
        if (updateItem.renderType === FlowNodeInputTypeEnum.reference) {
          onUpdateList(
            updateList.map((update, i) => (i === index ? { ...update, value: value } : update))
          );
        } else {
          onUpdateList(
            updateList.map((update, i) =>
              i === index ? { ...update, value: ['', value] } : update
            )
          );
        }
      };

      return (
        <Container key={index} w={'full'} mx={0}>
          <Flex alignItems={'center'}>
            <Flex w={'80px'}>{t('common:core.workflow.variable')}</Flex>
            <VariableSelector
              nodeId={nodeId}
              variable={updateItem.variable}
              onSelect={(value) => {
                onUpdateList(
                  updateList.map((update, i) => {
                    if (i === index) {
                      return {
                        ...update,
                        value: ['', ''],
                        valueType: getRefData({
                          variable: value as ReferenceItemValueType,
                          getNodeById,
                          systemConfigNode,
                          chatConfig: appDetail.chatConfig
                        }).valueType,
                        variable: value as ReferenceItemValueType
                      };
                    }
                    return update;
                  })
                );
              }}
            />
            <Box flex={1} />
            {updateList.length > 1 && (
              <MyIcon
                className="delete"
                name={'delete'}
                w={'14px'}
                color={'myGray.600'}
                cursor={'pointer'}
                _hover={{ color: 'red.500' }}
                position={'absolute'}
                top={3}
                right={3}
                onClick={() => {
                  onUpdateList(updateList.filter((_, i) => i !== index));
                }}
              />
            )}
          </Flex>
          <Flex mt={2} w={'full'} alignItems={'center'} className="nodrag">
            <Flex w={'80px'}>
              <Box>{t('common:value')}</Box>
              <MyTooltip
                label={
                  menuList.current.find((item) => item.renderType === updateItem.renderType)?.label
                }
              >
                <Button
                  size={'xs'}
                  bg={'white'}
                  borderRadius={'xs'}
                  mx={2}
                  color={'primary.600'}
                  onClick={() => {
                    onUpdateList(
                      updateList.map((update, i) => {
                        if (i === index) {
                          return {
                            ...update,
                            value: undefined,
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
              </MyTooltip>
            </Flex>

            {/* Render input components */}
            {(() => {
              if (updateItem.renderType === FlowNodeInputTypeEnum.reference) {
                return (
                  <VariableSelector
                    nodeId={nodeId}
                    variable={updateItem.value}
                    valueType={valueType}
                    onSelect={onUpdateNewValue}
                  />
                );
              }

              return (
                <Box w={'300px'} borderRadius={'sm'}>
                  <InputRender
                    // @ts-ignore
                    inputType={inputType}
                    {...formParams}
                    variables={[...variables, ...externalProviderWorkflowVariables]}
                    variableLabels={variables}
                    value={updateItem.value?.[1]}
                    onChange={onUpdateNewValue}
                  />
                </Box>
              );
            })()}
          </Flex>
        </Container>
      );
    }
  );

  const Render = useMemo(() => {
    return (
      <NodeCard selected={selected} maxW={'1000px'} {...data}>
        <Box px={4} pb={4}>
          <Flex flexDirection={'column'} gap={4}>
            {updateList.map((updateItem, index) => (
              <ValueRender key={index} updateItem={updateItem} index={index} />
            ))}
          </Flex>
          <Flex
            className="nodrag"
            cursor={'default'}
            alignItems={'center'}
            position={'relative'}
            mt={4}
          >
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
              {t('common:add_new')}
            </Button>
          </Flex>
        </Box>
      </NodeCard>
    );
  }, [ValueRender, data, onUpdateList, selected, t, updateList]);

  return Render;
};
export default React.memo(NodeVariableUpdate);

const VariableSelector = ({
  nodeId,
  variable,
  valueType,
  onSelect
}: {
  nodeId: string;
  variable?: ReferenceValueType;
  valueType?: WorkflowIOValueTypeEnum;
  onSelect: (e?: ReferenceValueType) => void;
}) => {
  const { t } = useTranslation();

  const { referenceList } = useReference({
    nodeId,
    valueType
  });

  return (
    <ReferSelector
      placeholder={t('common:select_reference_variable')}
      list={referenceList}
      value={variable}
      onSelect={onSelect}
      isArray={valueType?.includes('array')}
    />
  );
};
