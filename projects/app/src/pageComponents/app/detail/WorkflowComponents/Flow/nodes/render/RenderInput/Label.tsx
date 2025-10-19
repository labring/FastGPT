import { type FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io.d';
import React, { useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import { Box, Flex } from '@chakra-ui/react';

import NodeInputSelect from '@fastgpt/web/components/core/workflow/NodeInputSelect';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import ValueTypeLabel from '../ValueTypeLabel';
import { useContextSelector } from 'use-context-selector';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { WorkflowActionsContext } from '../../../../context/workflowActionsContext';

type Props = {
  nodeId: string;
  input: FlowNodeInputItemType;
  RightComponent?: React.JSX.Element;
};

const InputLabel = ({ nodeId, input, RightComponent }: Props) => {
  const { t } = useTranslation();

  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);

  const { description, required, label, selectedTypeIndex, renderTypeList, valueType, valueDesc } =
    input;

  const onChangeRenderType = useCallback(
    (e: string) => {
      const index = renderTypeList.findIndex((item) => item === e) || 0;

      onChangeNode({
        nodeId,
        type: 'updateInput',
        key: input.key,
        value: {
          ...input,
          selectedTypeIndex: index,
          value: undefined
        }
      });
    },
    [input, nodeId, onChangeNode, renderTypeList]
  );
  const renderType = renderTypeList?.[selectedTypeIndex || 0];

  return (
    <Flex className="nodrag" cursor={'default'} alignItems={'center'} position={'relative'}>
      <Flex alignItems={'center'} position={'relative'} fontWeight={'medium'}>
        <FormLabel required={required} color={'myGray.600'}>
          {t(label as any)}
        </FormLabel>
        {description && <QuestionTip ml={1} label={t(description as any)}></QuestionTip>}
      </Flex>
      {/* value type */}
      {[FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.fileSelect].includes(renderType) && (
        <ValueTypeLabel valueType={valueType} valueDesc={valueDesc} />
      )}

      {/* input type select */}
      {renderTypeList && renderTypeList.length > 1 && (
        <Box ml={2}>
          <NodeInputSelect
            renderTypeList={renderTypeList}
            renderTypeIndex={selectedTypeIndex}
            onChange={onChangeRenderType}
          />
        </Box>
      )}

      {input.deprecated && (
        <>
          <Box flex={'1'} />
          <MyTooltip label={t('app:Click_to_delete_this_field')}>
            <Flex
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
          <Box flex={'1'} />
          {RightComponent}
        </>
      )}
    </Flex>
  );
};

export default React.memo(InputLabel);
