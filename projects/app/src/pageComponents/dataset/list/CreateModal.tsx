import React, { useMemo, useState } from 'react';
import {
  Box,
  Flex,
  Button,
  ModalFooter,
  ModalBody,
  Input,
  HStack,
  Textarea,
  Switch,
  Collapse
} from '@chakra-ui/react';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/router';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyBox from '@fastgpt/web/components/common/MyBox';
import {
  postCreateDataset,
  putDatasetById,
  getDatasetById,
  getDatasetTrainingQueue,
  postDatasetSync,
  postRebuildEmbedding
} from '@/web/core/dataset/api';
import type { CreateDatasetBody } from '@fastgpt/global/openapi/core/dataset/api';
import type { CreateDatasetParams } from '@/global/core/dataset/api.d';
import { useTranslation } from 'next-i18next';
import { DatasetTypeEnum, DatasetTypeMap } from '@fastgpt/global/core/dataset/constants';
import AIModelSelector from '@/components/Select/AIModelSelector';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import ComplianceTip from '@/components/common/ComplianceTip/index';
import MyIcon from '@fastgpt/web/components/common/Icon';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import oneLight from 'react-syntax-highlighter/dist/esm/styles/prism/one-light';
import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
import { getDocPath } from '@/web/common/system/doc';
import { ChevronDownIcon, ChevronUpIcon } from '@chakra-ui/icons';
import ApiDatasetForm from '../ApiDatasetForm';
import { getWebDefaultEmbeddingModel, getWebDefaultLLMModel } from '@/web/common/system/utils';
import { useUploadAvatar } from '@fastgpt/web/common/file/hooks/useUploadAvatar';
import { getUploadAvatarPresignedUrl } from '@/web/common/file/api';

export type CreateDatasetType =
  | DatasetTypeEnum.dataset
  | DatasetTypeEnum.apiDataset
  | DatasetTypeEnum.websiteDataset
  | DatasetTypeEnum.feishu
  | DatasetTypeEnum.yuque
  | DatasetTypeEnum.database
  | DatasetTypeEnum.structureDocument;

const LABEL_WIDTH = '114px';
const LABEL_STYLE = { color: 'myWhite.1000', fontSize: '12px', fontWeight: 'normal' } as const;

const CreateModal = ({
  onClose,
  parentId,
  type,
  editId,
  onUpdateSuccess
}: {
  onClose: () => void;
  parentId?: string;
  type: CreateDatasetType;
  editId?: string;
  onUpdateSuccess?: () => void;
}) => {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { defaultModels, embeddingModelList, llmModelList, getVlmModelList } = useSystemStore();
  const { isPc } = useSystem();

  const isEditMode = !!editId;

  const [isTraining, setIsTraining] = useState(false);
  const [originalVectorModelId, setOriginalVectorModel] = useState<string>();
  const [syncApiModalOpen, setSyncApiModalOpen] = useState(false);
  const [syncTab, setSyncTab] = useState<'request' | 'params' | 'response'>('request');

  const filterNotHiddenVectorModelList = embeddingModelList.filter(
    (item) => !item.hidden && !item.isTuned
  );

  const vllmModelList = useMemo(() => getVlmModelList(), [getVlmModelList]);

  const form = useForm<CreateDatasetParams>({
    defaultValues: {
      parentId,
      type: type || DatasetTypeEnum.dataset,
      avatar: DatasetTypeMap[type].avatar,
      name: '',
      intro: '',
      vectorModelId:
        defaultModels.embedding?.id || getWebDefaultEmbeddingModel(embeddingModelList)?.id,
      agentModelId: defaultModels.datasetTextLLM?.id || getWebDefaultLLMModel(llmModelList)?.id,
      vlmModelId: defaultModels.datasetImageLLM?.id,
      websiteConfig: {
        url: '',
        selector: ''
      },
      autoSync: false,
      keep_header_footer: false,
      keep_appendix: false,
      image_analysis: false,
      chart_analysis: false
    }
  });
  const { register, setValue, handleSubmit, watch, reset } = form;
  const avatar = watch('avatar');
  const vectorModelId = watch('vectorModelId');
  const agentModelId = watch('agentModelId');
  const vlmModelId = watch('vlmModelId');
  const autoSync = watch('autoSync');
  const permissionSync = watch('apiDatasetServer.apiServer.permissionSync');
  const keepHeaderFooter = watch('keep_header_footer');
  const keepAppendix = watch('keep_appendix');
  const imageAnalysis = watch('image_analysis');
  const chartAnalysis = watch('chart_analysis');

  const { Component: AvatarUploader, handleFileSelectorOpen: handleAvatarSelectorOpen } =
    useUploadAvatar(getUploadAvatarPresignedUrl, {
      onSuccess: (avatar: string) => {
        setValue('avatar', avatar);
      }
    });

  // 编辑模式：加载已有数据并回填表单
  const { loading: loadingDataset } = useRequest(
    () => (editId ? getDatasetById(editId) : Promise.resolve(null)),
    {
      manual: false,
      onSuccess: (data) => {
        if (!data) return;
        setOriginalVectorModel(data.vectorModel?.id);
        reset({
          name: data.name,
          intro: data.intro || '',
          avatar: data.avatar,
          vectorModelId: data.vectorModel?.id,
          agentModelId: data.agentModel?.id,
          vlmModelId: data.vlmModel?.id,
          websiteConfig: data.websiteConfig || { url: '', selector: '' },
          autoSync: data.autoSync || false,
          apiDatasetServer: data.apiDatasetServer as any,
          keep_header_footer: data.keep_header_footer || false,
          keep_appendix: data.keep_appendix || false,
          image_analysis: data.image_analysis || false,
          chart_analysis: data.chart_analysis || false
        });
      }
    }
  );

  useRequest(() => (editId ? getDatasetTrainingQueue(editId) : Promise.resolve(null)), {
    manual: false,
    onSuccess: (data) => {
      if (!data) return;
      setIsTraining(data.rebuildingCount > 0 || data.trainingCount > 0);
    }
  });

  const {
    agentModel: agentModelShowConfig,
    vlmModel: vlmModelShowConfig,
    vectorModel: vectorModelShowConfig
  } = DatasetTypeMap[type].formConfig || {};

  const isStructureDocument = type === DatasetTypeEnum.structureDocument;
  const isWebsite = type === DatasetTypeEnum.websiteDataset;
  const isApiDataset = type === DatasetTypeEnum.apiDataset;
  const hasAutoSync =
    type === DatasetTypeEnum.websiteDataset ||
    type === DatasetTypeEnum.apiDataset ||
    type === DatasetTypeEnum.feishu ||
    type === DatasetTypeEnum.yuque;
  const hasKnowledgeProcess =
    type === DatasetTypeEnum.dataset ||
    type === DatasetTypeEnum.apiDataset ||
    type === DatasetTypeEnum.feishu ||
    type === DatasetTypeEnum.yuque;

  const [knowledgeProcessOpen, setKnowledgeProcessOpen] = useState(false);

  const { runAsync: onclickCreate, loading: creating } = useRequest(
    async (data: CreateDatasetParams) => {
      const knowledgeProcessData = hasKnowledgeProcess
        ? {
            keep_header_footer: data.keep_header_footer,
            keep_appendix: data.keep_appendix,
            image_analysis: data.image_analysis,
            chart_analysis: data.chart_analysis
          }
        : {};

      if (isEditMode) {
        const vectorModelChanged =
          data.vectorModelId &&
          originalVectorModelId &&
          data.vectorModelId !== originalVectorModelId;

        const updateData = {
          id: editId!,
          name: data.name,
          intro: data.intro,
          avatar: data.avatar,
          // 如果向量模型变了，不在这里更新，由 rebuildEmbedding 负责更新
          ...(!vectorModelChanged && { vectorModelId: data.vectorModelId }),
          agentModelId: data.agentModelId,
          // 若未选择图片理解模型时需要显示传递null，否则后端不会更新此字段
          vlmModelId: data.vlmModelId ?? null,
          apiDatasetServer: data.apiDatasetServer,
          ...(isWebsite && { websiteConfig: data.websiteConfig }),
          ...(hasAutoSync && { autoSync: data.autoSync }),
          ...knowledgeProcessData
        };
        await putDatasetById(updateData);

        // 如果向量模型发生了变化，调用 rebuildEmbedding 重建所有 embedding
        if (vectorModelChanged) {
          await postRebuildEmbedding({
            datasetId: editId!,
            vectorModelId: data.vectorModelId!
          });
        }

        onUpdateSuccess?.();
        onClose();
        return;
      }

      const { vectorModelId, agentModelId, vlmModelId, ...restData } = {
        parentId: data.parentId,
        type: data.type,
        name: data.name,
        intro: data.intro,
        avatar: data.avatar,
        vectorModelId: data.vectorModelId,
        agentModelId: data.agentModelId,
        // 若未选择图片理解模型时需要显示传递null，否则后端不会更新此字段
        vlmModelId: data.vlmModelId ?? null,
        apiDatasetServer: data.apiDatasetServer,
        ...(isWebsite && { websiteConfig: data.websiteConfig }),
        ...(hasAutoSync && { autoSync: data.autoSync }),
        ...knowledgeProcessData
      };

      const submitData: CreateDatasetBody = isStructureDocument
        ? restData
        : { vectorModelId, agentModelId, vlmModelId, ...restData };

      return await postCreateDataset(submitData);
    },
    {
      successToast: isEditMode ? t('common:update_success') : t('common:create_success'),
      errorToast: isEditMode ? t('common:update_failed') : t('common:create_failed'),
      onSuccess(id) {
        if (!isEditMode) {
          router.push(`/dataset/detail?datasetId=${id}`);
        }
      }
    }
  );

  const { copyData } = useCopyData();

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const syncCurl = `curl --location --request POST '${origin}/api/proApi/core/dataset/datasetSync' \\
  --header 'Authorization: Bearer {{apikey}}' \\
  --header 'Content-Type: application/json' \\
  --data-raw '{
      "datasetId": "${editId || '实际ID'}"
  }'`;

  const syncResponse = JSON.stringify(
    { code: 200, statusText: '', message: '', data: null },
    null,
    2
  );

  return (
    <MyModal
      title={(() => {
        const typeName = t(DatasetTypeMap[type].label);
        const isZh = i18n.language?.startsWith('zh');
        const name = isZh && /^[A-Za-z]/.test(typeName) ? ` ${typeName}` : typeName;
        return isEditMode
          ? t('dataset:edit_dataset_title', { name })
          : t('dataset:new_dataset_title', { name });
      })()}
      headerExtra={
        DatasetTypeMap[type]?.courseUrl ? (
          <Flex
            as={'span'}
            alignItems={'center'}
            color={'primary.600'}
            fontSize={'sm'}
            cursor={'pointer'}
            mr={2}
            flexShrink={0}
            onClick={() => window.open(getDocPath(DatasetTypeMap[type].courseUrl!), '_blank')}
          >
            <MyIcon name={'book'} w={4} mr={0.5} />
            {t('common:Instructions')}
          </Flex>
        ) : undefined
      }
      isOpen
      onClose={onClose}
      isCentered={!isPc}
      w={'600px'}
    >
      <MyBox isLoading={loadingDataset} flex={1} display={'flex'} flexDirection={'column'}>
        <ModalBody py={6} px={8}>
          {/* 图标 & 名称 */}
          <Flex alignItems={'center'}>
            <FormLabel flex={`0 0 ${LABEL_WIDTH}`} required {...LABEL_STYLE}>
              {t('dataset:icon_and_name')}
            </FormLabel>
            <Flex flex={1} alignItems={'center'}>
              <MyTooltip label={t('common:click_select_avatar')}>
                <Avatar
                  flexShrink={0}
                  src={avatar}
                  w={['28px', '32px']}
                  h={['28px', '32px']}
                  cursor={'pointer'}
                  borderRadius={'md'}
                  onClick={handleAvatarSelectorOpen}
                />
              </MyTooltip>
              <Input
                ml={3}
                flex={1}
                autoFocus
                maxLength={30}
                fontSize={'12px'}
                {...register('name', { required: true })}
              />
            </Flex>
          </Flex>

          {/* 描述 */}
          <Flex mt={6} alignItems={'flex-start'}>
            <FormLabel flex={`0 0 ${LABEL_WIDTH}`} pt={'6px'} {...LABEL_STYLE}>
              {t('dataset:description')}
            </FormLabel>
            <Textarea
              flex={1}
              resize={'vertical'}
              minH={'50px'}
              h={'50px'}
              fontSize={'12px'}
              {...register('intro')}
            />
          </Flex>

          {/* Web 站点特有字段 */}
          {isWebsite && (
            <>
              <Flex mt={6} alignItems={'center'}>
                <FormLabel flex={`0 0 ${LABEL_WIDTH}`} required {...LABEL_STYLE}>
                  {t('dataset:website_url')}
                </FormLabel>
                <Input
                  flex={1}
                  fontSize={'12px'}
                  placeholder={t('dataset:website_url_placeholder')}
                  {...register('websiteConfig.url', { required: true })}
                />
              </Flex>
              <Flex mt={6} alignItems={'center'}>
                <FormLabel flex={`0 0 ${LABEL_WIDTH}`} {...LABEL_STYLE}>
                  {t('dataset:website_selector_label')}
                </FormLabel>
                <Input
                  flex={1}
                  fontSize={'12px'}
                  placeholder={t('dataset:website_selector_placeholder')}
                  {...register('websiteConfig.selector')}
                />
              </Flex>
            </>
          )}

          {/* apiDataset / feishu / yuque 特有字段（由 ApiDatasetForm 处理） */}
          {/* @ts-ignore */}
          <ApiDatasetForm type={type} form={form} />

          {/* 自动同步（websiteDataset / apiDataset / feishu / yuque） */}
          {hasAutoSync && (
            <Flex mt={6} alignItems={'center'}>
              <FormLabel flex={`0 0 ${LABEL_WIDTH}`} {...LABEL_STYLE}>
                <HStack spacing={1}>
                  <Box>{t('dataset:sync_schedule')}</Box>
                  <QuestionTip label={t('dataset:sync_schedule_tip')} />
                </HStack>
              </FormLabel>
              <HStack spacing={2} flex={1}>
                <Switch
                  isChecked={autoSync}
                  onChange={(e) => setValue('autoSync', e.target.checked)}
                />
                {isApiDataset && (
                  <Box
                    as={'span'}
                    fontSize={'12px'}
                    color={'blue.650'}
                    cursor={'pointer'}
                    ml="auto"
                    onClick={() => setSyncApiModalOpen(true)}
                  >
                    {t('dataset:sync_api_tip')}
                  </Box>
                )}
              </HStack>
            </Flex>
          )}

          {/* 权限同步（仅 apiDataset） */}
          {isApiDataset && (
            <Flex mt={6} alignItems={'flex-start'}>
              <FormLabel flex={`0 0 ${LABEL_WIDTH}`} {...LABEL_STYLE}>
                <HStack spacing={1}>
                  <Box>{t('dataset:permission_sync')}</Box>
                  <QuestionTip
                    label={
                      <Box>
                        <Box>{t('dataset:permission_sync_tip')}</Box>
                        <Box>{t('dataset:permission_sync_tip_2')}</Box>
                      </Box>
                    }
                  />
                </HStack>
              </FormLabel>
              <Box flex={1}>
                <HStack spacing={2}>
                  <Switch
                    isChecked={permissionSync}
                    onChange={(e) =>
                      setValue('apiDatasetServer.apiServer.permissionSync', e.target.checked)
                    }
                  />
                  {/* <Box fontSize={'12px'} color={'myWhite.900'}>
                    {t('dataset:permission_sync_desc')}
                  </Box> */}
                </HStack>
              </Box>
            </Flex>
          )}

          {/* 向量模型 */}
          {!vectorModelShowConfig?.isHidden && (
            <Flex mt={6} alignItems={'center'}>
              <HStack spacing={1} flex={`0 0 ${LABEL_WIDTH}`}>
                <FormLabel required {...LABEL_STYLE}>
                  {t('common:core.ai.model.Vector Model')}
                </FormLabel>
                <QuestionTip label={t('dataset:vector_model_tip')} />
              </HStack>
              <Box flex={1}>
                <AIModelSelector
                  w={'100%'}
                  value={vectorModelId}
                  list={filterNotHiddenVectorModelList.map((item) => ({
                    label: item.name,
                    value: item.id
                  }))}
                  disableTip={
                    isEditMode && isTraining
                      ? t('dataset:vector_model_processing_disabled_tip')
                      : undefined
                  }
                  onChange={(e) => setValue('vectorModelId' as const, e)}
                />
              </Box>
            </Flex>
          )}

          {/* 知识增强模型 */}
          {!agentModelShowConfig?.isHidden && (
            <Flex mt={6} alignItems={'center'}>
              <HStack spacing={1} flex={`0 0 ${LABEL_WIDTH}`}>
                <FormLabel required {...LABEL_STYLE}>
                  {t('dataset:agent_model_label')}
                </FormLabel>
                <QuestionTip label={t('dataset:agent_model_tip')} />
              </HStack>
              <Box flex={1}>
                <AIModelSelector
                  w={'100%'}
                  value={agentModelId}
                  list={llmModelList.map((item) => ({
                    label: item.name,
                    value: item.id
                  }))}
                  onChange={(e) => setValue('agentModelId', e)}
                />
              </Box>
            </Flex>
          )}

          {/* 图片解析模型 */}
          {!vlmModelShowConfig?.isHidden && (
            <Flex mt={6} alignItems={'center'}>
              <HStack spacing={1} flex={`0 0 ${LABEL_WIDTH}`}>
                <FormLabel {...LABEL_STYLE}>{t('dataset:vlm_model_label')}</FormLabel>
                <QuestionTip label={t('dataset:vlm_model_tip')} />
              </HStack>
              <Box flex={1}>
                <AIModelSelector
                  w={'100%'}
                  clearable
                  value={vlmModelId ?? undefined}
                  list={vllmModelList.map((item) => ({
                    label: item.name,
                    value: item.id
                  }))}
                  onChange={(e) => setValue('vlmModelId', e)}
                />
              </Box>
            </Flex>
          )}

          {/* 编辑模式告警 */}
          {isEditMode && !isStructureDocument && (
            <HStack
              mt={4}
              px={3}
              py={2}
              bg={'#F5F9FF'}
              borderRadius={'md'}
              spacing={2}
              align={'center'}
            >
              <MyIcon name={'common/info'} w={'16px'} flexShrink={0} color={'#1464CC'} mt={'1px'} />
              <Box fontSize={'12px'} color={'#1464CC'}>
                {t('dataset:edit_model_warning')}
              </Box>
            </HStack>
          )}

          {/* 知识处理配置（通用/apiDataset/飞书/语雀） */}
          {hasKnowledgeProcess && (
            <Box mt={6}>
              <Flex
                h={'32px'}
                alignItems={'center'}
                cursor={'pointer'}
                userSelect={'none'}
                onClick={() => setKnowledgeProcessOpen((v) => !v)}
              >
                <Box fontSize={'12px'} fontWeight={600} color={'#333'} flexShrink={0}>
                  {t('dataset:knowledge_process')}
                </Box>
                {knowledgeProcessOpen ? (
                  <ChevronUpIcon w={'16px'} h={'16px'} mx={'8px'} flexShrink={0} color={'#333'} />
                ) : (
                  <ChevronDownIcon w={'16px'} h={'16px'} mx={'8px'} flexShrink={0} color={'#333'} />
                )}
                <Box flex={1} h={'1px'} bg={'myGray.150'} />
              </Flex>
              <Collapse in={knowledgeProcessOpen} animateOpacity>
                <Box mt={2} display={'flex'} flexDirection={'column'} gap={2}>
                  {(
                    [
                      {
                        key: 'keep_header_footer' as const,
                        label: t('dataset:keep_header_footer'),
                        tip: t('dataset:keep_header_footer_tip'),
                        value: keepHeaderFooter
                      },
                      {
                        key: 'keep_appendix' as const,
                        label: t('dataset:keep_appendix'),
                        tip: t('dataset:keep_appendix_tip'),
                        value: keepAppendix
                      },
                      {
                        key: 'image_analysis' as const,
                        label: t('dataset:seal_rec'),
                        tip: t('dataset:seal_rec_tip'),
                        value: imageAnalysis
                      },
                      {
                        key: 'chart_analysis' as const,
                        label: t('dataset:chart_analysis'),
                        tip: t('dataset:chart_analysis_tip'),
                        value: chartAnalysis
                      }
                    ] as const
                  ).map((item) => (
                    <HStack key={item.key} spacing={2} h={'32px'} alignItems={'center'}>
                      <Box fontSize={'12px'} color={'#333'}>
                        {item.label}
                      </Box>
                      <QuestionTip label={item.tip} />
                      <Switch
                        size={'sm'}
                        isChecked={!!item.value}
                        onChange={(e) => setValue(item.key, e.target.checked)}
                      />
                    </HStack>
                  ))}

                  {/* 编辑模式知识处理提示 */}
                  {isEditMode && (
                    <HStack
                      mt={2}
                      px={3}
                      py={2}
                      bg={'#F5F9FF'}
                      borderRadius={'md'}
                      spacing={2}
                      align={'center'}
                    >
                      <MyIcon
                        name={'common/info'}
                        w={'16px'}
                        flexShrink={0}
                        color={'#1464CC'}
                        mt={'1px'}
                      />
                      <Box fontSize={'12px'} color={'#1464CC'}>
                        {t('dataset:knowledge_process_edit_tip')}
                      </Box>
                    </HStack>
                  )}
                </Box>
              </Collapse>
            </Box>
          )}
        </ModalBody>

        <ModalFooter px={9}>
          <Button variant={'whiteBase'} mr={3} onClick={onClose}>
            {t('common:Cancel')}
          </Button>
          <Button isLoading={creating} onClick={handleSubmit((data) => onclickCreate(data))}>
            {t('common:Confirm')}
          </Button>
        </ModalFooter>

        <ComplianceTip pb={6} pt={0} px={9} type={'dataset'} />
      </MyBox>

      <AvatarUploader />

      {/* 同步API调用弹窗 */}
      {syncApiModalOpen && (
        <MyModal
          title={t('dataset:sync_api')}
          isOpen
          onClose={() => {
            setSyncApiModalOpen(false);
            setSyncTab('request');
          }}
          w={'700px'}
        >
          <ModalBody py={6} px={9}>
            <Box fontSize={'12px'} fontWeight={'normal'} mb={'16px'} color={'myWhite.900'}>
              {t('dataset:sync_api_real_time_tip')}
            </Box>
            <FillRowTabs
              mb={2}
              list={[
                { label: t('dataset:api_request_example'), value: 'request' },
                { label: t('dataset:api_params_desc'), value: 'params' },
                { label: t('dataset:api_response_example'), value: 'response' }
              ]}
              height="36px"
              value={syncTab}
              onChange={(e) => setSyncTab(e as 'request' | 'params' | 'response')}
            />
            {syncTab === 'params' ? (
              <Box
                borderRadius={'md'}
                overflow={'hidden'}
                border={'1px solid'}
                borderColor={'myGray.150'}
                bg={'#f5f7fa'}
                p={'16px'}
                fontSize={'13px'}
                lineHeight={'1.6'}
              >
                <Flex
                  borderBottom={'1px solid'}
                  borderColor={'myGray.150'}
                  pb={'8px'}
                  mb={'8px'}
                  fontWeight={'bold'}
                >
                  <Box flex={'0 0 140px'}>{t('common:Params')}</Box>
                  <Box flex={1}>{t('dataset:description')}</Box>
                </Flex>
                <Flex
                  py={'6px'}
                  borderBottom={'1px solid'}
                  borderColor={'myGray.50'}
                  color={'myGray.700'}
                >
                  <Box flex={'0 0 140px'} fontFamily={'monospace'}>
                    datasetId
                  </Box>
                  <Box flex={1}>{t('dataset:api_params_datasetId')}</Box>
                </Flex>
                <Flex py={'6px'} color={'myGray.700'}>
                  <Box flex={'0 0 140px'} fontFamily={'monospace'}>
                    apiKey
                  </Box>
                  <Box flex={1}>{t('dataset:api_params_apiKey')}</Box>
                </Flex>
              </Box>
            ) : (
              (() => {
                const codeContent = syncTab === 'request' ? syncCurl : syncResponse;
                const codeLang = syncTab === 'request' ? 'bash' : 'json';
                return (
                  <Box
                    position={'relative'}
                    borderRadius={'md'}
                    overflow={'hidden'}
                    border={'1px solid'}
                    borderColor={'myGray.150'}
                  >
                    <Box
                      position={'absolute'}
                      top={2}
                      right={3}
                      cursor={'pointer'}
                      onClick={() => copyData(codeContent)}
                      color={'myGray.500'}
                      _hover={{ color: 'myGray.900' }}
                      zIndex={1}
                    >
                      <MyIcon name={'copy'} w={'16px'} />
                    </Box>
                    <SyntaxHighlighter
                      style={oneLight as any}
                      language={codeLang}
                      PreTag="pre"
                      customStyle={{
                        margin: 0,
                        padding: '16px',
                        paddingTop: '24px',
                        background: '#f5f7fa',
                        fontSize: '13px',
                        lineHeight: '1.6'
                      }}
                    >
                      {codeContent}
                    </SyntaxHighlighter>
                  </Box>
                );
              })()
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant={'whiteBase'} onClick={() => setSyncApiModalOpen(false)}>
              {t('common:Close')}
            </Button>
          </ModalFooter>
        </MyModal>
      )}
    </MyModal>
  );
};

export default CreateModal;
