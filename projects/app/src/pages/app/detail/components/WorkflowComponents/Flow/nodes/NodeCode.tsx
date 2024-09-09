import React, { useMemo } from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from './render/NodeCard';
import { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node.d';
import Container from '../components/Container';
import RenderInput from './render/RenderInput';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useTranslation } from 'next-i18next';
import { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io.d';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../context';
import IOTitle from '../components/IOTitle';
import RenderToolInput from './render/RenderToolInput';
import RenderOutput from './render/RenderOutput';
import CodeEditor from '@fastgpt/web/components/common/Textarea/CodeEditor';
import { Box, Flex } from '@chakra-ui/react';
import { useI18n } from '@/web/context/I18n';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { getLatestNodeTemplate } from '@/web/core/workflow/utils';
import { CodeNode } from '@fastgpt/global/core/workflow/template/system/sandbox';

const NodeCode = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const { workflowT } = useI18n();
  const { nodeId, inputs, outputs } = data;
  const splitToolInputs = useContextSelector(WorkflowContext, (ctx) => ctx.splitToolInputs);
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);
  const onResetNode = useContextSelector(WorkflowContext, (v) => v.onResetNode);

  const { isTool, commonInputs } = splitToolInputs(inputs, nodeId);
  const { ConfirmModal, openConfirm } = useConfirm({
    content: workflowT('code.Reset template confirm')
  });

  const CustomComponent = useMemo(() => {
    return {
      [NodeInputKeyEnum.code]: (item: FlowNodeInputItemType) => {
        return (
          <Box>
            <Flex mb={1} alignItems={'flex-end'}>
              <Box flex={'1'}>{'Javascript ' + workflowT('Code')}</Box>
              <Box
                cursor={'pointer'}
                color={'primary.500'}
                fontSize={'xs'}
                onClick={openConfirm(() => {
                  onResetNode({
                    id: nodeId,
                    node: getLatestNodeTemplate(data, CodeNode)
                  });
                })}
              >
                {workflowT('code.Reset template')}
              </Box>
            </Flex>
            <CodeEditor
              bg={'white'}
              borderRadius={'sm'}
              value={item.value}
              onChange={(e) => {
                onChangeNode({
                  nodeId,
                  type: 'updateInput',
                  key: item.key,
                  value: {
                    ...item,
                    value: e
                  }
                });
              }}
            />
          </Box>
        );
      }
    };
  }, [nodeId, onChangeNode, openConfirm, workflowT]);

  return (
    <NodeCard minW={'400px'} selected={selected} {...data}>
      {isTool && (
        <>
          <Container>
            <RenderToolInput nodeId={nodeId} inputs={inputs} />
          </Container>
        </>
      )}
      <Container>
        <IOTitle text={t('common:common.Input')} />
        <RenderInput
          nodeId={nodeId}
          flowInputList={commonInputs}
          CustomComponent={CustomComponent}
        />
      </Container>
      <Container>
        <IOTitle text={t('common:common.Output')} />
        <RenderOutput nodeId={nodeId} flowOutputList={outputs} />
      </Container>
      <ConfirmModal />
    </NodeCard>
  );
};
export default React.memo(NodeCode);
