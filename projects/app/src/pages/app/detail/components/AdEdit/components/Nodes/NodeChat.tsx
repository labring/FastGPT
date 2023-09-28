import React, { useMemo } from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from '../modules/NodeCard';
import { FlowModuleItemType } from '@/types/core/app/flow';
import Divider from '../modules/Divider';
import Container from '../modules/Container';
import RenderInput from '../render/RenderInput';
import RenderOutput from '../render/RenderOutput';
import MySelect from '@/components/Select';
import { chatModelList } from '@/store/static';
import MySlider from '@/components/Slider';
import { Box, Button, useDisclosure } from '@chakra-ui/react';
import { formatPrice } from '@fastgpt/common/bill/index';
import MyIcon from '@/components/Icon';
import dynamic from 'next/dynamic';
import { AIChatProps } from '@/types/core/aiChat';
import { useFlowStore } from '../Provider';

const AIChatSettingsModal = dynamic(() => import('../../../AIChatSettingsModal'));

const NodeChat = ({ data }: NodeProps<FlowModuleItemType>) => {
  const { moduleId, inputs, outputs } = data;
  const { onChangeNode } = useFlowStore();

  const chatModulesData = useMemo(() => {
    const obj: Record<string, any> = {};
    inputs.forEach((item) => {
      obj[item.key] = item.value;
    });
    return obj as AIChatProps;
  }, [inputs]);

  const {
    isOpen: isOpenAIChatSetting,
    onOpen: onOpenAIChatSetting,
    onClose: onCloseAIChatSetting
  } = useDisclosure();

  return (
    <NodeCard minW={'400px'} {...data}>
      <Divider text="Input" />
      <Container>
        <RenderInput
          moduleId={moduleId}
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
            },
            quoteQA: (inputItem) => {
              return (
                <Button
                  variant={'base'}
                  leftIcon={<MyIcon name={'settingLight'} w={'14px'} />}
                  onClick={onOpenAIChatSetting}
                >
                  引用提示词设置
                </Button>
              );
            }
          }}
        />
      </Container>
      <Divider text="Output" />
      <Container>
        <RenderOutput moduleId={moduleId} flowOutputList={outputs} />
      </Container>

      {isOpenAIChatSetting && (
        <AIChatSettingsModal
          onClose={onCloseAIChatSetting}
          onSuccess={(e) => {
            for (let key in e) {
              const item = inputs.find((input) => input.key === key);
              if (!item) continue;
              onChangeNode({
                moduleId,
                type: 'inputs',
                key,
                value: {
                  ...item,
                  // @ts-ignore
                  value: e[key]
                }
              });
            }
            onCloseAIChatSetting();
          }}
          defaultData={chatModulesData}
        />
      )}
    </NodeCard>
  );
};
export default React.memo(NodeChat);
