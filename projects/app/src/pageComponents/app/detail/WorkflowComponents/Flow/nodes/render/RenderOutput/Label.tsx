import { type FlowNodeOutputItemType } from '@fastgpt/global/core/workflow/type/io';
import React from 'react';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { Box, Flex } from '@chakra-ui/react';
import { FlowNodeOutputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { MySourceHandle } from '../Handle';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';
import { Position } from 'reactflow';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import ValueTypeLabel from '../ValueTypeLabel';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useNode } from '@/web/core/workflow/editor/react/useNode';
import { useWorkflowActions } from '@/web/core/workflow/editor/react/useWorkflow';
import { getOutputDisconnectCommands } from '@/web/core/workflow/utils';

/** 输出源柄的平移量：模块级常量，避免每次渲染换数组身份打穿 MySourceHandle 的 React.memo。 */
const sourceTranslate = [34, 0] as [number, number];

const OutputLabel = ({ nodeId, output }: { nodeId: string; output: FlowNodeOutputItemType }) => {
  const { t } = useSafeTranslation();
  const { label = '', description, valueType, valueDesc } = output;

  const node = useNode(nodeId);
  // 边集合只在删除废弃输出字段的回调里读，走非订阅 getter：点击时取当前值，组件不订阅结构变更。
  const { getEdges } = useWorkflowActions();

  return (
    <Box position={'relative'}>
      <Flex
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
          className="nodrag"
          position={'relative'}
          mr={1}
          ml={output.type === FlowNodeOutputTypeEnum.source ? 1 : 0}
        >
          {t(label as any)}
        </Box>
        {description && <QuestionTip className="nodrag" ml={1} label={t(description as any)} />}
        <ValueTypeLabel className="nodrag" valueType={valueType} valueDesc={valueDesc} />

        {output.deprecated && (
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
                  // 输出字段删除是记录级变更；其 source handle 上的连线必须同事务断开。
                  node?.updateNode(
                    (current) => ({
                      outputs: current.outputs.filter((item) => item.key !== output.key)
                    }),
                    {
                      disconnectEdges: getOutputDisconnectCommands({
                        edges: getEdges(),
                        nodeId,
                        outputKey: output.key
                      })
                    }
                  );
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
          translate={sourceTranslate}
          position={Position.Right}
        />
      )}
    </Box>
  );
};

export default React.memo(OutputLabel);
