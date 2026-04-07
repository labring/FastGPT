import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Button, Flex, Grid, HStack, useDisclosure } from '@chakra-ui/react';
import { type NodeProps } from 'reactflow';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import dynamic from 'next/dynamic';
import MyIcon from '@fastgpt/web/components/common/Icon';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import NodeInputSelect from '@fastgpt/web/components/core/workflow/NodeInputSelect';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';

import NodeCard from '../render/NodeCard';
import Container from '../../components/Container';
import RenderInput from '../render/RenderInput';
import RenderOutput from '../render/RenderOutput';
import RenderToolInput from '../render/RenderToolInput';
import IOTitle from '../../components/IOTitle';
import InputLabel from '../render/RenderInput/Label';
import CatchError from '../render/RenderOutput/CatchError';

import { WorkflowActionsContext } from '../../../context/workflowActionsContext';
import { WorkflowUtilsContext } from '../../../context/workflowUtilsContext';
import { WorkflowBufferDataContext } from '../../../context/workflowInitContext';
import { AppContext } from '@/pageComponents/app/detail/context';

import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { getEditorVariables } from '../../../utils';
import { getWebLLMModel } from '@/web/common/system/utils';

import { useAgentSkillManager } from './useAgentSkillManager';
import OptimizerPopover from '@/components/common/PromptEditor/OptimizerPopover';

import type { SelectedAgentSkillItemType } from '@fastgpt/global/core/app/formEdit/type';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import type { AppDatasetSearchParamsType } from '@fastgpt/global/core/app/type';

const PromptEditor = dynamic(() => import('@fastgpt/web/components/common/Textarea/PromptEditor'));
const SkillSelectModal = dynamic(
  () => import('@/pageComponents/app/detail/Edit/FormComponent/ToolSelector/SkillSelectModal')
);
const ToolSelectModal = dynamic(
  () => import('@/pageComponents/app/detail/Edit/FormComponent/ToolSelector/ToolSelectModal')
);
const ReferenceRender = dynamic(() => import('../render/RenderInput/templates/Reference'));
const DatasetParamsModal = dynamic(() => import('@/components/core/app/DatasetParamsModal'));
const DatasetSelectModal = dynamic(() => import('@/components/core/app/DatasetSelectModal'));

/* ======== Helper: get current renderType of an input ======== */
const getRenderType = (input: FlowNodeInputItemType) =>
  input.renderTypeList?.[input.selectedTypeIndex || 0] || FlowNodeInputTypeEnum.custom;

/* ======== Helper: custom label row with optional type tag ======== */
const CustomInputLabel = React.memo(function CustomInputLabel({
  nodeId,
  input,
  refLabel,
  refTooltip
}: {
  nodeId: string;
  input: FlowNodeInputItemType;
  refLabel?: string;
  refTooltip?: string;
}) {
  const { t } = useTranslation();
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);

  const renderType = getRenderType(input);

  const onChangeRenderType = useCallback(
    (e: string) => {
      const index = input.renderTypeList.findIndex((item) => item === e) || 0;
      onChangeNode({
        nodeId,
        type: 'updateInput',
        key: input.key,
        value: { ...input, selectedTypeIndex: index, value: undefined }
      });
    },
    [input, nodeId, onChangeNode]
  );

  return (
    <Flex className="nodrag" cursor={'default'} alignItems={'center'}>
      <Flex alignItems={'center'} fontWeight={'medium'}>
        <FormLabel color={'myGray.600'}>{t(input.label as any)}</FormLabel>
      </Flex>

      {/* In reference mode show a readable type tag instead of "Array<object>" */}
      {renderType === FlowNodeInputTypeEnum.reference && refLabel && (
        <MyTooltip label={refTooltip}>
          <Box
            bg={'myGray.100'}
            color={'myGray.500'}
            border={'1px solid'}
            borderColor={'myGray.200'}
            borderRadius={'sm'}
            ml={2}
            px={1}
            h={6}
            display={'flex'}
            alignItems={'center'}
            fontSize={'11px'}
          >
            {refLabel}
          </Box>
        </MyTooltip>
      )}

      {/* Mode switch */}
      {input.renderTypeList && input.renderTypeList.length > 1 && (
        <Box ml={2}>
          <NodeInputSelect
            renderTypeList={input.renderTypeList}
            renderTypeIndex={input.selectedTypeIndex}
            onChange={onChangeRenderType}
          />
        </Box>
      )}
    </Flex>
  );
});

// TODO: 待优化，不一定需要重写，用模板渲染也可以
const NodeAgent = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { nodeId, catchError, inputs, outputs } = data;
  const { t } = useTranslation();

  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  const { splitToolInputs, splitOutput } = useContextSelector(WorkflowUtilsContext, (ctx) => ctx);
  const { getNodeById, edges, systemConfigNode, llmMaxQuoteContext } = useContextSelector(
    WorkflowBufferDataContext,
    (v) => v
  );
  const { appDetail } = useContextSelector(AppContext, (v) => v);
  const { feConfigs, defaultModels } = useSystemStore();

  // Split tool/common inputs and outputs
  const { isTool, commonInputs } = useMemoEnhance(
    () => splitToolInputs(inputs, nodeId),
    [inputs, nodeId, splitToolInputs]
  );
  const { successOutputs, errorOutputs } = useMemoEnhance(
    () => splitOutput(outputs),
    [splitOutput, outputs]
  );

  // Skill manager (for PromptEditor @ integration)
  const {
    selectedTools,
    skillOption,
    selectedSkills,
    onClickSkill,
    onRemoveSkill,
    onUpdateOrAddTool,
    onDeleteTool,
    SkillModal
  } = useAgentSkillManager({ nodeId, inputs });

  // Editor variables for PromptEditor
  const editorVariables = useMemoEnhance(
    () =>
      getEditorVariables({
        nodeId,
        systemConfigNode,
        getNodeById,
        edges,
        appDetail,
        t
      }),
    [nodeId, systemConfigNode, getNodeById, edges, appDetail, t]
  );
  const externalVariables = useMemo(
    () =>
      feConfigs?.externalProviderWorkflowVariables?.map((item) => ({
        key: item.key,
        label: item.name
      })) || [],
    [feConfigs?.externalProviderWorkflowVariables]
  );
  const allVariables = useMemo(
    () => [...(editorVariables || []), ...(externalVariables || [])],
    [editorVariables, externalVariables]
  );

  // ---- Dataset params state (for Agent node inline settings button) ----
  const [datasetParamsData, setDatasetParamsData] = useState<AppDatasetSearchParamsType>({
    searchMode: DatasetSearchModeEnum.embedding,
    embeddingWeight: 0.5,
    limit: 3000,
    similarity: 0.5,
    usingReRank: true,
    rerankModel: defaultModels.llm?.model,
    rerankWeight: 0.6,
    datasetSearchUsingExtensionQuery: true,
    datasetSearchExtensionModel: defaultModels.llm?.model,
    datasetSearchExtensionBg: ''
  });
  const {
    isOpen: isOpenDatasetParams,
    onOpen: onOpenDatasetParams,
    onClose: onCloseDatasetParams
  } = useDisclosure();
  const {
    isOpen: isOpenDatasetSelect,
    onOpen: onOpenDatasetSelect,
    onClose: onCloseDatasetSelect
  } = useDisclosure();

  useEffect(() => {
    inputs.forEach((input) => {
      if ((datasetParamsData as any)[input.key] !== undefined) {
        setDatasetParamsData((state) => ({
          ...state,
          [input.key]: input.value ?? (state as any)[input.key]
        }));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputs]);

  // ---- Prompt ----
  const promptInput = useMemo(
    () => inputs.find((i) => i.key === NodeInputKeyEnum.aiSystemPrompt),
    [inputs]
  );
  const skillsInput = useMemo(
    () => inputs.find((i) => i.key === NodeInputKeyEnum.skills),
    [inputs]
  );
  const toolsInput = useMemo(
    () => inputs.find((i) => i.key === NodeInputKeyEnum.selectedTools),
    [inputs]
  );

  // Split commonInputs into groups
  const manualKeys = useMemo(
    () =>
      new Set([
        NodeInputKeyEnum.aiModel,
        NodeInputKeyEnum.aiSystemPrompt,
        NodeInputKeyEnum.skills,
        NodeInputKeyEnum.selectedTools
      ]),
    []
  );
  const modelInputs = useMemo(
    () => commonInputs.filter((i) => i.key === NodeInputKeyEnum.aiModel),
    [commonInputs]
  );
  // Inputs rendered before skills/tools (fileLink, userChatInput)
  const chatInputKeys = useMemo(
    () => new Set([NodeInputKeyEnum.fileUrlList, NodeInputKeyEnum.userChatInput]),
    []
  );
  const chatInputs = useMemo(
    () => commonInputs.filter((i) => chatInputKeys.has(i.key as NodeInputKeyEnum)),
    [commonInputs, chatInputKeys]
  );
  // Inputs rendered after skills/tools (dataset, etc.)
  const datasetInputs = useMemo(
    () =>
      commonInputs.filter(
        (i) =>
          !manualKeys.has(i.key as NodeInputKeyEnum) &&
          !chatInputKeys.has(i.key as NodeInputKeyEnum)
      ),
    [commonInputs, manualKeys, chatInputKeys]
  );
  // Separate datasetSelectList from other dataset inputs
  const datasetSelectInput = useMemo(
    () => datasetInputs.find((i) => i.key === NodeInputKeyEnum.datasetSelectList),
    [datasetInputs]
  );
  const selectedDatasets = useMemo(
    () => (Array.isArray(datasetSelectInput?.value) ? datasetSelectInput!.value : []),
    [datasetSelectInput]
  );
  const datasetOtherInputs = useMemo(
    () =>
      datasetInputs.filter(
        (i) =>
          i.key !== NodeInputKeyEnum.datasetSelectList &&
          i.key !== NodeInputKeyEnum.datasetParams &&
          i.key !== NodeInputKeyEnum.datasetSimilarity
      ),
    [datasetInputs]
  );

  // ---- Dataset select render type (for mode switch) ----
  const datasetSelectRenderType = useMemo(
    () => datasetSelectInput?.renderTypeList?.[datasetSelectInput?.selectedTypeIndex || 0],
    [datasetSelectInput]
  );
  const onChangeDatasetSelectRenderType = useCallback(
    (e: string) => {
      if (!datasetSelectInput) return;
      const index = datasetSelectInput.renderTypeList.findIndex((item) => item === e) || 0;
      onChangeNode({
        nodeId,
        type: 'updateInput',
        key: datasetSelectInput.key,
        value: { ...datasetSelectInput, selectedTypeIndex: index, value: undefined }
      });
    },
    [datasetSelectInput, nodeId, onChangeNode]
  );

  // ---- Prompt ----
  const onPromptChange = useCallback(
    (text: string) => {
      if (!promptInput) return;
      onChangeNode({
        nodeId,
        key: NodeInputKeyEnum.aiSystemPrompt,
        type: 'updateInput',
        value: { ...promptInput, value: text }
      });
    },
    [promptInput, nodeId, onChangeNode]
  );
  const promptRenderType = useMemo(() => {
    if (!promptInput) return FlowNodeInputTypeEnum.textarea;
    return getRenderType(promptInput);
  }, [promptInput]);
  const PromptSkillTip = useMemo(
    () =>
      promptRenderType === FlowNodeInputTypeEnum.textarea ? (
        <HStack fontSize={'11px'} spacing={1} color={'myGray.500'}>
          <MyIcon name={'common/info'} w={'0.8rem'} />
          <Box>{t('workflow:agent.prompt_skill_tip')}</Box>
        </HStack>
      ) : undefined,
    [promptRenderType, t]
  );
  const OptimizerPopoverComponent = useCallback(
    ({ iconButtonStyle }: { iconButtonStyle: Record<string, any> }) => (
      <OptimizerPopover
        iconButtonStyle={iconButtonStyle}
        defaultPrompt={promptInput?.value}
        onChangeText={onPromptChange}
      />
    ),
    [promptInput?.value, onPromptChange]
  );

  // ---- Skills ----
  const selectedAgentSkills: SelectedAgentSkillItemType[] = useMemo(
    () => (Array.isArray(skillsInput?.value) ? skillsInput!.value : []),
    [skillsInput]
  );
  const skillsRenderType = useMemo(
    () => (skillsInput ? getRenderType(skillsInput) : FlowNodeInputTypeEnum.selectSkill),
    [skillsInput]
  );
  const {
    isOpen: isOpenSkillSelect,
    onOpen: onOpenSkillSelect,
    onClose: onCloseSkillSelect
  } = useDisclosure();

  // ---- Tools ----
  const toolsRenderType = useMemo(
    () => (toolsInput ? getRenderType(toolsInput) : FlowNodeInputTypeEnum.selectTool),
    [toolsInput]
  );
  const {
    isOpen: isOpenToolSelect,
    onOpen: onOpenToolSelect,
    onClose: onCloseToolSelect
  } = useDisclosure();

  // ---- Model ----
  const currentModel = useMemo(() => {
    const modelValue = inputs.find((i) => i.key === NodeInputKeyEnum.aiModel)?.value;
    return getWebLLMModel(modelValue);
  }, [inputs]);

  return (
    <NodeCard minW={'524px'} selected={selected} {...data}>
      {isTool && (
        <Container>
          <RenderToolInput nodeId={nodeId} inputs={inputs} />
        </Container>
      )}

      <Container>
        <IOTitle text={t('common:Input')} nodeId={nodeId} inputs={inputs} />

        {/* 1. Model settings */}
        {modelInputs.length > 0 && <RenderInput nodeId={nodeId} flowInputList={modelInputs} />}

        {/* 2. System prompt */}
        {promptInput && (
          <Box position={'relative'} mb={5}>
            <InputLabel nodeId={nodeId} input={promptInput} RightComponent={PromptSkillTip} />
            <Box mt={2} className={'nodrag'}>
              {promptRenderType === FlowNodeInputTypeEnum.textarea ? (
                <PromptEditor
                  minH={160}
                  bg={'myGray.50'}
                  title={t('common:core.ai.Prompt')}
                  isRichText={true}
                  showOpenModal={true}
                  value={promptInput.value || ''}
                  onChange={onPromptChange}
                  variables={allVariables}
                  variableLabels={editorVariables}
                  skillOption={skillOption}
                  selectedSkills={selectedSkills}
                  onClickSkill={onClickSkill}
                  onRemoveSkill={onRemoveSkill}
                  ExtensionPopover={[OptimizerPopoverComponent]}
                  placeholder={promptInput.placeholder ? t(promptInput.placeholder as any) : ''}
                />
              ) : (
                <ReferenceRender inputs={inputs} item={promptInput} nodeId={nodeId} />
              )}
            </Box>
          </Box>
        )}

        {/* 3. Chat inputs (fileLink, userChatInput) */}
        {chatInputs.length > 0 && <RenderInput nodeId={nodeId} flowInputList={chatInputs} />}

        {/* 4. Skills section (manual select / reference dual mode) */}
        {feConfigs?.show_skill && skillsInput && (
          <Box mb={5}>
            <CustomInputLabel
              nodeId={nodeId}
              input={skillsInput}
              refLabel={t('workflow:agent.select_skill')}
              refTooltip={`{
  skillId: string;
}[]`}
            />
            <Box mt={2} className={'nodrag'}>
              {skillsRenderType === FlowNodeInputTypeEnum.selectSkill ? (
                <>
                  <Grid
                    gridTemplateColumns={'repeat(2, minmax(0, 1fr))'}
                    gridGap={4}
                    minW={'350px'}
                    w={'100%'}
                  >
                    <Button
                      h={10}
                      bg="white"
                      color="#156AD9"
                      border="1px solid #91BBF2"
                      _hover={{ bg: 'myGray.50' }}
                      leftIcon={<MyIcon name={'common/selectLight'} w={'14px'} />}
                      onClick={onOpenSkillSelect}
                    >
                      {t('common:Choose')}
                    </Button>
                    {selectedAgentSkills.map((item) => (
                      <MyTooltip key={item.skillId} label={item.description}>
                        <Flex
                          alignItems={'center'}
                          h={10}
                          boxShadow={'sm'}
                          bg={'white'}
                          border={'base'}
                          px={2}
                          borderRadius={'md'}
                          _hover={{
                            borderColor: 'primary.300',
                            '& .delete-btn': { display: 'flex' }
                          }}
                        >
                          {item.avatar ? (
                            <Avatar src={item.avatar} w={'18px'} borderRadius={'xs'} />
                          ) : (
                            <MyIcon name={'core/skill/default'} w={'18px'} />
                          )}
                          <Box
                            ml={1.5}
                            flex={'1 0 0'}
                            w={0}
                            className="textEllipsis"
                            fontWeight={'bold'}
                            fontSize={['sm', 'sm']}
                          >
                            {item.name}
                          </Box>
                          <Box className="delete-btn" display={'none'}>
                            <MyIconButton
                              icon="delete"
                              hoverBg="red.50"
                              hoverColor="red.600"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!skillsInput) return;
                                onChangeNode({
                                  nodeId,
                                  key: NodeInputKeyEnum.skills,
                                  type: 'updateInput',
                                  value: {
                                    ...skillsInput,
                                    value: selectedAgentSkills.filter(
                                      (s) => s.skillId !== item.skillId
                                    )
                                  }
                                });
                              }}
                            />
                          </Box>
                        </Flex>
                      </MyTooltip>
                    ))}
                  </Grid>
                  {isOpenSkillSelect && (
                    <SkillSelectModal
                      selectedSkills={selectedAgentSkills}
                      onAddSkill={(skill: SelectedAgentSkillItemType) => {
                        if (!skillsInput) return;
                        onChangeNode({
                          nodeId,
                          key: NodeInputKeyEnum.skills,
                          type: 'updateInput',
                          value: {
                            ...skillsInput,
                            value: [skill, ...selectedAgentSkills]
                          }
                        });
                      }}
                      onRemoveSkill={(skillId: string) => {
                        if (!skillsInput) return;
                        onChangeNode({
                          nodeId,
                          key: NodeInputKeyEnum.skills,
                          type: 'updateInput',
                          value: {
                            ...skillsInput,
                            value: selectedAgentSkills.filter((s) => s.skillId !== skillId)
                          }
                        });
                      }}
                      onClose={onCloseSkillSelect}
                    />
                  )}
                </>
              ) : (
                <ReferenceRender inputs={inputs} item={skillsInput} nodeId={nodeId} />
              )}
            </Box>
          </Box>
        )}

        {/* 5. Tools section (manual select / reference dual mode) */}
        {toolsInput && (
          <Box mb={5}>
            <CustomInputLabel
              nodeId={nodeId}
              input={toolsInput}
              refLabel={t('workflow:agent.select_tool')}
              refTooltip={`{
  toolId: string;
}[]`}
            />
            <Box mt={2} className={'nodrag'}>
              {toolsRenderType === FlowNodeInputTypeEnum.selectTool ? (
                <>
                  <Grid
                    gridTemplateColumns={'repeat(2, minmax(0, 1fr))'}
                    gridGap={4}
                    minW={'350px'}
                    w={'100%'}
                  >
                    <Button
                      h={10}
                      bg="white"
                      color="#156AD9"
                      border="1px solid #91BBF2"
                      _hover={{ bg: 'myGray.50' }}
                      leftIcon={<MyIcon name={'common/selectLight'} w={'14px'} />}
                      onClick={onOpenToolSelect}
                    >
                      {t('common:Choose')}
                    </Button>
                    {selectedTools.map((item) => (
                      <MyTooltip key={item.id} label={item.intro}>
                        <Flex
                          alignItems={'center'}
                          h={10}
                          boxShadow={'sm'}
                          bg={'white'}
                          border={'base'}
                          px={2}
                          borderRadius={'md'}
                          _hover={{
                            borderColor: 'primary.300',
                            '& .delete-btn': { display: 'flex' }
                          }}
                        >
                          <Avatar src={item.avatar} w={'18px'} borderRadius={'xs'} />
                          <Box
                            ml={1.5}
                            flex={'1 0 0'}
                            w={0}
                            className="textEllipsis"
                            fontWeight={'bold'}
                            fontSize={['sm', 'sm']}
                          >
                            {item.name}
                          </Box>
                          <Box className="delete-btn" display={'none'}>
                            <MyIconButton
                              icon="delete"
                              hoverBg="red.50"
                              hoverColor="red.600"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteTool(item.pluginId!);
                              }}
                            />
                          </Box>
                        </Flex>
                      </MyTooltip>
                    ))}
                  </Grid>
                  {isOpenToolSelect && (
                    <ToolSelectModal
                      selectedTools={selectedTools}
                      selectedModel={currentModel}
                      fileSelectConfig={{}}
                      onAddTool={(tool) => onUpdateOrAddTool({ ...tool, id: tool.pluginId! })}
                      onRemoveTool={(tool) => onDeleteTool(tool.id)}
                      onClose={onCloseToolSelect}
                    />
                  )}
                </>
              ) : (
                <ReferenceRender inputs={inputs} item={toolsInput} nodeId={nodeId} />
              )}
            </Box>
          </Box>
        )}

        {/* 6. Dataset inputs (datasetSelectList, datasetParams, etc.) */}
        {datasetSelectInput && (
          <Box mb={5}>
            <Flex className="nodrag" cursor={'default'} alignItems={'center'}>
              <FormLabel color={'myGray.600'}>{t('common:core.dataset.Dataset')}</FormLabel>
              {datasetSelectInput.renderTypeList &&
                datasetSelectInput.renderTypeList.length > 1 && (
                  <Box ml={2}>
                    <NodeInputSelect
                      renderTypeList={datasetSelectInput.renderTypeList}
                      renderTypeIndex={datasetSelectInput.selectedTypeIndex}
                      onChange={onChangeDatasetSelectRenderType}
                    />
                  </Box>
                )}
              <MyTooltip label={t('workflow:params_setting')}>
                <Box
                  ml={2}
                  display={'inline-flex'}
                  alignItems={'center'}
                  cursor={'pointer'}
                  color={'myGray.500'}
                  _hover={{ color: 'primary.600' }}
                  onClick={onOpenDatasetParams}
                >
                  <MyIcon name={'common/settingLight'} w={'16px'} />
                </Box>
              </MyTooltip>
            </Flex>
            <Box mt={2} className={'nodrag'}>
              {datasetSelectRenderType === FlowNodeInputTypeEnum.selectDataset ? (
                <>
                  <Grid
                    gridTemplateColumns={'repeat(2, minmax(0, 1fr))'}
                    gridGap={4}
                    minW={'350px'}
                    w={'100%'}
                  >
                    <Button
                      h={10}
                      bg="white"
                      color="#156AD9"
                      border="1px solid #91BBF2"
                      _hover={{ bg: 'myGray.50' }}
                      leftIcon={<MyIcon name={'common/selectLight'} w={'14px'} />}
                      onClick={onOpenDatasetSelect}
                    >
                      {t('common:Choose')}
                    </Button>
                    {selectedDatasets.map((dataset) => (
                      <Flex
                        key={dataset.datasetId}
                        alignItems={'center'}
                        h={10}
                        boxShadow={'sm'}
                        bg={'white'}
                        border={'base'}
                        px={2}
                        borderRadius={'md'}
                      >
                        <Avatar src={dataset.avatar} w={'18px'} borderRadius={'xs'} />
                        <Box
                          ml={1.5}
                          flex={'1 0 0'}
                          w={0}
                          className="textEllipsis"
                          fontWeight={'bold'}
                          fontSize={['sm', 'sm']}
                        >
                          {dataset.name}
                        </Box>
                      </Flex>
                    ))}
                  </Grid>
                  {isOpenDatasetSelect && (
                    <DatasetSelectModal
                      defaultSelectedDatasets={selectedDatasets.map((d) => ({
                        datasetId: d.datasetId,
                        name: d.name,
                        avatar: d.avatar,
                        vectorModel: d.vectorModel
                      }))}
                      onChange={(e) => {
                        if (!datasetSelectInput) return;
                        onChangeNode({
                          nodeId,
                          key: NodeInputKeyEnum.datasetSelectList,
                          type: 'updateInput',
                          value: { ...datasetSelectInput, value: e }
                        });
                      }}
                      onClose={onCloseDatasetSelect}
                    />
                  )}
                </>
              ) : (
                <ReferenceRender inputs={inputs} item={datasetSelectInput} nodeId={nodeId} />
              )}
            </Box>
          </Box>
        )}
        {datasetOtherInputs.length > 0 && (
          <RenderInput nodeId={nodeId} flowInputList={datasetOtherInputs} />
        )}
      </Container>

      {successOutputs.length > 0 && (
        <Container>
          <IOTitle text={t('common:Output')} nodeId={nodeId} catchError={catchError} />
          <RenderOutput nodeId={nodeId} flowOutputList={successOutputs} />
        </Container>
      )}
      {catchError && <CatchError nodeId={nodeId} errorOutputs={errorOutputs} />}

      <SkillModal />

      {isOpenDatasetParams && (
        <DatasetParamsModal
          {...datasetParamsData}
          maxTokens={llmMaxQuoteContext}
          onClose={onCloseDatasetParams}
          onSuccess={(e) => {
            setDatasetParamsData(e);
            for (const key in e) {
              const item = inputs.find((input) => input.key === key);
              if (!item) continue;
              onChangeNode({
                nodeId,
                type: 'updateInput',
                key,
                value: { ...item, value: (e as any)[key] }
              });
            }
          }}
        />
      )}
    </NodeCard>
  );
};

export default React.memo(NodeAgent);
