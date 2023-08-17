import React, { useMemo } from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from '../modules/NodeCard';
import { FlowModuleItemType } from '@/types/flow';
import Divider from '../modules/Divider';
import Container from '../modules/Container';
import RenderInput from '../render/RenderInput';
import RenderOutput from '../render/RenderOutput';
import { FlowOutputItemTypeEnum } from '@/constants/flow';
import MySelect from '@/components/Select';
import { chatModelList } from '@/store/static';
import MySlider from '@/components/Slider';
import { Box } from '@chakra-ui/react';
import { formatPrice } from '@/utils/user';

const NodeChat = ({ data }: NodeProps<FlowModuleItemType>) => {
  const { moduleId, inputs, outputs, onChangeNode } = data;
  const outputsLen = useMemo(
    () => outputs.filter((item) => item.type !== FlowOutputItemTypeEnum.hidden).length,
    [outputs]
  );

  return (
    <NodeCard minW={'400px'} {...data}>
      <Divider text="Input" />
      <Container>
        <RenderInput
          moduleId={moduleId}
          onChangeNode={onChangeNode}
          flowInputList={inputs}
          CustomComponent={{
            model: (inputItem) => {
              const list = chatModelList.map((item) => {
                const priceStr = `(${formatPrice(item.price, 1000)}元/1k Tokens)`;

                return {
                  value: item.model,
                  label: `${item.name}${priceStr}`
                };
              });

              return (
                <MySelect
                  width={'100%'}
                  value={inputItem.value}
                  list={list}
                  onchange={(e) => {
                    onChangeNode({
                      moduleId,
                      type: 'inputs',
                      key: inputItem.key,
                      value: {
                        ...inputItem,
                        value: e
                      }
                    });

                    // update max tokens
                    const model =
                      chatModelList.find((item) => item.model === e) || chatModelList[0];
                    if (!model) return;

                    onChangeNode({
                      moduleId,
                      type: 'inputs',
                      key: 'maxToken',
                      value: {
                        ...inputs.find((input) => input.key === 'maxToken'),
                        markList: [
                          { label: '100', value: 100 },
                          { label: `${model.contextMaxToken}`, value: model.contextMaxToken }
                        ],
                        max: model.contextMaxToken,
                        value: model.contextMaxToken / 2
                      }
                    });
                  }}
                />
              );
            },
            maxToken: (inputItem) => {
              const model = inputs.find((item) => item.key === 'model')?.value;
              const modelData = chatModelList.find((item) => item.model === model);
              const maxToken = modelData ? modelData.contextMaxToken : 4000;
              const markList = [
                { label: '100', value: 100 },
                { label: `${maxToken}`, value: maxToken }
              ];
              return (
                <Box pt={5} pb={4} px={2}>
                  <MySlider
                    markList={markList}
                    width={'100%'}
                    min={inputItem.min || 100}
                    max={maxToken}
                    step={inputItem.step || 1}
                    value={inputItem.value}
                    onChange={(e) => {
                      onChangeNode({
                        moduleId,
                        type: 'inputs',
                        key: inputItem.key,
                        value: {
                          ...inputItem,
                          value: e
                        }
                      });
                    }}
                  />
                </Box>
              );
            }
          }}
        />
      </Container>
      {outputsLen > 0 && (
        <>
          <Divider text="Output" />
          <Container>
            <RenderOutput
              onChangeNode={onChangeNode}
              moduleId={moduleId}
              flowOutputList={outputs}
            />
          </Container>
        </>
      )}
    </NodeCard>
  );
};
export default React.memo(NodeChat);
