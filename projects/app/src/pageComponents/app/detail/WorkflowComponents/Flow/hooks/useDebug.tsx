import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import { storeNodes2RuntimeNodes } from '@fastgpt/global/common/workflow/runtime';
import type {
  RuntimeEdgeItemType,
  StoreEdgeItemType
} from '@fastgpt/global/core/workflow/type/edge';
import { type StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getGlobalVariableNode } from '@/web/core/workflow/adapt';

import LabelAndFormRender from '@/components/core/app/formRender/LabelAndForm';
import { variableInputTypeToInputType } from '@/components/core/app/formRender/utils';
import { WorkflowRuntimeContext } from '@/components/core/chat/ChatContainer/context/workflowRuntimeContext';
import { Box, Button, Flex, useToast } from '@chakra-ui/react';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import type { AppChatConfigType } from '@fastgpt/global/core/app/type';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { useTranslation } from 'next-i18next';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import { getClientToolPreviewNode } from '@/web/core/app/api/tool';
import { getErrText } from '@fastgpt/global/common/error/utils';
import dynamic from 'next/dynamic';
import { type FieldErrors, useForm, useWatch } from 'react-hook-form';
import { useContextSelector } from 'use-context-selector';
import { useWorkflowPersistence } from '@/web/core/workflow/editor/session/workflowSession';
import {
  useDocumentGetNodeById,
  useGraphQueries,
  useWorkflowSnapshotGetter
} from '../nodes/render/useWorkflowDocument';
import { useWorkflowDebugValue } from '../../debug/workflowDebugSession';
import { getUserFileAmountLimit } from '@fastgpt/global/core/workflow/fileLimit';
import { useFileUploadLimits } from '@/web/common/file/hooks/useFileUploadLimits';
import type { FileSelectorValueItemType } from '@/components/core/app/FileSelector/type';
import {
  checkInputShouldRenderInDebug,
  debugNodeShouldShowAllInputs,
  getDebugGlobalVariableFormProps,
  getDebugInputFormConfig,
  getDebugInputFormValue,
  getDebugRuntimeInputs,
  getWorkflowStartDebugFileInput,
  getWorkflowStartDebugQuery,
  isDebugFileUrlInput
} from './useDebugInput';
import {
  getToolSetDebugData,
  getToolSetDebugRuntimeNode,
  type ToolSetDebugData
} from './toolSetDebug';
import {
  HttpToolSetNodeConfigSchema,
  McpToolSetNodeConfigSchema
} from '@fastgpt/global/core/workflow/type/node';

const MyRightDrawer = dynamic(
  () => import('@fastgpt/web/components/common/MyDrawer/MyRightDrawer')
);

enum TabEnum {
  global = 'global',
  node = 'node'
}

/** 子工具切换只刷新节点参数，保留用户正在填写的全局变量。 */
export const resetDebugNodeVariables = ({
  resetField,
  inputs
}: {
  resetField: (name: 'nodeVariables', options: { defaultValue: Record<string, any> }) => void;
  inputs: RuntimeNodeItemType['inputs'];
}) => {
  resetField('nodeVariables', {
    defaultValue: inputs.reduce<Record<string, any>>((acc, input) => {
      acc[input.key] = getDebugInputFormValue(input);
      return acc;
    }, {})
  });
};

export const useDebug = () => {
  const { t } = useSafeTranslation();
  const { t: workflowT } = useTranslation();
  const toast = useToast();
  const { maxUploadFileCount } = useFileUploadLimits();
  const debugFileMaxAmount = getUserFileAmountLimit({
    systemMaxFileAmount: maxUploadFileCount
  });

  // 可引用来源要按 id 查任意节点并展开容器子节点：语义快照提供 edges，
  // 节点查询走 port 的 getNode，子节点走 Runtime 图查询，app 侧不再自建索引。
  // 三者都是非订阅读取：useDebug 挂在每个节点的 MenuRender 上，订阅语义快照会让
  // 任意一笔字段提交带动全部节点菜单重渲染，而来源列表只在抽屉打开后才需要。
  const getWorkflow = useWorkflowSnapshotGetter();
  const getNodeById = useDocumentGetNodeById();
  const graph = useGraphQueries();
  const onStartNodeDebug = useWorkflowDebugValue((v) => v.onStartNodeDebug);
  const setDebugChatId = useWorkflowDebugValue((v) => v.setDebugChatId);
  const onOpenNodeDebug = useWorkflowDebugValue((v) => v.onOpenNodeDebug);
  // 调试直接读取 Runtime canonical 序列化；发布校验不应阻止调试输入打开。
  const { serializeWorkflow } = useWorkflowPersistence();

  const [defaultGlobalVariables, setDefaultGlobalVariables] = useState<Record<string, any>>(() =>
    (getWorkflow()?.chatConfig?.variables ?? []).reduce(
      (acc, item) => {
        acc[item.key] = item.defaultValue;
        return acc;
      },
      {} as Record<string, any>
    )
  );

  const [runtimeNodeId, setRuntimeNodeId] = useState<string>();
  const [runtimeNodes, setRuntimeNodes] = useState<RuntimeNodeItemType[]>();
  const [runtimeEdges, setRuntimeEdges] = useState<RuntimeEdgeItemType[]>();

  const openDebugNode = useCallback(
    async ({ entryNodeId }: { entryNodeId: string }) => {
      // 每次打开调试弹窗生成独立的会话 chatId，文件上传与调试运行共用，保证文件归属校验通过
      setDebugChatId(getNanoid());

      // 只清上一轮 debug session 写过 overlay 的节点，不再对整份画布做全量清除
      onOpenNodeDebug();
      const serialized = serializeWorkflow();
      if (!serialized) return;
      const { nodes, edges }: { nodes: StoreNodeItemType[]; edges: StoreEdgeItemType[] } =
        serialized;

      const runtimeNodes = storeNodes2RuntimeNodes(nodes, [entryNodeId]);
      const runtimeEdges: RuntimeEdgeItemType[] = edges.map((edge) =>
        edge.target === entryNodeId
          ? {
              ...edge,
              status: 'active'
            }
          : {
              ...edge,
              status: 'waiting'
            }
      );

      setRuntimeNodeId(entryNodeId);
      setRuntimeNodes(runtimeNodes);
      setRuntimeEdges(runtimeEdges);
    },
    [serializeWorkflow, onOpenNodeDebug, setDebugChatId]
  );

  const DebugInputModal = useCallback(() => {
    if (!runtimeNodes || !runtimeEdges) return <></>;

    const [currentTab, setCurrentTab] = useState<TabEnum>(TabEnum.node);
    const [hasFileError, setHasFileError] = useState(false);
    const [toolIndex, setToolIndex] = useState(0);
    const [toolSetDebugData, setToolSetDebugData] = useState<{
      nodeId: string;
      data: ToolSetDebugData;
    }>();
    const [isLoadingToolSet, setIsLoadingToolSet] = useState(false);
    const [toolSetDebugError, setToolSetDebugError] = useState<string>();
    const [toolSetReloadKey, setToolSetReloadKey] = useState(0);
    const [toolPreview, setToolPreview] = useState<{
      id: string;
      node: Awaited<ReturnType<typeof getClientToolPreviewNode>>;
    }>();
    const fileUploading = useContextSelector(WorkflowRuntimeContext, (v) => v.fileUploading);

    const runtimeNode = runtimeNodes.find((node) => node.nodeId === runtimeNodeId);
    const mcpToolSet = runtimeNode?.toolConfig?.mcpToolSet;
    const httpToolSet = runtimeNode?.toolConfig?.httpToolSet;
    const isToolSet =
      runtimeNode?.flowNodeType === FlowNodeTypeEnum.toolSet && !!(mcpToolSet || httpToolSet);
    const isIndependentToolSet = Boolean(
      isToolSet &&
      runtimeNode &&
      !runtimeNode.pluginId &&
      (McpToolSetNodeConfigSchema.safeParse(mcpToolSet).success ||
        HttpToolSetNodeConfigSchema.safeParse(httpToolSet).success)
    );
    const hasToolSetSummary = Boolean(
      mcpToolSet?.toolList?.length || httpToolSet?.toolList?.length
    );
    const currentToolSetDebugData =
      toolSetDebugData && toolSetDebugData.nodeId === runtimeNode?.nodeId
        ? toolSetDebugData.data
        : undefined;
    const toolList = isIndependentToolSet
      ? (currentToolSetDebugData?.toolList ?? [])
      : (mcpToolSet?.toolList ?? httpToolSet?.toolList ?? []);
    const selectedTool = toolList[toolIndex];
    const toolPreviewId = (() => {
      if (!runtimeNode?.pluginId || !selectedTool) return;
      if (mcpToolSet && 'toolId' in mcpToolSet)
        return `${AppToolSourceEnum.mcp}-${mcpToolSet.toolId}/${selectedTool.name}`;
      if (httpToolSet && 'toolId' in httpToolSet)
        return `${AppToolSourceEnum.http}-${httpToolSet.toolId}/${selectedTool.name}`;
    })();

    useEffect(() => {
      if (!toolPreviewId) return;
      let cancelled = false;
      getClientToolPreviewNode({ appId: toolPreviewId, getLatestVersion: true })
        .then((node) => {
          if (!cancelled) setToolPreview({ id: toolPreviewId, node });
        })
        .catch((error) => {
          if (!cancelled) {
            toast({ status: 'error', title: getErrText(error) });
          }
        });
      return () => {
        cancelled = true;
      };
    }, [toolPreviewId]);

    const debugNode = useMemo(() => {
      if (!runtimeNode) return;
      if (!isToolSet) return runtimeNode;
      return getToolSetDebugRuntimeNode({
        toolSetNode: runtimeNode,
        toolIndex,
        debugData: currentToolSetDebugData,
        previewNode: toolPreview && toolPreview.id === toolPreviewId ? toolPreview.node : undefined
      });
    }, [runtimeNode, isToolSet, toolIndex, currentToolSetDebugData, toolPreview, toolPreviewId]);

    const referenceSourceNodes = useMemo(() => {
      if (!runtimeNode) return [];
      return [
        ...(graph?.getSourceNodeIds({ nodeId: runtimeNode.nodeId, includeChildren: true }) ?? [])
          .map((sourceNodeId) => getNodeById(sourceNodeId))
          .filter((sourceNode): sourceNode is NonNullable<typeof sourceNode> => !!sourceNode)
          .map((sourceNode) => ({
            nodeId: sourceNode.nodeId,
            sourceLabel: sourceNode.name,
            icon: sourceNode.avatar,
            outputs: sourceNode.outputs.map((output) => ({ ...output })),
            catchError: sourceNode.catchError
          })),
        getGlobalVariableNode({
          chatConfig: getWorkflow()?.chatConfig as AppChatConfigType,
          t: workflowT
        })
      ];
    }, [runtimeNode, graph, getNodeById, getWorkflow, workflowT]);
    const renderInputs = useMemo(() => {
      if (!runtimeNode) return [];
      const fileSelectConfig = getWorkflow()?.chatConfig?.fileSelectConfig;
      const workflowStartFileInput = getWorkflowStartDebugFileInput({
        flowNodeType: runtimeNode.flowNodeType,
        fileSelectConfig: fileSelectConfig
          ? {
              ...fileSelectConfig,
              customFileExtensionList: fileSelectConfig.customFileExtensionList?.map((item) => item)
            }
          : undefined
      });
      return [
        ...(debugNode?.inputs ?? []).filter((input) =>
          checkInputShouldRenderInDebug(input, {
            showAllInputs: isToolSet || debugNodeShouldShowAllInputs(runtimeNode.flowNodeType),
            referenceSourceNodes
          })
        ),
        ...(workflowStartFileInput ? [workflowStartFileInput] : [])
      ];
    }, [runtimeNode, debugNode, isToolSet, referenceSourceNodes, getWorkflow]);

    if (!runtimeNode) return <></>;
    const workflow = getWorkflow();
    const chatConfig = workflow?.chatConfig;
    const variables = chatConfig?.variables ?? [];
    const getFormVariable = (item: (typeof variables)[number]) =>
      getDebugGlobalVariableFormProps({
        ...item,
        list: item.list?.map((option) => ({ ...option })),
        enums: item.enums?.map((option) => ({ ...option })),
        markList: item.markList?.map((option) => ({ ...option })),
        customFileExtensionList: item.customFileExtensionList?.map((item) => item),
        datasetOptions: item.datasetOptions?.map((dataset) => ({
          ...dataset,
          vectorModel: { ...dataset.vectorModel }
        })),
        customInputConfig: item.customInputConfig
          ? {
              ...item.customInputConfig,
              selectValueTypeList: item.customInputConfig.selectValueTypeList
                ? [...item.customInputConfig.selectValueTypeList]
                : undefined
            }
          : undefined
      });
    const filteredVar = variables.filter(
      (item) => item.type !== VariableInputEnum.custom && item.type !== VariableInputEnum.internal
    );
    const customVar = variables.filter((item) => item.type === VariableInputEnum.custom);
    const internalVar = variables.filter((item) => item.type === VariableInputEnum.internal);
    const variablesForm = useForm<Record<string, any>>({
      defaultValues: {
        nodeVariables: renderInputs.reduce((acc: Record<string, any>, input) => {
          acc[input.key] = getDebugInputFormValue(input);
          return acc;
        }, {}),
        variables: defaultGlobalVariables
      }
    });
    const { control, handleSubmit, resetField } = variablesForm;
    const debugVariables = useWatch({ control, name: 'variables' });

    useEffect(() => {
      if (!runtimeNode || !isIndependentToolSet || !hasToolSetSummary) {
        setIsLoadingToolSet(false);
        setToolSetDebugData(undefined);
        return;
      }
      let cancelled = false;
      setIsLoadingToolSet(true);
      setToolSetDebugError(undefined);
      setToolSetDebugData(undefined);
      getToolSetDebugData(runtimeNode, { runtimeNodes, variables: debugVariables })
        .then((data) => {
          if (cancelled) return;
          setToolIndex(0);
          setToolSetDebugData({ nodeId: runtimeNode.nodeId, data });
        })
        .catch((error) => {
          if (!cancelled) {
            const message = getErrText(error);
            setToolSetDebugError(message);
            toast({ status: 'error', title: message });
          }
        })
        .finally(() => {
          if (!cancelled) setIsLoadingToolSet(false);
        });

      return () => {
        cancelled = true;
      };
    }, [
      runtimeNode,
      runtimeNodes,
      debugVariables,
      isIndependentToolSet,
      hasToolSetSummary,
      toast,
      toolSetReloadKey
    ]);

    useEffect(() => {
      resetDebugNodeVariables({ resetField, inputs: renderInputs });
    }, [debugNode, renderInputs, resetField]);

    const onClose = () => {
      setRuntimeNodeId(undefined);
      setRuntimeNodes(undefined);
      setRuntimeEdges(undefined);
    };

    const onClickRun = (data: Record<string, any>) => {
      if (fileUploading || hasFileError || !debugNode) return;
      const fileUrlInputs = debugNode.inputs.filter((input) => isDebugFileUrlInput({ input }));
      if (fileUrlInputs.length > 0) {
        const nodeVariables = { ...data.nodeVariables };
        fileUrlInputs.forEach((input) => {
          if (!Object.prototype.hasOwnProperty.call(nodeVariables, input.key)) return;

          const files: FileSelectorValueItemType[] = Array.isArray(nodeVariables[input.key])
            ? nodeVariables[input.key]
            : [];
          nodeVariables[input.key] = files
            .map((file) => (typeof file === 'string' ? file : file.url))
            .filter((url): url is string => Boolean(url));
        });

        data = {
          ...data,
          nodeVariables
        };
      }

      onStartNodeDebug({
        entryNodeId: runtimeNode.nodeId,
        runtimeNodes: isToolSet
          ? [
              {
                ...debugNode,
                inputs: getDebugRuntimeInputs({
                  inputs: debugNode.inputs,
                  nodeVariables: data.nodeVariables
                })
              }
            ]
          : runtimeNodes.map((node) =>
              node.nodeId === runtimeNode.nodeId
                ? {
                    ...runtimeNode,
                    inputs: getDebugRuntimeInputs({
                      inputs: runtimeNode.inputs,
                      nodeVariables: data.nodeVariables
                    })
                  }
                : node
            ),
        runtimeEdges: isToolSet ? [] : runtimeEdges,
        variables: data.variables,
        query: getWorkflowStartDebugQuery({
          flowNodeType: runtimeNode.flowNodeType,
          nodeVariables: data.nodeVariables
        })
      });

      // Filter global variables and set them as default global variable values
      setDefaultGlobalVariables(data.variables);

      onClose();
    };

    const onCheckRunError = useCallback((e: FieldErrors<Record<string, any>>) => {
      const hasRequiredNodeVar =
        e.nodeVariables && Object.values(e.nodeVariables).some((item) => item.type === 'validate');

      if (hasRequiredNodeVar) {
        return setCurrentTab(TabEnum.node);
      }

      const hasRequiredGlobalVar =
        e.variables && Object.values(e.variables).some((item) => item.type === 'validate');

      if (hasRequiredGlobalVar) {
        setCurrentTab(TabEnum.global);
      }
    }, []);

    return (
      <MyRightDrawer
        onClose={onClose}
        iconSrc="core/workflow/debugBlue"
        title={t('workflow:debug_test')}
        maxW={['90vw', '40vw']}
        px={0}
      >
        <Box flex={'1 0 0'} overflow={'auto'} px={6}>
          {variables.length > 0 && (
            <LightRowTabs<TabEnum>
              gap={3}
              ml={-2}
              mb={5}
              inlineStyles={{}}
              list={[
                { label: t('workflow:Node_variables'), value: TabEnum.node },
                { label: t('common:core.module.Variable'), value: TabEnum.global }
              ]}
              value={currentTab}
              onChange={setCurrentTab}
            />
          )}
          <Box display={currentTab === TabEnum.node ? 'block' : 'none'}>
            {isToolSet && (
              <Box mb={5}>
                <Box mb={2} fontWeight={'medium'}>
                  {t('app:tool_select')}
                </Box>
                <MySelect<number>
                  list={toolList.map((tool, index) => ({ label: tool.name, value: index }))}
                  value={toolIndex}
                  onChange={setToolIndex}
                />
              </Box>
            )}
            {renderInputs.map((item) => {
              const { inputProps, inputType } = getDebugInputFormConfig(item, {
                maxFiles: debugFileMaxAmount
              });
              const isFileUrlInput = isDebugFileUrlInput({ input: item });

              return (
                <LabelAndFormRender
                  {...inputProps}
                  key={item.key}
                  label={item.debugLabel || item.label}
                  required={item.required}
                  description={t(item.placeholder || item.description)}
                  inputType={inputType}
                  form={variablesForm}
                  fieldName={`nodeVariables.${item.key}`}
                  bg={'myGray.50'}
                  onFileErrorChange={isFileUrlInput ? setHasFileError : undefined}
                />
              );
            })}
            {isToolSet && toolList.length === 0 && (
              <Box>{isLoadingToolSet ? t('common:Loading') : t('app:tools_no_data')}</Box>
            )}
            {isToolSet && toolSetDebugError && (
              <Box>
                <Box mb={2} color={'red.600'}>
                  {toolSetDebugError}
                </Box>
                <Button size={'sm'} onClick={() => setToolSetReloadKey((value) => value + 1)}>
                  {t('common:refresh')}
                </Button>
              </Box>
            )}
            {isToolSet && debugNode && renderInputs.length === 0 && (
              <Box>{t('app:this_tool_requires_no_input')}</Box>
            )}
          </Box>
          <Box display={currentTab === TabEnum.global ? 'block' : 'none'}>
            {customVar.map((item) => (
              <LabelAndFormRender
                {...getFormVariable(item)}
                key={item.key}
                label={item.label}
                required={item.required}
                description={t(item.description)}
                inputType={variableInputTypeToInputType(item.type, item.valueType)}
                form={variablesForm}
                fieldName={`variables.${item.key}`}
                bg={'myGray.50'}
              />
            ))}
            {internalVar.map((item) => (
              <LabelAndFormRender
                {...getFormVariable(item)}
                key={item.key}
                label={item.label}
                required={item.required}
                description={t(item.description)}
                inputType={variableInputTypeToInputType(item.type, item.valueType)}
                form={variablesForm}
                fieldName={`variables.${item.key}`}
                bg={'myGray.50'}
              />
            ))}
            {filteredVar.map((item) => (
              <LabelAndFormRender
                {...getFormVariable(item)}
                key={item.key}
                label={item.label}
                required={item.required}
                description={item.description}
                inputType={variableInputTypeToInputType(item.type, item.valueType)}
                form={variablesForm}
                fieldName={`variables.${item.key}`}
                bg={'myGray.50'}
              />
            ))}
          </Box>
        </Box>
        <Flex py={2} justifyContent={'flex-end'} px={6}>
          <Button
            isDisabled={
              fileUploading || hasFileError || (isToolSet && (!debugNode || isLoadingToolSet))
            }
            onClick={handleSubmit(onClickRun, onCheckRunError)}
          >
            {t('common:Run')}
          </Button>
        </Flex>
      </MyRightDrawer>
    );
  }, [
    runtimeNodes,
    runtimeEdges,
    defaultGlobalVariables,
    t,
    workflowT,
    runtimeNodeId,
    onStartNodeDebug,
    getWorkflow,
    getNodeById,
    graph,
    debugFileMaxAmount,
    toast
  ]);

  return {
    DebugInputModal,
    openDebugNode
  };
};
