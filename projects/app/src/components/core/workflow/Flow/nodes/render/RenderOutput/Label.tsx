import { FlowNodeOutputItemType } from '@fastgpt/global/core/workflow/type/io.d';
import React, { useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import { Box, Flex } from '@chakra-ui/react';
import { FlowNodeOutputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { SourceHandle } from '../Handle';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';
import { Position } from 'reactflow';
import { FlowValueTypeMap } from '@/web/core/workflow/constants/dataType';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';

const OutputLabel = ({ nodeId, output }: { nodeId: string; output: FlowNodeOutputItemType }) => {
  const { t } = useTranslation();
  const { label = '', description, valueType } = output;

  const valueTypeLabel = useMemo(
    () => (valueType ? t(FlowValueTypeMap[valueType]?.label) : '-'),
    [t, valueType]
  );

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
          <Box position={'relative'} mr={1}>
            {t(label)}
          </Box>
          {description && <QuestionTip label={t(description)} />}
          <Box
            flexShrink={0}
            bg={'myGray.100'}
            color={'myGray.500'}
            border={'base'}
            borderRadius={'sm'}
            mx={2}
            px={1}
            py={0.5}
            fontSize={'11px'}
          >
            {valueTypeLabel}
          </Box>
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
  }, [description, output.key, output.type, label, nodeId, t, valueTypeLabel]);

  return Render;
};

export default React.memo(OutputLabel);
