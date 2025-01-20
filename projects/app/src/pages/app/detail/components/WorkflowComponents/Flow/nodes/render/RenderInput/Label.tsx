import { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io.d';
import React, { useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import { Box, Flex } from '@chakra-ui/react';

import NodeInputSelect from '@fastgpt/web/components/core/workflow/NodeInputSelect';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import ValueTypeLabel from '../ValueTypeLabel';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '@/pages/app/detail/components/WorkflowComponents/context';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';

type Props = {
  nodeId: string;
  input: FlowNodeInputItemType;
  RightComponent?: React.JSX.Element;
};

const InputLabel = ({ nodeId, input, RightComponent }: Props) => {
  const { t } = useTranslation();

  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

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

      {/* Right Component */}
      {RightComponent && (
        <>
          <Box flex={'1'} />
          {RightComponent}
        </>
      )}
    </Flex>
  );
};

export default React.memo(InputLabel);
