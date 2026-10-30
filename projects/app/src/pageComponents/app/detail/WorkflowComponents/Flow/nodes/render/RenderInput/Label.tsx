import { type FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import React, { useCallback, useMemo } from 'react';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { Box, Flex } from '@chakra-ui/react';

import NodeInputSelect, {
  getSelectedRenderTypeState
} from '@fastgpt/web/components/core/workflow/NodeInputSelect';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  USER_SELECT_DEFAULT_OPTIONS,
  USER_SELECT_REFERENCE_HANDLE_KEY
} from '@fastgpt/global/core/workflow/template/system/interactive/userSelect';
import ValueTypeLabel from '../ValueTypeLabel';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { getToolInputDisplayRenderTypeList } from '@fastgpt/global/core/app/formEdit/utils';
import { getHandleId, getSelectedInputRenderType } from '@fastgpt/global/common/workflow/reference';
import {
  createEmptyTagFilterValue,
  isDatasetTagFilterOpen,
  isDatasetTagFilterValue
} from '@fastgpt/global/core/dataset/search/tagFilter';
import { datasetSearchUsesLegacyFilter } from '@/web/core/workflow/datasetSearchNodeUpgrade';
import type { WorkflowCommand, WorkflowNodeData } from '@fastgpt/global/core/workflow/editor/types';
import { useNode, useNodeActions } from '@/web/core/workflow/editor/react/useNode';
import { useWorkflowRuntime } from '@/web/core/workflow/editor/session/workflowSession';
import { cloneValue } from '@fastgpt/global/common/workflow/editor/runtime/kernel';

type Props = {
  nodeId: string;
  input: FlowNodeInputItemType;
  RightComponent?: React.JSX.Element;
  isTool?: boolean;
};

const InputLabel = ({ nodeId, input, RightComponent, isTool }: Props) => {
  const { t } = useSafeTranslation();
  const runtime = useWorkflowRuntime();
  const node = useNode<WorkflowNodeData>(nodeId, (handle) => handle?.data);
  const nodeActions = useNodeActions(nodeId);

  const labelText = t(input.label as any);
  const descriptionText = input.description ? t(input.description as any) : undefined;

  const { required, renderTypeList, valueType, valueDesc } = input;
  const isUserSelectOptions =
    node?.flowNodeType === FlowNodeTypeEnum.userSelect &&
    input.key === NodeInputKeyEnum.userSelectOptions;
  const isCollectionFilter = input.key === NodeInputKeyEnum.collectionFilterMatch;
  const isLegacyTagFilter = isCollectionFilter && datasetSearchUsesLegacyFilter(node?.inputs ?? []);
  const isTagFilterClosed =
    isCollectionFilter && !isLegacyTagFilter && !isDatasetTagFilterOpen(input.value);
  const renderType =
    getSelectedInputRenderType(input) ?? renderTypeList?.[0] ?? FlowNodeInputTypeEnum.input;
  const displayRenderTypeList = useMemo(
    () =>
      getToolInputDisplayRenderTypeList({
        input,
        showAgentGenerated: !!isTool
      }),
    [input, isTool]
  );
  const onChangeRenderType = useCallback(
    (e: string) => {
      const nextRenderType = e as FlowNodeInputTypeEnum;

      const nextValue = (() => {
        if (isUserSelectOptions) {
          return nextRenderType === FlowNodeInputTypeEnum.reference
            ? []
            : USER_SELECT_DEFAULT_OPTIONS.map((item) => ({ ...item }));
        }
        if (isCollectionFilter && !isLegacyTagFilter) {
          return nextRenderType === FlowNodeInputTypeEnum.reference
            ? []
            : {
                ...(isDatasetTagFilterValue(input.value)
                  ? input.value
                  : createEmptyTagFilterValue()),
                open: true
              };
        }
        return undefined;
      })();

      const nextInput = {
        ...input,
        ...getSelectedRenderTypeState({
          renderTypeList: [...displayRenderTypeList],
          selectedType: nextRenderType
        }),
        value: nextValue
      };

      // 切换渲染类型整条替换输入记录（含清空 value），属于记录级变更。
      const updateNodeInput = () =>
        nodeActions?.updateNode((current) => ({
          inputs: current.inputs.map((item) => (item.key === input.key ? nextInput : item))
        }));

      if (!isUserSelectOptions || !runtime) {
        updateNodeInput();
        return;
      }

      const currentNode = runtime.getNode(nodeId);
      if (!currentNode) return;

      const edges = runtime.getWorkflow().edges;
      const optionHandleIds =
        nextRenderType === FlowNodeInputTypeEnum.reference && Array.isArray(input.value)
          ? input.value.map((item: { key: string }) => getHandleId(nodeId, 'source', item.key))
          : [];
      // 手动切引用时按选项顺序保留首条已连线分支，并把边迁移和节点更新放进同一事务。
      const edgeToKeep =
        optionHandleIds
          .map((handleId) =>
            edges.find((edge) => edge.source === nodeId && edge.sourceHandle === handleId)
          )
          .find((edge) => edge !== undefined) ?? edges.find((edge) => edge.source === nodeId);
      if (!edgeToKeep) {
        updateNodeInput();
        return;
      }

      const nextFirstHandleId =
        nextRenderType === FlowNodeInputTypeEnum.reference
          ? getHandleId(nodeId, 'source', USER_SELECT_REFERENCE_HANDLE_KEY)
          : getHandleId(nodeId, 'source', USER_SELECT_DEFAULT_OPTIONS[0].key);
      const commands: WorkflowCommand[] = edges
        .flatMap((edge, index) =>
          edge.source === nodeId && (edge !== edgeToKeep || edge.sourceHandle !== nextFirstHandleId)
            ? [index]
            : []
        )
        .sort((a, b) => b - a)
        .map((index) => ({ type: 'disconnectEdge', index }));

      commands.push({
        type: 'updateNode',
        nodeId,
        patch: {
          inputs: cloneValue(
            currentNode.inputs.map((item) => (item.key === input.key ? nextInput : item))
          ) as FlowNodeInputItemType[]
        }
      });
      if (edgeToKeep.sourceHandle !== nextFirstHandleId) {
        commands.push({
          type: 'connectEdge',
          edge: { ...edgeToKeep, sourceHandle: nextFirstHandleId }
        });
      }
      runtime.dispatch(commands);
    },
    [
      displayRenderTypeList,
      input,
      isCollectionFilter,
      isLegacyTagFilter,
      isUserSelectOptions,
      nodeId,
      nodeActions,
      runtime
    ]
  );

  return (
    <Box display={'flex'} alignItems={'center'} position={'relative'}>
      <Flex className="nodrag" alignItems={'center'} position={'relative'} fontWeight={'medium'}>
        <FormLabel required={required} color={'myGray.600'}>
          {labelText}
        </FormLabel>
        {descriptionText && <QuestionTip ml={1} label={descriptionText}></QuestionTip>}
      </Flex>
      {/* value type */}
      {!isTagFilterClosed &&
        !isUserSelectOptions &&
        [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.fileSelect].includes(
          renderType
        ) && <ValueTypeLabel className="nodrag" valueType={valueType} valueDesc={valueDesc} />}

      {/* input type select */}
      {!isTagFilterClosed && displayRenderTypeList && displayRenderTypeList.length > 1 && (
        <Box ml={2} className="nodrag">
          <NodeInputSelect
            renderTypeList={displayRenderTypeList}
            selectedType={renderType}
            onChange={onChangeRenderType}
            isAgentGeneratedMode={displayRenderTypeList.includes(
              FlowNodeInputTypeEnum.agentGenerated
            )}
          />
        </Box>
      )}

      {input.deprecated && (
        <>
          <Box flex={'1'} />
          <MyTooltip label={t('app:Click_to_delete_this_field')}>
            <Flex
              className="nodrag"
              px={1.5}
              py={1}
              bg={'adora.50'}
              rounded={'6px'}
              fontSize={'14px'}
              cursor="pointer"
              alignItems={'center'}
              _hover={{
                bg: 'adora.100'
              }}
              onClick={() => {
                nodeActions?.updateNode((current) => ({
                  inputs: current.inputs.filter((item) => item.key !== input.key)
                }));
              }}
            >
              <MyIcon name={'common/info'} color={'adora.600'} w={4} mr={1} />
              <Box color={'adora.600'}>{t('app:Filed_is_deprecated')}</Box>
            </Flex>
          </MyTooltip>
        </>
      )}

      {/* Right Component */}
      {!input.deprecated && RightComponent && (
        <>
          <Box flex={'1'} />
          {RightComponent}
        </>
      )}
    </Box>
  );
};

export default React.memo(InputLabel);
