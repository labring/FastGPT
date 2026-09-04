import { type FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import React, { useCallback, useMemo } from 'react';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { Box, Flex } from '@chakra-ui/react';

import NodeInputSelect, {
  getSelectedRenderTypeState
} from '@fastgpt/web/components/core/workflow/NodeInputSelect';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import ValueTypeLabel from '../ValueTypeLabel';
import { useContextSelector } from 'use-context-selector';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { WorkflowActionsContext } from '../../../../context/workflowActionsContext';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { getToolInputDisplayRenderTypeList } from '@fastgpt/global/core/app/formEdit/utils';
import { getSelectedInputRenderType } from '@fastgpt/global/core/workflow/utils';

type Props = {
  nodeId: string;
  input: FlowNodeInputItemType;
  RightComponent?: React.JSX.Element;
  isTool?: boolean;
};

const InputLabel = ({ nodeId, input, RightComponent, isTool }: Props) => {
  const { t } = useSafeTranslation();

  const isDeprecatedTagFilter =
    input.key === NodeInputKeyEnum.collectionFilterMatch && typeof input.value === 'string';

  const labelText = isDeprecatedTagFilter
    ? t('workflow:collection_metadata_filter')
    : t(input.label as any);
  const descriptionText = isDeprecatedTagFilter
    ? t('workflow:filter_description')
    : input.description
      ? t(input.description as any)
      : undefined;

  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);

  const { required, renderTypeList, valueType, valueDesc } = input;
  const renderType =
    getSelectedInputRenderType(input) ?? renderTypeList?.[0] ?? FlowNodeInputTypeEnum.input;
  const rightInline =
    renderType === FlowNodeInputTypeEnum.datasetTagFilter && !isDeprecatedTagFilter;
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
      const nextInput = {
        ...input,
        ...getSelectedRenderTypeState({
          renderTypeList: displayRenderTypeList,
          selectedType: e as FlowNodeInputTypeEnum
        }),
        value: undefined
      };

      onChangeNode({
        nodeId,
        type: 'updateInput',
        key: input.key,
        value: nextInput
      });
    },
    [displayRenderTypeList, input, nodeId, onChangeNode]
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
      {[FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.fileSelect].includes(renderType) && (
        <ValueTypeLabel className="nodrag" valueType={valueType} valueDesc={valueDesc} />
      )}

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
          {!rightInline && <Box flex={'1'} />}
          {rightInline ? <Box ml={2}>{RightComponent}</Box> : RightComponent}
        </>
      )}
    </Box>
  );
};

export default React.memo(InputLabel);
