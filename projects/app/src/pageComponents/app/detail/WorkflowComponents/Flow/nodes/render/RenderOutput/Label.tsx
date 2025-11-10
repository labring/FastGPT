import { type FlowNodeOutputItemType } from '@fastgpt/global/core/workflow/type/io.d';
import React from 'react';
import { useTranslation } from 'next-i18next';
import { Box, Flex } from '@chakra-ui/react';
import { FlowNodeOutputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { MySourceHandle } from '../Handle';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';
import { Position } from 'reactflow';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import ValueTypeLabel from '../ValueTypeLabel';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useContextSelector } from 'use-context-selector';
import { WorkflowActionsContext } from '../../../../context/workflowActionsContext';

const OutputLabel = ({ nodeId, output }: { nodeId: string; output: FlowNodeOutputItemType }) => {
  const { t } = useTranslation();
  const { label = '', description, valueType, valueDesc } = output;

  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);

  return (
    <Box position={'relative'}>
      <Flex
        className="nodrag"
        cursor={'default'}
        alignItems={'center'}
        fontWeight={'medium'}
        color={'myGray.600'}
        {...(output.type === FlowNodeOutputTypeEnum.source
          ? {
              flexDirection: 'row-reverse'
            }
          : {})}
      >
        <Box
          position={'relative'}
          mr={1}
          ml={output.type === FlowNodeOutputTypeEnum.source ? 1 : 0}
        >
          {t(label as any)}
        </Box>
        {description && <QuestionTip ml={1} label={t(description as any)} />}
        <ValueTypeLabel valueType={valueType} valueDesc={valueDesc} />

        {output.deprecated && (
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
                    type: 'delOutput',
                    key: output.key
                  });
                }}
              >
                <MyIcon name={'common/info'} color={'adora.600'} w={4} mr={1} />
                <Box color={'adora.600'}>{t('app:Filed_is_deprecated')}</Box>
              </Flex>
            </MyTooltip>
          </>
        )}
      </Flex>
      {output.type === FlowNodeOutputTypeEnum.source && (
        <MySourceHandle
          nodeId={nodeId}
          handleId={getHandleId(nodeId, 'source', output.key)}
          translate={[34, 0]}
          position={Position.Right}
        />
      )}
    </Box>
  );
};

export default React.memo(OutputLabel);
