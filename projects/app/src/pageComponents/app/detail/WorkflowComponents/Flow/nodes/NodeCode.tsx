import React, { useMemo } from 'react';
import { type NodeProps } from 'reactflow';
import NodeCard from './render/NodeCard';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node.d';
import Container from '../components/Container';
import RenderInput from './render/RenderInput';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useTranslation } from 'next-i18next';
import { type FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io.d';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../context';
import IOTitle from '../components/IOTitle';
import RenderToolInput from './render/RenderToolInput';
import RenderOutput from './render/RenderOutput';
import CodeEditor from '@fastgpt/web/components/common/Textarea/CodeEditor';
import { Box, Flex } from '@chakra-ui/react';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import {
  JS_TEMPLATE,
  PY_TEMPLATE,
  SandboxCodeTypeEnum,
  SANDBOX_CODE_TEMPLATE
} from '@fastgpt/global/core/workflow/template/system/sandbox/constants';
import MySelect from '@fastgpt/web/components/common/MySelect';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';

const NodeCode = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const { nodeId, inputs, outputs } = data;

  const codeType = inputs.find(
    (item) => item.key === NodeInputKeyEnum.codeType
  ) as FlowNodeInputItemType;

  const splitToolInputs = useContextSelector(WorkflowContext, (ctx) => ctx.splitToolInputs);
  const onChangeNode = useContextSelector(WorkflowContext, (ctx) => ctx.onChangeNode);

  // 切换语言确认
  const { ConfirmModal: SwitchLangConfirm, openConfirm: openSwitchLangConfirm } = useConfirm({
    content: t('workflow:code.Switch language confirm')
  });

  const CustomComponent = useMemo(() => {
    return {
      [NodeInputKeyEnum.code]: (item: FlowNodeInputItemType) => {
        return (
          <Box mt={-4}>
            <Flex mb={2} alignItems={'center'} className="nodrag">
              <MySelect<SandboxCodeTypeEnum>
                fontSize="xs"
                size="sm"
                list={[
                  { label: 'JavaScript', value: SandboxCodeTypeEnum.js },
                  { label: 'Python 3', value: SandboxCodeTypeEnum.py }
                ]}
                value={codeType?.value}
                onChange={(newLang) => {
                  console.log(newLang);
                  openSwitchLangConfirm(() => {
                    onChangeNode({
                      nodeId,
                      type: 'updateInput',
                      key: NodeInputKeyEnum.codeType,
                      value: { ...codeType, value: newLang }
                    });

                    onChangeNode({
                      nodeId,
                      type: 'updateInput',
                      key: item.key,
                      value: {
                        ...item,
                        value: SANDBOX_CODE_TEMPLATE[newLang]
                      }
                    });
                  })();
                }}
              />
              {codeType.value === 'py' && (
                <QuestionTip ml={2} label={t('workflow:support_code_language')} />
              )}
              <PopoverConfirm
                Trigger={
                  <Box cursor={'pointer'} color={'primary.500'} fontSize={'xs'} ml="auto" mr={2}>
                    {t('workflow:code.Reset template')}
                  </Box>
                }
                showCancel
                content={t('workflow:code.Reset template confirm')}
                placement={'top-end'}
                onConfirm={() =>
                  onChangeNode({
                    nodeId,
                    type: 'updateInput',
                    key: item.key,
                    value: {
                      ...item,
                      value: codeType.value === 'js' ? JS_TEMPLATE : PY_TEMPLATE
                    }
                  })
                }
              />
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
                  value: { ...item, value: e }
                });
              }}
              language={codeType.value}
            />
          </Box>
        );
      }
    };
  }, [codeType, nodeId, onChangeNode, openSwitchLangConfirm, t]);

  const { isTool, commonInputs } = splitToolInputs(inputs, nodeId);

  return (
    <NodeCard minW={'400px'} selected={selected} {...data}>
      {isTool && (
        <Container>
          <RenderToolInput nodeId={nodeId} inputs={inputs} />
        </Container>
      )}
      <Container>
        <IOTitle text={t('common:Input')} mb={-1} />
        <RenderInput
          nodeId={nodeId}
          flowInputList={commonInputs}
          CustomComponent={CustomComponent}
        />
      </Container>
      <Container>
        <IOTitle text={t('common:Output')} />
        <RenderOutput nodeId={nodeId} flowOutputList={outputs} />
      </Container>
      <SwitchLangConfirm />
    </NodeCard>
  );
};
export default React.memo(NodeCode);
