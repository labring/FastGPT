import React, { useMemo } from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from './modules/NodeCard';
import { FlowModuleItemType } from '@/types/flow';
import Divider from './modules/Divider';
import Container from './modules/Container';
import RenderInput from './render/RenderInput';
import RenderOutput from './render/RenderOutput';
import { FlowOutputItemTypeEnum } from '@/constants/flow';
import MySelect from '@/components/Select';
import { chatModelList } from '@/store/static';

const NodeChat = ({
  data: { moduleId, inputs, outputs, onChangeNode, ...props }
}: NodeProps<FlowModuleItemType>) => {
  const outputsLen = useMemo(
    () => outputs.filter((item) => item.type !== FlowOutputItemTypeEnum.hidden).length,
    [outputs]
  );

  return (
    <NodeCard minW={'400px'} moduleId={moduleId} {...props}>
      <Divider text="Input" />
      <Container>
        <RenderInput
          moduleId={moduleId}
          onChangeNode={onChangeNode}
          flowInputList={inputs}
          CustomComponent={{
            model: (inputItem) => (
              <MySelect
                width={'100%'}
                value={inputItem.value}
                list={inputItem.list || []}
                onchange={(e) => {
                  onChangeNode({
                    moduleId,
                    key: inputItem.key,
                    value: e
                  });
                  // update max tokens
                  const model = chatModelList.find((item) => item.model === e);
                  if (!model) return;

                  onChangeNode({
                    moduleId,
                    key: 'maxToken',
                    valueKey: 'markList',
                    value: [
                      { label: '0', value: 0 },
                      { label: `${model.contextMaxToken}`, value: model.contextMaxToken }
                    ]
                  });
                  onChangeNode({
                    moduleId,
                    key: 'maxToken',
                    valueKey: 'max',
                    value: model.contextMaxToken
                  });
                  onChangeNode({
                    moduleId,
                    key: 'maxToken',
                    valueKey: 'value',
                    value: model.contextMaxToken / 2
                  });
                }}
              />
            )
          }}
        />
      </Container>
      {outputsLen > 0 && (
        <>
          <Divider text="Output" />
          <Container>
            <RenderOutput flowOutputList={outputs} />
          </Container>
        </>
      )}
    </NodeCard>
  );
};
export default React.memo(NodeChat);
