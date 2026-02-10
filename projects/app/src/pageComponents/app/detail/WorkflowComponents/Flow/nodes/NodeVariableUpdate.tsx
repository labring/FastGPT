import React, { useCallback, useMemo } from 'react';
import NodeCard from './render/NodeCard';
import { type NodeProps } from 'reactflow';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { useTranslation } from 'next-i18next';
import { Box, Button, Flex } from '@chakra-ui/react';
import NodeInputSelect from '@fastgpt/web/components/core/workflow/NodeInputSelect';
import { type TUpdateListItem } from '@fastgpt/global/core/workflow/template/system/variableUpdate/type';
import {
  WorkflowIOValueTypeEnum,
  NodeInputKeyEnum,
  VARIABLE_NODE_ID,
  VariableInputEnum
} from '@fastgpt/global/core/workflow/constants';
import { useContextSelector } from 'use-context-selector';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import Container from '../components/Container';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { SmallAddIcon } from '@chakra-ui/icons';
import {
  type ReferenceItemValueType,
  type ReferenceValueType
} from '@fastgpt/global/core/workflow/type/io';
import { ReferSelector, useReference } from './render/RenderInput/templates/Reference';
import { getRefData } from '@/web/core/workflow/utils';
import { AppContext } from '@/pageComponents/app/detail/context';
import { getEditorVariables } from '../../utils';
import { WorkflowBufferDataContext } from '../../context/workflowInitContext';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import InputRender from '@/components/core/app/formRender';
import {
  valueTypeToInputType,
  variableInputTypeToInputType
} from '@/components/core/app/formRender/utils';
import { InputTypeEnum } from '@/components/core/app/formRender/constant';
import { WorkflowActionsContext } from '../../context/workflowActionsContext';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { useMemoizedFn } from 'ahooks';
import {
  BooleanSelectValueEnum,
  VariableUpdateOperatorEnum
} from '@fastgpt/global/core/workflow/template/system/variableUpdate/constants';
import type { TOperationValue } from '@fastgpt/global/core/workflow/template/system/variableUpdate/type';
import MySelect from '@fastgpt/web/components/common/MySelect';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import ValueTypeLabel from './render/ValueTypeLabel';

const getInputInitialValue = (
  valueType?: WorkflowIOValueTypeEnum
): TUpdateListItem['value'] | undefined => {
  if (valueType === WorkflowIOValueTypeEnum.number) {
    return ['', { operator: VariableUpdateOperatorEnum.set, value: '' }];
  }
  if (valueType === WorkflowIOValueTypeEnum.boolean) {
    return ['', { operator: VariableUpdateOperatorEnum.set, value: true }];
  }
  return undefined;
};

const NodeVariableUpdate = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { inputs = [], nodeId } = data;
  const { t } = useTranslation();

  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  const { edges, getNodeById, systemConfigNode } = useContextSelector(
    WorkflowBufferDataContext,
    (v) => v
  );
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);

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

  const numberOperatorList = useMemo(
    () => [
      {
        label: t('workflow:variable_update_operator_set'),
        value: VariableUpdateOperatorEnum.set
      },
      {
        label: t('workflow:variable_update_operator_add'),
        value: VariableUpdateOperatorEnum.add
      },
      {
        label: t('workflow:variable_update_operator_sub'),
        value: VariableUpdateOperatorEnum.sub
      },
      {
        label: t('workflow:variable_update_operator_mul'),
        value: VariableUpdateOperatorEnum.mul
      },
      {
        label: t('workflow:variable_update_operator_div'),
        value: VariableUpdateOperatorEnum.div
      }
    ],
    [t]
  );

  const booleanOperatorList = useMemo(
    () => [
      { label: 'True', value: BooleanSelectValueEnum.setTrue },
      { label: 'False', value: BooleanSelectValueEnum.setFalse },
      { label: t('workflow:variable_update_boolean_negate'), value: BooleanSelectValueEnum.negate }
    ],
    [t]
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
            // 文件类型在变量更新节点中使用文本框,因为不在运行时上下文中,无法使用文件选择器
            const inputType =
              variable.type === VariableInputEnum.file
                ? InputTypeEnum.textarea
                : variableInputTypeToInputType(variable.type);

            return {
              inputType,
              formParams: {
                // 获取变量中一些表单配置
                maxLength: variable.maxLength,
                minLength: variable.minLength,
                min: variable.min,
                max: variable.max,
                list: variable.list,
                timeGranularity: variable.timeGranularity,
                timeRangeStart: variable.timeRangeStart,
                timeRangeEnd: variable.timeRangeEnd,
                maxFiles: variable.maxFiles,
                canSelectFile: variable.canSelectFile,
                canSelectImg: variable.canSelectImg,
                canSelectVideo: variable.canSelectVideo,
                canSelectAudio: variable.canSelectAudio,
                canSelectCustomFileExtension: variable.canSelectCustomFileExtension,
                customFileExtensionList: variable.customFileExtensionList
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
      const onUpdateNewValue = (value: any) => {
        onUpdateList(
          updateList.map((item, i) =>
            i === index
              ? {
                  ...item,
                  value:
                    updateItem.renderType === FlowNodeInputTypeEnum.reference ? value : ['', value]
                }
              : item
          )
        );
      };

      return (
        <Container key={index} w={'full'} mx={0}>
          <Flex alignItems={'center'}>
            <Box fontSize={'sm'} color={'myGray.600'}>
              {t('common:core.workflow.variable')}
            </Box>
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

          <Box mt={1}>
            <VariableSelector
              nodeId={nodeId}
              variable={updateItem.variable}
              onSelect={(value) => {
                const newValueType = getRefData({
                  variable: value as ReferenceItemValueType,
                  getNodeById,
                  systemConfigNode,
                  chatConfig: appDetail.chatConfig
                }).valueType;

                onUpdateList(
                  updateList.map((item, i) =>
                    i === index
                      ? {
                          ...item,
                          value: getInputInitialValue(newValueType) ?? ['', ''],
                          valueType: newValueType,
                          variable: value as ReferenceItemValueType
                        }
                      : item
                  )
                );
              }}
              labelSuffix={valueType ? <ValueTypeLabel valueType={valueType} /> : undefined}
            />
          </Box>

          <Flex mt={2} alignItems={'center'}>
            <Box fontSize={'sm'} color={'myGray.600'}>
              {t('common:value')}
            </Box>
            <Box ml={2}>
              <NodeInputSelect
                renderTypeList={[FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference]}
                renderTypeIndex={updateItem.renderType === FlowNodeInputTypeEnum.reference ? 1 : 0}
                onChange={(e) => {
                  const isReference = e === FlowNodeInputTypeEnum.reference;
                  onUpdateList(
                    updateList.map((item, i) =>
                      i === index
                        ? {
                            ...item,
                            value: isReference ? undefined : getInputInitialValue(valueType),
                            renderType: isReference
                              ? FlowNodeInputTypeEnum.reference
                              : FlowNodeInputTypeEnum.input
                          }
                        : item
                    )
                  );
                }}
              />
            </Box>
          </Flex>

          <Box mt={1} className="nodrag">
            {(() => {
              if (updateItem.renderType === FlowNodeInputTypeEnum.reference) {
                return (
                  <VariableSelector
                    nodeId={nodeId}
                    variable={updateItem.value as ReferenceValueType}
                    valueType={valueType}
                    onSelect={onUpdateNewValue}
                  />
                );
              }

              if (valueType === WorkflowIOValueTypeEnum.number) {
                const raw = updateItem.value?.[1];
                const opValue: TOperationValue =
                  typeof raw === 'object' && raw !== null && 'operator' in raw
                    ? (raw as TOperationValue)
                    : { operator: VariableUpdateOperatorEnum.set, value: raw ?? '' };

                return (
                  <Flex gap={2} alignItems="center">
                    <MySelect
                      w="100px"
                      h={9}
                      list={numberOperatorList}
                      value={opValue.operator}
                      onChange={(op: string) => onUpdateNewValue({ ...opValue, operator: op })}
                    />
                    <MyNumberInput
                      flex={1}
                      h={9}
                      inputFieldProps={{ bg: 'white' }}
                      placeholder={t('workflow:variable_update_number_placeholder')}
                      value={opValue.value as number | string}
                      onChange={(val: number | string | undefined) =>
                        onUpdateNewValue({ ...opValue, value: val })
                      }
                    />
                  </Flex>
                );
              }

              if (valueType === WorkflowIOValueTypeEnum.boolean) {
                const raw = updateItem.value?.[1];
                const opValue: TOperationValue =
                  typeof raw === 'object' && raw !== null && 'operator' in raw
                    ? (raw as TOperationValue)
                    : { operator: VariableUpdateOperatorEnum.set, value: !!raw };

                const selectValue =
                  opValue.operator === VariableUpdateOperatorEnum.negate
                    ? BooleanSelectValueEnum.negate
                    : opValue.value === false
                      ? BooleanSelectValueEnum.setFalse
                      : BooleanSelectValueEnum.setTrue;

                return (
                  <MySelect
                    w="100%"
                    list={booleanOperatorList}
                    value={selectValue}
                    onChange={(val: string) => {
                      if (val === BooleanSelectValueEnum.negate) {
                        onUpdateNewValue({
                          operator: VariableUpdateOperatorEnum.negate
                        });
                      } else {
                        onUpdateNewValue({
                          operator: VariableUpdateOperatorEnum.set,
                          value: val === BooleanSelectValueEnum.setTrue
                        });
                      }
                    }}
                  />
                );
              }

              return (
                <InputRender
                  inputType={inputType}
                  {...formParams}
                  isRichText={false}
                  variables={[...variables, ...externalProviderWorkflowVariables]}
                  variableLabels={variables}
                  value={updateItem.value?.[1]}
                  onChange={onUpdateNewValue}
                  minH={80}
                />
              );
            })()}
          </Box>
        </Container>
      );
    }
  );

  const Render = useMemo(() => {
    return (
      <NodeCard selected={selected} minW={'400px'} maxW={'1000px'} {...data}>
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
  onSelect,
  labelSuffix
}: {
  nodeId: string;
  variable?: ReferenceValueType;
  valueType?: WorkflowIOValueTypeEnum;
  onSelect: (e?: ReferenceValueType) => void;
  labelSuffix?: React.ReactNode;
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
      labelSuffix={labelSuffix}
    />
  );
};
