import { FlowNodeOutputItemType } from '@fastgpt/global/core/workflow/type/io.d';
import React, { useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import { Box, Flex } from '@chakra-ui/react';
import { FlowNodeOutputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { SourceHandle } from '../Handle';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';
import { Position } from 'reactflow';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import ValueTypeLabel from '../ValueTypeLabel';

const OutputLabel = ({ nodeId, output }: { nodeId: string; output: FlowNodeOutputItemType }) => {
  const { t } = useTranslation();
  const { label = '', description, valueType } = output;

  const Render = useMemo(() => {
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
            {t(label)}
          </Box>
          {description && <QuestionTip label={t(description)} />}
          <ValueTypeLabel valueType={valueType} />
        </Flex>
        {output.type === FlowNodeOutputTypeEnum.source && (
          <SourceHandle
            nodeId={nodeId}
            handleId={getHandleId(nodeId, 'source', output.key)}
            translate={[26, 0]}
            position={Position.Right}
          />
        )}
      </Box>
    );
  }, [output.type, output.key, t, label, description, valueType, nodeId]);

  return Render;
};

export default React.memo(OutputLabel);
