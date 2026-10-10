import React, { useContext, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { type NodeProps } from 'reactflow';
import NodeCard from '../render/NodeCard';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { WorkflowNodeData } from '@fastgpt/global/core/workflow/editor/types';
import Container from '../../components/Container';
import RenderInput from '../render/RenderInput';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useTranslation } from 'next-i18next';
import { type FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { useContextSelector } from 'use-context-selector';
import IOTitle from '../../components/IOTitle';
import RenderToolInput, { useHasDynamicToolInput } from '../render/RenderToolInput';
import RenderOutput from '../render/RenderOutput';
import CodeEditor from '@fastgpt/web/components/common/Textarea/CodeEditor';
import { Box, Button, Flex } from '@chakra-ui/react';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import {
  JS_TEMPLATE,
  PY_TEMPLATE,
  SandboxCodeTypeEnum,
  SANDBOX_CODE_TEMPLATE
} from '@fastgpt/global/core/workflow/template/system/sandbox/constants';
import MySelect from '@fastgpt/web/components/common/MySelect';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import CatchError from '../render/RenderOutput/CatchError';
import MyIcon from '@fastgpt/web/components/common/Icon';
import NodeCopilot from './Copilot';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { useWorkflowUIValue } from '../../canvas/canvasState';
import { WorkflowNodeOffscreenMeasurementContext } from '../render/Handle/handleRenderContext';
import { AppContext } from '@/pageComponents/app/detail/context';
import { useWorkflowEditorSessionId } from '@/web/core/workflow/editor/session/workflowSession';
import { getWorkflowEditorPath } from '@/web/core/workflow/editor/workflowEditorPath';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { splitNodeOutputs, splitToolInputsByMode } from '@/web/core/workflow/utils';
import { useIsToolNode } from '../render/useWorkflowDocument';
import { useFieldActions } from '@/web/core/workflow/editor/react/useField';
import { useNode, useNodeActions } from '@/web/core/workflow/editor/react/useNode';
import { getSandboxPackages } from '@/web/core/workflow/api';

const NodeCode = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const { nodeId } = data;
  const {
    inputs = [],
    outputs = [],
    catchError = false
  } = useNode<WorkflowNodeData>(nodeId, (current) => current?.data) ?? {};
  const nodeActions = useNodeActions(nodeId);
  const hasDynamicInput = useHasDynamicToolInput(nodeId);
  const { successOutputs, errorOutputs } = useMemoEnhance(
    () => splitNodeOutputs(outputs),
    [outputs]
  );

  const codeType = inputs.find(
    (item) => item.key === NodeInputKeyEnum.codeType
  ) as FlowNodeInputItemType;

  // CustomComponent 由 RenderInput 以普通函数调用，hooks 只能取在组件顶层。
  const codeField = useFieldActions({
    nodeId,
    fieldKey: NodeInputKeyEnum.code,
    kind: 'input'
  });
  const appId = useContextSelector(AppContext, (v) => v.appId);
  const editorSessionId = useWorkflowEditorSessionId();
  const presentationMode = useWorkflowUIValue((ctx) => ctx.presentationMode);
  const offscreenMeasurement = useContext(WorkflowNodeOffscreenMeasurementContext);

  const { ConfirmModal: SwitchLangConfirm, openConfirm: openSwitchLangConfirm } = useConfirm({
    content: t('workflow:code.Switch language confirm')
  });

  const { data: packages } = useQuery({
    queryKey: ['workflow', 'sandbox-packages'],
    queryFn: getSandboxPackages,
    staleTime: 5 * 60 * 1000,
    cacheTime: 5 * 60 * 1000
  });

  const packageText = useMemo(() => {
    const packagesList =
      codeType.value === SandboxCodeTypeEnum.js
        ? packages?.js.join(', ')
        : packages?.python.join(', ');
    return t('workflow:code_allow_packages_func', {
      modules: packagesList,
      globals: packages?.builtinGlobals.join(', ')
    });
  }, [packages, codeType.value, t]);

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
                  openSwitchLangConfirm({
                    onConfirm: () => {
                      // 语言与模板代码必须一起换：同一事务提交，撤销一次回到旧语言。
                      nodeActions?.updateNode((current) => ({
                        inputs: current.inputs.map((input) => {
                          if (input.key === NodeInputKeyEnum.codeType) {
                            return { ...input, value: newLang };
                          }
                          if (input.key === item.key) {
                            return { ...input, value: SANDBOX_CODE_TEMPLATE[newLang] };
                          }
                          return input;
                        })
                      }));
                    }
                  })();
                }}
              />

              {!!packages && (
                <MyTooltip label={packageText}>
                  <Box ml={2} fontSize={'sm'} color={'primary.500'}>
                    {t('workflow:code_allow_packages')}
                  </Box>
                </MyTooltip>
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
                  codeField.setValue(codeType.value === 'js' ? JS_TEMPLATE : PY_TEMPLATE)
                }
              />
            </Flex>
            {presentationMode || offscreenMeasurement ? (
              <Box h={'200px'} />
            ) : (
              <CodeEditor
                bg={'white'}
                borderRadius={'sm'}
                value={item.value}
                path={getWorkflowEditorPath({
                  appId,
                  sessionId: editorSessionId,
                  editorKind: 'code',
                  nodeId,
                  fieldKey: item.key
                })}
                onChange={(e) => {
                  codeField.setValue(e);
                }}
                language={codeType.value}
              />
            )}
          </Box>
        );
      }
    };
  }, [
    packageText,
    packages,
    codeType,
    t,
    presentationMode,
    nodeId,
    nodeActions,
    codeField,
    openSwitchLangConfirm,
    offscreenMeasurement,
    appId,
    editorSessionId
  ]);

  const isTool = useIsToolNode(nodeId);
  const { commonInputs } = useMemoEnhance(
    () => splitToolInputsByMode(inputs, isTool),
    [inputs, isTool]
  );

  const rtDoms = useMemo(() => {
    return [
      <NodeCopilot
        key="copilot"
        nodeId={nodeId}
        inputs={inputs}
        outputs={outputs}
        trigger={
          <Button
            variant={'grayGhost'}
            leftIcon={<MyIcon name={'codeCopilot'} w={'16px'} h={'16px'} mr={-1} />}
            size={'xs'}
            px={1}
          >
            {t('app:core.workflow.Copilot')}
          </Button>
        }
      />
    ];
  }, [t, nodeId, inputs, outputs]);

  return (
    <NodeCard minW={'400px'} selected={selected} rtDoms={rtDoms} {...data}>
      {isTool && hasDynamicInput && (
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
          isTool={isTool}
        />
      </Container>
      <Container>
        <IOTitle text={t('common:Output')} nodeId={nodeId} catchError={catchError} />
        <RenderOutput nodeId={nodeId} flowOutputList={successOutputs} />
      </Container>
      {catchError && <CatchError nodeId={nodeId} errorOutputs={errorOutputs} />}
      <SwitchLangConfirm />
    </NodeCard>
  );
};
export default React.memo(NodeCode);
