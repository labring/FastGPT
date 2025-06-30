import React, { useCallback, useMemo, useState } from 'react';
import type { NodeProps } from 'reactflow';
import NodeCard from './render/NodeCard';
import Container from '../components/Container';
import RenderOutput from './render/RenderOutput';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../context';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import RenderToolInput from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/RenderToolInput';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import MySelect from '@fastgpt/web/components/common/MySelect';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { Box, Button, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { GET } from '@/web/common/api/request';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import RenderInput from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/RenderInput';
import PromptEditor from '@fastgpt/web/components/common/Textarea/PromptEditor';
import { useCreation, useMemoizedFn } from 'ahooks';
import { getEditorVariables } from '@/pageComponents/app/detail/WorkflowComponents/utils';
import { AppContext } from '@/pageComponents/app/detail/context';
import { WorkflowNodeEdgeContext } from '@/pageComponents/app/detail/WorkflowComponents/context/workflowInitContext';
import { useSystemStore } from '@/web/common/system/useSystemStore';

const NodeMcpCall: React.FC<NodeProps<FlowNodeItemType>> = ({ data }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { inputs, outputs, nodeId } = data;
  const { feConfigs } = useSystemStore();
  const splitToolInputs = useContextSelector(WorkflowContext, (ctx) => ctx.splitToolInputs);
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const edges = useContextSelector(WorkflowNodeEdgeContext, (v) => v.edges);

  const { isTool } = splitToolInputs(inputs, nodeId);
  const mcpUrl = inputs.find(
    (item) => item.key === NodeInputKeyEnum.mcpUrl
  ) as FlowNodeInputItemType;
  const mcpTool = inputs.find(
    (item) => item.key === NodeInputKeyEnum.mcpTool
  ) as FlowNodeInputItemType;
  const mcpAuth = inputs.find(
    (item) => item.key === NodeInputKeyEnum.mcpAuth
  ) as FlowNodeInputItemType;
  const mcpParams = inputs.find(
    (item) => item.key === NodeInputKeyEnum.mcpParams
  ) as FlowNodeInputItemType;

  // noinspection DuplicatedCode
  const variables = useCreation(() => {
    return getEditorVariables({
      nodeId,
      nodeList,
      edges,
      appDetail,
      t
    });
  }, [nodeId, nodeList, edges, appDetail, t]);

  const externalProviderWorkflowVariables = useMemo(() => {
    return (
      feConfigs?.externalProviderWorkflowVariables?.map((item) => ({
        key: item.key,
        label: item.name
      })) || []
    );
  }, [feConfigs?.externalProviderWorkflowVariables]);

  const [toolParamJson, setToolParamJson] = useState<string>('');

  const parseToolParams: (inputSchema: any) => void = useCallback(
    (inputSchema: any) => {
      const params = Object.fromEntries(
        Object.keys(inputSchema.properties).map((key) => [key, ''])
      );
      setToolParamJson(JSON.stringify(params, null, 2));
      inputs.forEach((input) => {
        if (input.key === NodeInputKeyEnum.mcpParams) {
          input.placeholder = JSON.stringify(params, null, 2);
        }
      });
    },
    [inputs]
  );

  const RenderParams = useMemoizedFn(() => {
    const height = toolParamJson ? (Object.keys(JSON.parse(toolParamJson)).length + 2) * 24 : 120;
    return (
      <>
        <Flex alignItems={'center'} position={'relative'} fontWeight={'medium'} mt={4} mb={1}>
          <FormLabel required={true} color={'myGray.600'}>
            {'工具参数'}
          </FormLabel>
          {toolParamJson && (
            <QuestionTip
              ml={1}
              label={<Box>{JSON.stringify(JSON.parse(toolParamJson), null, 2)}</Box>}
            ></QuestionTip>
          )}
        </Flex>

        <Flex w={'100%'} className="nodrag">
          <PromptEditor
            placeholder={toolParamJson}
            value={mcpParams?.value || ''}
            variableLabels={variables}
            variables={variables}
            onChange={(value: string) => {
              onChangeNode({
                nodeId,
                type: 'updateInput',
                key: NodeInputKeyEnum.mcpParams,
                value: {
                  ...mcpParams,
                  value: value
                }
              });
            }}
            minH={height}
            showOpenModal={false}
          />
        </Flex>
      </>
    );
  });

  const RenderToolSelector = useMemo(() => {
    return (
      <MySelect
        h={'40px'}
        className="nowheel"
        bg={'white'}
        mt={1}
        placeholder={'请选择要调用的工具'}
        list={mcpTool?.list || []}
        value={mcpTool?.value}
        onChange={(e: any) => {
          const selectedTool: any = mcpTool?.list?.find((item: any) => item.value === e);
          if (selectedTool) {
            parseToolParams(selectedTool.inputSchema);
          }

          onChangeNode({
            nodeId,
            type: 'updateInput',
            key: NodeInputKeyEnum.mcpTool,
            value: {
              ...mcpTool,
              value: e
            }
          });
        }}
      />
    );
  }, [mcpTool, onChangeNode, nodeId, parseToolParams]);

  return useMemo(() => {
    return (
      <NodeCard minW={'440px'} {...data}>
        <Container>
          {isTool && (
            <>
              <Container>
                <RenderToolInput nodeId={nodeId} inputs={inputs} />
              </Container>
            </>
          )}
          <Flex alignItems={'center'} position={'relative'} fontWeight={'medium'}>
            <FormLabel required={true} color={'myGray.600'}>
              {mcpUrl?.label}
            </FormLabel>
            <QuestionTip ml={1} label={t(mcpUrl?.description as any)}></QuestionTip>
          </Flex>

          <Flex alignItems={'center'} mt={1}>
            <Flex w={'100%'} className="nodrag">
              <PromptEditor
                placeholder={t(mcpUrl?.placeholder as any)}
                value={mcpUrl?.value}
                variableLabels={variables}
                variables={externalProviderWorkflowVariables}
                onChange={(value: string) => {
                  onChangeNode({
                    nodeId,
                    type: 'updateInput',
                    key: NodeInputKeyEnum.mcpUrl,
                    value: {
                      ...mcpUrl,
                      value
                    }
                  });
                }}
                minH={40}
                showOpenModal={false}
              />
            </Flex>
            <Button
              ml={2}
              onClick={async () => {
                const res = await GET<any>('/mcp/toolList', {
                  inputMcpUrl: mcpUrl?.value,
                  inputMcpAuth: mcpAuth?.value
                });
                if (res.status === 'error') {
                  toast({
                    status: 'error',
                    title: res.title
                  });
                  return;
                }
                if (res.data && res.data.length > 0) {
                  mcpTool.list = res.data;
                  parseToolParams(res.data[0].inputSchema);
                  onChangeNode({
                    nodeId,
                    type: 'updateInput',
                    key: NodeInputKeyEnum.mcpTool,
                    value: {
                      ...mcpTool,
                      value: res.data[0].value
                    }
                  });
                }
                onChangeNode({
                  nodeId,
                  type: 'updateInput',
                  key: NodeInputKeyEnum.mcpUrl,
                  value: {
                    ...mcpUrl,
                    value: mcpUrl?.value
                  }
                });
              }}
            >
              {'解析'}
            </Button>
          </Flex>

          <Box mt={2}>
            <RenderInput
              nodeId={nodeId}
              flowInputList={inputs.filter((item) => item.key === NodeInputKeyEnum.mcpAuth)}
            />
          </Box>

          <Flex alignItems={'center'} position={'relative'} fontWeight={'medium'} mt={2}>
            <FormLabel required={true} color={'myGray.600'}>
              {'选择调用工具'}
            </FormLabel>
            <QuestionTip ml={1} label={'选择要调用的工具'}></QuestionTip>
          </Flex>
          {RenderToolSelector}
          <RenderParams />
        </Container>
        <Container>
          <RenderOutput nodeId={nodeId} flowOutputList={outputs} />
        </Container>
      </NodeCard>
    );
  }, [
    RenderParams,
    RenderToolSelector,
    data,
    externalProviderWorkflowVariables,
    inputs,
    isTool,
    mcpAuth?.value,
    mcpTool,
    mcpUrl,
    nodeId,
    onChangeNode,
    outputs,
    parseToolParams,
    t,
    toast,
    variables
  ]);
};

export default React.memo(NodeMcpCall);
