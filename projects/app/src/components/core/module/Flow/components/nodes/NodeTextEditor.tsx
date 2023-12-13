import React from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from '../render/NodeCard';
import { FlowModuleItemType } from '@fastgpt/global/core/module/type.d';
import Divider from '../modules/Divider';
import Container from '../modules/Container';
import RenderInput from '../render/RenderInput';
import { ModuleInputKeyEnum } from '@fastgpt/global/core/module/constants';
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
      </Container>
      <Divider text="Output" />
      <Container>
        <RenderOutput moduleId={moduleId} flowOutputList={outputs} />
      </Container>
    </NodeCard>
  );
};
export default React.memo(NodeTextEditor);
