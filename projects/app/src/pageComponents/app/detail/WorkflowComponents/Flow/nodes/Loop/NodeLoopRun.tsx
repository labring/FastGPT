import React, { useMemo } from 'react';
import type { CanvasNodeProps } from '@/web/core/workflow/editor/canvas/canvasTypes';
import NodeCard from '../render/NodeCard';
import Container from '../../components/Container';
import IOTitle from '../../components/IOTitle';
import { useTranslation } from 'next-i18next';
import RenderInput from '../render/RenderInput';
import { Box } from '@chakra-ui/react';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import RenderOutput from '../render/RenderOutput';
import CatchError from '../render/RenderOutput/CatchError';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { LoopRunModeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { useNestedNode } from '../../hooks/useNestedNode';
import { splitNodeOutputs } from '@/web/core/workflow/utils';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { useNode } from '@/web/core/workflow/editor/react/useNode';
import type { WorkflowNodeData } from '@fastgpt/global/core/workflow/editor/types';

const emptyInputs: WorkflowNodeData['inputs'] = [];
const emptyOutputs: WorkflowNodeData['outputs'] = [];

const NodeLoopRun = ({ data, selected }: CanvasNodeProps) => {
  const { t } = useTranslation();
  const { nodeId } = data;
  const node = useNode<WorkflowNodeData>(nodeId, { raw: true });
  const inputs = node?.data.inputs ?? emptyInputs;
  const outputs = node?.data.outputs ?? emptyOutputs;
  const catchError = node?.data.catchError ?? false;
  const isFolded = node?.view.isFolded ?? false;
  const mode =
    (inputs.find((i) => i.key === NodeInputKeyEnum.loopRunMode)?.value as
      | LoopRunModeEnum
      | undefined) ?? LoopRunModeEnum.array;

  const { nodeWidth, nodeHeight } = useNestedNode(nodeId);

  const inputAreaInputs = useMemo(
    () =>
      inputs.filter((i) => {
        if (i.key === NodeInputKeyEnum.loopCustomOutputs) return false;
        if (i.canEdit) return false;
        if (mode !== LoopRunModeEnum.array && i.key === NodeInputKeyEnum.loopRunInputArray) {
          return false;
        }
        return true;
      }),
    [inputs, mode]
  );

  const outputDeclarationInputs = useMemo(
    () => inputs.filter((i) => i.key === NodeInputKeyEnum.loopCustomOutputs || !!i.canEdit),
    [inputs]
  );

  const { successOutputs, errorOutputs } = useMemoEnhance(
    () => splitNodeOutputs(outputs),
    [outputs]
  );

  return (
    <NodeCard selected={selected} w="max-content" maxW="none" menuForbid={{ copy: true }} {...data}>
      <Container position={'relative'} flex={1}>
        <IOTitle text={t('common:Input')} />

        <Box mb={6} maxW={'500px'}>
          <RenderInput nodeId={nodeId} flowInputList={inputAreaInputs} />
        </Box>

        <>
          <FormLabel required fontWeight={'medium'} mb={3} color={'myGray.600'}>
            {t('workflow:loop_body')}
          </FormLabel>
          <Box
            flex={1}
            position={'relative'}
            data-workflow-container-content="true"
            border={'base'}
            bg={'myGray.100'}
            rounded={'8px'}
            {...(!isFolded && {
              minW: `${nodeWidth}px`,
              minH: nodeHeight,
              flexShrink: 0
            })}
          />
        </>
      </Container>
      <Container>
        <IOTitle text={t('common:Output')} nodeId={nodeId} catchError={catchError} />
        <Box maxW={'600px'}>
          <RenderInput nodeId={nodeId} flowInputList={outputDeclarationInputs} />
        </Box>
        <RenderOutput nodeId={nodeId} flowOutputList={successOutputs} />
      </Container>
      {catchError && <CatchError nodeId={nodeId} errorOutputs={errorOutputs} />}
    </NodeCard>
  );
};

export default React.memo(NodeLoopRun);
