import React from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from '../render/NodeCard';
import { FlowModuleItemType } from '@fastgpt/global/core/module/type.d';
import Container from '../modules/Container';
import RenderInput from '../render/RenderInput';
import RenderOutput from '../render/RenderOutput';
import { useFlowProviderStore } from '../../FlowProvider';
import Divider from '../modules/Divider';
import RenderToolInput from '../render/RenderToolInput';
import { useTranslation } from 'next-i18next';

const NodeAnswer = ({ data, selected }: NodeProps<FlowModuleItemType>) => {
  const { t } = useTranslation();
  const { moduleId, inputs, outputs } = data;
  const { splitToolInputs } = useFlowProviderStore();
  const { toolInputs, commonInputs } = splitToolInputs(inputs, moduleId);

  return (
    <NodeCard minW={'400px'} selected={selected} {...data}>
      <Container borderTop={'2px solid'} borderTopColor={'myGray.200'}>
        {toolInputs.length > 0 && (
          <>
            <Divider text={t('core.module.tool.Tool input')} />
            <Container>
              <RenderToolInput moduleId={moduleId} inputs={toolInputs} />
            </Container>
          </>
        )}
        <RenderInput moduleId={moduleId} flowInputList={commonInputs} />
        <RenderOutput moduleId={moduleId} flowOutputList={outputs} />
      </Container>
    </NodeCard>
  );
};
export default React.memo(NodeAnswer);
