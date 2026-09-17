import React from 'react';
import { getWorkflowModelDetails } from '@/web/core/workflow/modelData';
import { getNodeAllSource } from '@/web/core/workflow/utils';
import { checkWorkflowBeforeRunOrPublish } from '@/web/core/workflow/workflowCheck';
import { type RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import { storeNodes2RuntimeNodes } from '@fastgpt/global/core/workflow/runtime/utils';
import {
  type RuntimeEdgeItemType,
  type StoreEdgeItemType
} from '@fastgpt/global/core/workflow/type/edge';
import { type StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useCallback, useMemo, useState } from 'react';
import { useReactFlow } from 'reactflow';
import { uiWorkflow2StoreWorkflow } from '../../utils';

import LabelAndFormRender from '@/components/core/app/formRender/LabelAndForm';
import { variableInputTypeToInputType } from '@/components/core/app/formRender/utils';
import { WorkflowRuntimeContext } from '@/components/core/chat/ChatContainer/context/workflowRuntimeContext';
import { Box, Button, Flex } from '@chakra-ui/react';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { NodeInputKeyEnum, VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { useTranslation } from 'next-i18next';
import dynamic from 'next/dynamic';
import { type FieldErrors, useForm } from 'react-hook-form';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../../../context';
import { WorkflowActionsContext } from '../../context/workflowActionsContext';
import { WorkflowDebugContext } from '../../context/workflowDebugContext';
import { WorkflowBufferDataContext } from '../../context/workflowInitContext';
import { getUserFileAmountLimit } from '@fastgpt/global/core/workflow/fileLimit';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import type { FileSelectorValueItemType } from '@/components/core/app/FileSelector/type';
import { getPresignedChatFileGetUrl } from '@/web/common/file/api';
import { getErrText } from '@fastgpt/global/common/error/utils';
import {
  checkInputShouldRenderInDebug,
  debugNodeShouldShowAllInputs,
  getDebugGlobalVariableFormProps,
  getDebugInputFormConfig,
  getDebugInputFormValue,
  getDebugRuntimeInputs,
  getWorkflowStartDebugFileInput,
  getWorkflowStartDebugQuery,
  isDebugReadFilesInput,
  resolveDebugReadFilesInput
} from './useDebugInput';

const MyRightDrawer = dynamic(
  () => import('@fastgpt/web/components/common/MyDrawer/MyRightDrawer')
);

enum TabEnum {
  global = 'global',
  node = 'node'
}

export const useDebug = () => {
  const { t } = useSafeTranslation();
  const { t: workflowT } = useTranslation();
  const { toast } = useToast();

  const setNodes = useContextSelector(WorkflowBufferDataContext, (v) => v.setNodes);
  const getNodes = useContextSelector(WorkflowBufferDataContext, (v) => v.getNodes);
  const edges = useContextSelector(WorkflowBufferDataContext, (v) => v.edges);
  const getNodeById = useContextSelector(WorkflowBufferDataContext, (v) => v.getNodeById);
  const childrenNodeIdListMap = useContextSelector(
    WorkflowBufferDataContext,
    (v) => v.childrenNodeIdListMap
  );
  const { fitView } = useReactFlow();
  const { onUpdateNodeError, onRemoveError, onSyncWorkflowCheckIssues } = useContextSelector(
    WorkflowActionsContext,
    (v) => v
  );
  const onStartNodeDebug = useContextSelector(WorkflowDebugContext, (v) => v.onStartNodeDebug);
  const debugChatId = useContextSelector(WorkflowDebugContext, (v) => v.debugChatId);
  const setDebugChatId = useContextSelector(WorkflowDebugContext, (v) => v.setDebugChatId);
  const readFilesSubmissionController = useContextSelector(
    WorkflowDebugContext,
    (v) => v.readFilesSubmissionController
  );

  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const { feConfigs } = useSystemStore();
  const { teamPlanStatus } = useUserStore();
  const debugFileMaxAmount = getUserFileAmountLimit({
    teamMaxFileAmount: teamPlanStatus?.standard?.maxUploadFileCount,
    systemMaxFileAmount: feConfigs?.uploadFileMaxAmount ?? 10
  });
  const { filteredVar, customVar, internalVar, variables } = useMemo(() => {
    const variables = appDetail.chatConfig?.variables || [];
    return {
      filteredVar:
        variables.filter(
          (item) =>
            item.type !== VariableInputEnum.custom && item.type !== VariableInputEnum.internal
        ) || [],
      customVar: variables.filter((item) => item.type === VariableInputEnum.custom) || [],
      internalVar: variables.filter((item) => item.type === VariableInputEnum.internal) || [],
      variables
    };
  }, [appDetail.chatConfig?.variables]);

  const [defaultGlobalVariables, setDefaultGlobalVariables] = useState<Record<string, any>>(
    variables.reduce(
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

  const flowData2StoreDataAndCheck = useCallback(async () => {
    const nodes = getNodes();

    const { issueMap, hasError, firstErrorNodeId, chatConfigIssues } =
      checkWorkflowBeforeRunOrPublish({
        nodes,
        edges,
        models: await getWorkflowModelDetails(nodes, appDetail.chatConfig),
        chatConfig: appDetail.chatConfig,
        t: workflowT
      });

    if (!hasError) {
      onRemoveError();
      const storeNodes = uiWorkflow2StoreWorkflow({
        nodes,
        edges,
        chatConfig: appDetail.chatConfig
      });

      return JSON.stringify(storeNodes);
    }

    onSyncWorkflowCheckIssues(issueMap);

    if (firstErrorNodeId) {
      onUpdateNodeError(firstErrorNodeId, true);
      const firstErrorNode = nodes.find((node) => node.data.nodeId === firstErrorNodeId);
      if (firstErrorNode) {
        fitView({
          nodes: [firstErrorNode],
          padding: 0.3
        });
      }
    }

    toast({
      status: 'warning',
      title: t('common:core.workflow.Check Failed'),
      description: [...Object.values(issueMap).flat(), ...chatConfigIssues]
        .filter((issue) => issue.level === 'error')
        .map((issue) => issue.message)
        .filter(Boolean)
        .join('\n')
    });
    return Promise.reject();
  }, [
    appDetail.chatConfig,
    edges,
    fitView,
    getNodes,
    onRemoveError,
    onSyncWorkflowCheckIssues,
    onUpdateNodeError,
    t,
    toast,
    workflowT
  ]);

  const openDebugNode = useCallback(
    async ({ entryNodeId }: { entryNodeId: string }) => {
      readFilesSubmissionController.invalidate();
      // 每次打开调试弹窗生成独立的会话 chatId，文件上传与调试运行共用，保证文件归属校验通过
      setDebugChatId(getNanoid());

      setNodes((state) =>
        state.map((node) => ({
          ...node,
          data: {
            ...node.data,
            debugResult: undefined
          }
        }))
      );
      const {
        nodes,
        edges
      }: {
        nodes: StoreNodeItemType[];
        edges: StoreEdgeItemType[];
      } = JSON.parse(await flowData2StoreDataAndCheck());

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
    [flowData2StoreDataAndCheck, readFilesSubmissionController, setNodes, setDebugChatId]
  );

  const DebugInputModal = useCallback(() => {
    if (!runtimeNodes || !runtimeEdges) return <></>;

    const [currentTab, setCurrentTab] = useState<TabEnum>(TabEnum.node);
    const [hasFileError, setHasFileError] = useState(false);
    const [isPreparingReadFiles, setIsPreparingReadFiles] = useState(false);
    const fileUploading = useContextSelector(WorkflowRuntimeContext, (v) => v.fileUploading);

    const runtimeNode = runtimeNodes.find((node) => node.nodeId === runtimeNodeId);

    if (!runtimeNode) return <></>;
    const referenceSourceNodes = getNodeAllSource({
      nodeId: runtimeNode.nodeId,
      getNodeById,
      edges,
      chatConfig: appDetail.chatConfig,
      t: workflowT,
      childrenNodeIdListMap
    });
    const workflowStartFileInput = getWorkflowStartDebugFileInput({
      flowNodeType: runtimeNode.flowNodeType,
      fileSelectConfig: appDetail.chatConfig?.fileSelectConfig
    });
    const renderInputs = [
      ...runtimeNode.inputs.filter((input) => {
        return checkInputShouldRenderInDebug(input, {
          showAllInputs: debugNodeShouldShowAllInputs(runtimeNode.flowNodeType),
          referenceSourceNodes
        });
      }),
      ...(workflowStartFileInput ? [workflowStartFileInput] : [])
    ];

    const variablesForm = useForm<Record<string, any>>({
      defaultValues: {
        nodeVariables: renderInputs.reduce((acc: Record<string, any>, input) => {
          acc[input.key] = getDebugInputFormValue(input);
          return acc;
        }, {}),
        variables: defaultGlobalVariables
      }
    });
    const { handleSubmit } = variablesForm;

    const onClose = () => {
      readFilesSubmissionController.invalidate();
      setRuntimeNodeId(undefined);
      setRuntimeNodes(undefined);
      setRuntimeEdges(undefined);
    };

    const startNodeDebug = ({ data, chatId }: { data: Record<string, any>; chatId?: string }) => {
      void onStartNodeDebug({
        entryNodeId: runtimeNode.nodeId,
        runtimeNodes: runtimeNodes.map((node) =>
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
        runtimeEdges: runtimeEdges,
        variables: data.variables,
        query: getWorkflowStartDebugQuery({
          flowNodeType: runtimeNode.flowNodeType,
          nodeVariables: data.nodeVariables
        }),
        chatId
      });

      // Filter global variables and set them as default global variable values
      setDefaultGlobalVariables(data.variables);

      onClose();
    };

    const readFilesInput = runtimeNode.inputs.find((input) =>
      isDebugReadFilesInput({
        flowNodeType: runtimeNode.flowNodeType,
        input
      })
    );

    const onClickRun = async (data: Record<string, any>) => {
      if (!readFilesInput) {
        startNodeDebug({ data });
        return;
      }
      if (fileUploading || hasFileError) return;

      const submitDebugChatId = debugChatId;
      if (!submitDebugChatId) {
        toast({
          status: 'error',
          title: t('common:core.chat.error.Chat error')
        });
        return;
      }

      const submissionToken = readFilesSubmissionController.begin();
      if (!submissionToken) return;

      setIsPreparingReadFiles(true);
      try {
        const rawFiles = data.nodeVariables?.[NodeInputKeyEnum.fileUrlList];
        const files: FileSelectorValueItemType[] = Array.isArray(rawFiles) ? rawFiles : [];
        const fileUrlList = await resolveDebugReadFilesInput({
          files,
          resolveFileKey: (key) =>
            getPresignedChatFileGetUrl({
              key,
              appId: appDetail._id,
              chatId: submitDebugChatId
            })
        });

        if (!readFilesSubmissionController.isCurrent(submissionToken)) return;

        startNodeDebug({
          data: {
            ...data,
            nodeVariables: {
              ...data.nodeVariables,
              [NodeInputKeyEnum.fileUrlList]: fileUrlList
            }
          },
          chatId: submitDebugChatId
        });
      } catch (error) {
        if (!readFilesSubmissionController.isCurrent(submissionToken)) return;

        toast({
          status: 'error',
          title: getErrText(error, t('common:core.chat.error.Chat error'))
        });
      } finally {
        if (readFilesSubmissionController.finish(submissionToken)) {
          setIsPreparingReadFiles(false);
        }
      }
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
            {renderInputs.map((item) => {
              const { inputProps, inputType } = getDebugInputFormConfig(item, {
                flowNodeType: runtimeNode.flowNodeType,
                maxFiles: debugFileMaxAmount
              });
              const isReadFilesInput = isDebugReadFilesInput({
                flowNodeType: runtimeNode.flowNodeType,
                input: item
              });

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
                  onFileErrorChange={isReadFilesInput ? setHasFileError : undefined}
                />
              );
            })}
          </Box>
          <Box display={currentTab === TabEnum.global ? 'block' : 'none'}>
            {customVar.map((item) => (
              <LabelAndFormRender
                {...item}
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
                {...item}
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
                {...getDebugGlobalVariableFormProps(item)}
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
            isDisabled={fileUploading || isPreparingReadFiles || hasFileError}
            isLoading={isPreparingReadFiles}
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
    variables.length,
    customVar,
    internalVar,
    filteredVar,
    runtimeNodeId,
    onStartNodeDebug,
    debugChatId,
    getNodeById,
    edges,
    appDetail.chatConfig,
    appDetail._id,
    debugFileMaxAmount,
    readFilesSubmissionController,
    toast,
    childrenNodeIdListMap
  ]);

  return {
    DebugInputModal,
    openDebugNode
  };
};

export default function Dom() {
  return <></>;
}
