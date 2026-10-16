import { type FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import React, { useCallback, useMemo } from 'react';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { Box, Flex } from '@chakra-ui/react';

import NodeInputSelect, {
  getSelectedRenderTypeState
} from '@fastgpt/web/components/core/workflow/NodeInputSelect';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  USER_SELECT_DEFAULT_OPTIONS,
  USER_SELECT_REFERENCE_HANDLE_KEY
} from '@fastgpt/global/core/workflow/template/system/interactive/userSelect';
import ValueTypeLabel from '../ValueTypeLabel';
import { useContextSelector } from 'use-context-selector';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { WorkflowActionsContext } from '../../../../context/workflowActionsContext';
import { WorkflowBufferDataContext } from '../../../../context/workflowInitContext';
import { getToolInputDisplayRenderTypeList } from '@fastgpt/global/core/app/formEdit/utils';
import { getHandleId, getSelectedInputRenderType } from '@fastgpt/global/common/workflow/reference';

type Props = {
  nodeId: string;
  input: FlowNodeInputItemType;
  RightComponent?: React.JSX.Element;
  rightInline?: boolean;
  isTool?: boolean;
};

const InputLabel = ({ nodeId, input, RightComponent, rightInline, isTool }: Props) => {
  const { t } = useSafeTranslation();

  const labelText = t(input.label as any);
  const descriptionText = input.description ? t(input.description as any) : undefined;

  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  const setEdges = useContextSelector(WorkflowBufferDataContext, (v) => v.setEdges);

  const { required, renderTypeList, valueType, valueDesc } = input;
  const isUserSelectOptions = input.key === NodeInputKeyEnum.userSelectOptions;
  const renderType =
    getSelectedInputRenderType(input) ?? renderTypeList?.[0] ?? FlowNodeInputTypeEnum.input;
  const shouldRenderRightInline =
    rightInline ?? renderType === FlowNodeInputTypeEnum.datasetTagFilter;
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
      const nextValue = isUserSelectOptions
        ? nextRenderType === FlowNodeInputTypeEnum.reference
          ? []
          : USER_SELECT_DEFAULT_OPTIONS.map((item) => ({ ...item }))
        : undefined;

      const nextInput = {
        ...input,
        ...getSelectedRenderTypeState({
          renderTypeList: displayRenderTypeList,
          selectedType: nextRenderType
        }),
        value: nextValue
      };

      onChangeNode({
        nodeId,
        type: 'updateInput',
        key: input.key,
        value: nextInput
      });

      if (isUserSelectOptions) {
        const nextFirstHandleId =
          nextRenderType === FlowNodeInputTypeEnum.reference
            ? getHandleId(nodeId, 'source', USER_SELECT_REFERENCE_HANDLE_KEY)
            : getHandleId(nodeId, 'source', USER_SELECT_DEFAULT_OPTIONS[0].key);

        setEdges((prevEdges) => {
          const firstConnectedHandle = prevEdges.find(
            (edge) => edge.source === nodeId
          )?.sourceHandle;
          if (!firstConnectedHandle) return prevEdges;

          return prevEdges.flatMap((edge) => {
            if (edge.source !== nodeId) return [edge];
            if (edge.sourceHandle !== firstConnectedHandle) return [];
            return [
              {
                ...edge,
                sourceHandle: nextFirstHandleId
              }
            ];
          });
        });
      }
    },
    [displayRenderTypeList, input, isUserSelectOptions, nodeId, onChangeNode, setEdges]
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
      {!isUserSelectOptions &&
        [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.fileSelect].includes(
          renderType
        ) && <ValueTypeLabel className="nodrag" valueType={valueType} valueDesc={valueDesc} />}

      {/* input type select */}
      {displayRenderTypeList && displayRenderTypeList.length > 1 && (
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
                onChangeNode({
                  nodeId,
                  type: 'delInput',
                  key: input.key
                });
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
          {!shouldRenderRightInline && <Box flex={'1'} />}
          {shouldRenderRightInline ? <Box ml={2}>{RightComponent}</Box> : RightComponent}
        </>
      )}
    </Box>
  );
};

export default React.memo(InputLabel);
