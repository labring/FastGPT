import React from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from '../modules/NodeCard';
import { FlowModuleItemType } from '@fastgpt/global/core/module/type.d';
import Divider from '../modules/Divider';
import Container from '../modules/Container';
import RenderInput from '../render/RenderInput';
import { Button } from '@chakra-ui/react';
import { SmallAddIcon } from '@chakra-ui/icons';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { ModuleDataTypeEnum, ModuleInputKeyEnum } from '@fastgpt/global/core/module/constants';
import { customAlphabet } from 'nanoid';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 6);
import { onChangeNode } from '../../FlowProvider';
import RenderOutput from '../render/RenderOutput';
import { useTranslation } from 'next-i18next';
import PromptTextarea from '@/components/common/Textarea/PromptTextarea';

const NodeTextEditor = ({ data }: NodeProps<FlowModuleItemType>) => {
  const { t } = useTranslation();
  const { moduleId, inputs, outputs } = data;

  return (
    <NodeCard minW={'350px'} {...data}>
      <Container borderTop={'2px solid'} borderTopColor={'myGray.200'}>
        <RenderInput
          moduleId={moduleId}
          flowInputList={inputs}
          CustomComponent={{
            [ModuleInputKeyEnum.textareaInput](item) {
              return (
                <PromptTextarea
                  title={t('core.module.textEditor.Text Edit')}
                  rows={5}
                  bg={'myWhite.400'}
                  placeholder={t(item.placeholder || '')}
                  resize={'both'}
                  defaultValue={item.value}
                  onBlur={(e) => {
                    onChangeNode({
                      moduleId,
                      type: 'updateInput',
                      key: item.key,
                      value: {
                        ...item,
                        value: e.target.value
                      }
                    });
                  }}
                />
              );
            }
          }}
        />
        <Button
          variant={'base'}
          mt={5}
          leftIcon={<SmallAddIcon />}
          onClick={() => {
            const key = nanoid();
            onChangeNode({
              moduleId,
              type: 'addInput',
              key,
              value: {
                key,
                valueType: ModuleDataTypeEnum.string,
                type: FlowNodeInputTypeEnum.target,
                label: `入参${inputs.length - 1}`,
                edit: true
              }
            });
          }}
        >
          {t('core.module.input.Add Input')}
        </Button>
      </Container>
      <Divider text="Output" />
      <Container>
        <RenderOutput moduleId={moduleId} flowOutputList={outputs} />
      </Container>
    </NodeCard>
  );
};
export default React.memo(NodeTextEditor);
