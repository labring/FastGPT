import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import NodeCard from './render/NodeCard';
import { NodeProps } from 'reactflow';
import { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { useTranslation } from 'next-i18next';
import {
  Box,
  Button,
  Flex,
  NumberDecrementStepper,
  NumberIncrementStepper,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  Switch
} from '@chakra-ui/react';
import { TUpdateListItem } from '@fastgpt/global/core/workflow/template/system/variableUpdate/type';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../context';
import {
  FlowNodeInputMap,
  FlowNodeInputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import Container from '../components/Container';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { SmallAddIcon } from '@chakra-ui/icons';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { ReferenceValueProps } from '@fastgpt/global/core/workflow/type/io';
import { ReferSelector, useReference } from './render/RenderInput/templates/Reference';
import { getRefData } from '@/web/core/workflow/utils';
import { isReferenceValue } from '@fastgpt/global/core/workflow/utils';
import { AppContext } from '@/pages/app/detail/components/context';
import PromptEditor from '@fastgpt/web/components/common/Textarea/PromptEditor';
import { useCreation, useMemoizedFn } from 'ahooks';
import { getEditorVariables } from '../../utils';

const NodeVariableUpdate = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { inputs = [], nodeId } = data;
  const { t } = useTranslation();

  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const edges = useContextSelector(WorkflowContext, (v) => v.edges);

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

  const variables = useCreation(() => {
    return getEditorVariables({
      nodeId,
      nodeList,
      edges,
      appDetail,
      t
    });
  }, [nodeId, nodeList, edges, appDetail, t]);

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
      const { valueType } = getRefData({
        variable: updateItem.variable,
        nodeList,
        chatConfig: appDetail.chatConfig
      });
      const renderTypeData = menuList.current.find(
        (item) => item.renderType === updateItem.renderType
      );

      const nodeIds = nodeList.map((node) => node.nodeId);
      const handleUpdate = (newValue: ReferenceValueProps | string) => {
        if (isReferenceValue(newValue, nodeIds)) {
          onUpdateList(
            updateList.map((update, i) =>
              i === index ? { ...update, value: newValue as ReferenceValueProps } : update
            )
          );
        } else {
          onUpdateList(
            updateList.map((update, i) =>
              i === index ? { ...update, value: ['', newValue as string] } : update
            )
          );
        }
      };

      return (
        <Container key={index} mt={4} w={'full'} mx={0}>
          <Flex alignItems={'center'}>
            <Flex w={'60px'}>{t('common:core.workflow.variable')}</Flex>
            <Reference
              nodeId={nodeId}
              variable={updateItem.variable}
              onSelect={(value) => {
                onUpdateList(
                  updateList.map((update, i) => {
                    if (i === index) {
                      return {
                        ...update,
                        value: ['', ''],
                        valueType,
                        variable: value
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
            <Flex w={'60px'}>
              <Box>{t('common:core.workflow.value')}</Box>
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
              </MyTooltip>
            </Flex>

            {/* Render input components */}
            {(() => {
              if (updateItem.renderType === FlowNodeInputTypeEnum.reference) {
                return (
                  <Reference
                    nodeId={nodeId}
                    variable={updateItem.value}
                    valueType={valueType}
                    onSelect={handleUpdate}
                  />
                );
              }
              if (valueType === WorkflowIOValueTypeEnum.string) {
                return (
                  <Box w={'300px'}>
                    <PromptEditor
                      value={updateItem.value?.[1] || ''}
                      onChange={handleUpdate}
                      showOpenModal={false}
                      variableLabels={variables}
                      minH={100}
                    />
                  </Box>
                );
              }
              if (valueType === WorkflowIOValueTypeEnum.number) {
                return (
                  <NumberInput value={Number(updateItem.value?.[1]) || 0}>
                    <NumberInputField bg="white" onChange={(e) => handleUpdate(e.target.value)} />
                    <NumberInputStepper>
                      <NumberIncrementStepper />
                      <NumberDecrementStepper />
                    </NumberInputStepper>
                  </NumberInput>
                );
              }
              if (valueType === WorkflowIOValueTypeEnum.boolean) {
                return (
                  <Switch
                    defaultChecked={updateItem.value?.[1] === 'true'}
                    onChange={(e) => handleUpdate(String(e.target.checked))}
                  />
                );
              }

              return (
                <Box w={'300px'}>
                  <PromptEditor
                    value={updateItem.value?.[1] || ''}
                    onChange={handleUpdate}
                    showOpenModal={false}
                    variableLabels={variables}
                    minH={100}
                  />
                </Box>
              );
            })()}
          </Flex>
        </Container>
      );
    }
  );

  return (
    <NodeCard selected={selected} maxW={'1000px'} {...data}>
      <Box px={4} pb={4}>
        <>
          {updateList.map((updateItem, index) => (
            <ValueRender key={index} updateItem={updateItem} index={index} />
          ))}
        </>
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
            {t('common:common.Add New')}
          </Button>
        </Flex>
      </Box>
    </NodeCard>
  );
};
export default React.memo(NodeVariableUpdate);

const Reference = ({
  nodeId,
  variable,
  valueType,
  onSelect
}: {
  nodeId: string;
  variable?: ReferenceValueProps;
  valueType?: WorkflowIOValueTypeEnum;
  onSelect: (e: ReferenceValueProps) => void;
}) => {
  const { t } = useTranslation();

  const { referenceList, formatValue } = useReference({
    nodeId,
    valueType,
    value: variable
  });

  return (
    <ReferSelector
      placeholder={t('common:select_reference_variable')}
      list={referenceList}
      value={formatValue}
      onSelect={onSelect}
    />
  );
};
