import React, { useState } from 'react';
import { Box, Flex, Button, ModalBody, Input, ModalFooter, Textarea } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { postCreateApp } from '@/web/core/app/api';
import { useRouter } from 'next/router';
import { emptyTemplates } from '@/web/core/app/templates';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useUploadAvatar } from '@fastgpt/web/common/file/hooks/useUploadAvatar';
import { getUploadAvatarPresignedUrl } from '@/web/common/file/api';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { getTemplateMarketItemDetail } from '@/web/core/app/api/template';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { createAppTypeMap } from '@/pageComponents/app/constants';
import { TabEnum } from '@/pageComponents/app/detail/context';
import SmartCustomerServiceForm from './SmartCustomerServiceForm';
import type { SmartCustomerServiceFormType } from './SmartCustomerServiceForm';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { updateDatasetSearchNodesLimit } from '@/web/core/app/utils';
import AIModelSelector from '@/components/Select/AIModelSelector';
import {
  WORKFLOW_COPILOT_TASK_STORAGE_KEY,
  type WorkflowCopilotGenerationTask
} from '@/pageComponents/app/detail/WorkflowComponents/Flow/copilot/constants';
import SfRadio from '@/components/SF/SfRadio';
import MyPopover from '@fastgpt/web/components/common/MyPopover';

type FormType = {
  avatar: string;
  name: string;
  intro?: string;
  smartCustomerService?: SmartCustomerServiceFormType;
  workflowGenerationRequirement?: string;
};

export type CreateAppType =
  | AppTypeEnum.simple
  | AppTypeEnum.workflow
  | AppTypeEnum.assistant
  | AppTypeEnum.chatAgent;

type CreateMode = 'manual' | 'copilot';

const MODAL_TITLE: Record<CreateAppType, string> = {
  [AppTypeEnum.workflow]: 'app:create_workflow',
  [AppTypeEnum.assistant]: 'app:create_smart_qa',
  [AppTypeEnum.chatAgent]: 'app:create_agent',
  [AppTypeEnum.simple]: 'app:create_agent'
};

const CreateModal = ({
  onClose,
  type,
  parentId,
  onSuccess
}: {
  type: CreateAppType;
  onClose: () => void;
  parentId?: string | null;
  onSuccess?: () => void;
}) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { isPc } = useSystem();
  const { llmModelList, defaultModels } = useSystemStore();
  const [copilotModel, setCopilotModel] = useState(
    defaultModels.llm?.id || llmModelList[0]?.id || ''
  );
  const [createMode, setCreateMode] = useState<CreateMode>('manual');
  const modelList = llmModelList.map((m) => ({ label: m.name, value: m.id }));

  const { register, setValue, watch, handleSubmit } = useForm<FormType>({
    defaultValues: {
      avatar: createAppTypeMap[type].icon,
      name: '',
      intro: '',
      smartCustomerService: { datasets: [] },
      workflowGenerationRequirement: t('app:workflow_requirement_default')
    }
  });

  const avatar = watch('avatar');
  const smartCustomerService = watch('smartCustomerService');
  const workflowGenerationRequirement = watch('workflowGenerationRequirement');

  const { Component: AvatarUploader, handleFileSelectorOpen: handleAvatarSelectorOpen } =
    useUploadAvatar(getUploadAvatarPresignedUrl, {
      onSuccess(newAvatar) {
        setValue('avatar', newAvatar);
      }
    });

  const { runAsync: onclickCreate, loading: isCreating } = useRequest(
    async (
      { avatar, name, intro, smartCustomerService, workflowGenerationRequirement }: FormType,
      mode: CreateMode = 'manual'
    ) => {
      if (type === AppTypeEnum.assistant) {
        const templateDetail = await getTemplateMarketItemDetail('community-assistant');
        const template = templateDetail.workflow;
        const updatedNodes = template.nodes.map((node: StoreNodeItemType) => {
          if (node.flowNodeType === FlowNodeTypeEnum.datasetSearchNode) {
            node.inputs.forEach((input: FlowNodeInputItemType) => {
              if (input.key === NodeInputKeyEnum.datasetSelectList) {
                input.value = smartCustomerService?.datasets || [];
              }
              if (input.key === NodeInputKeyEnum.datasetSearchRerankModelId) {
                input.value = '';
              }
            });
          }
          return node;
        });
        const finalNodes = updateDatasetSearchNodesLimit(updatedNodes);
        return postCreateApp({
          parentId: parentId as string,
          avatar,
          name,
          intro: intro?.trim() || undefined,
          type,
          modules: finalNodes,
          edges: template.edges,
          chatConfig: template.chatConfig
        });
      }

      const emptyTemplate = emptyTemplates[type as keyof typeof emptyTemplates];
      const nodes = emptyTemplate?.nodes ?? [];

      const appId = await postCreateApp({
        parentId: parentId as string,
        avatar,
        name,
        intro: intro?.trim() || undefined,
        type,
        modules: nodes,
        edges: emptyTemplate?.edges ?? [],
        chatConfig: emptyTemplate?.chatConfig ?? {}
      });

      if (mode === 'copilot') {
        const task: WorkflowCopilotGenerationTask = {
          appId,
          requirement: workflowGenerationRequirement?.trim() || '',
          model: copilotModel,
          createdAt: Date.now()
        };
        sessionStorage.setItem(WORKFLOW_COPILOT_TASK_STORAGE_KEY, JSON.stringify(task));
      }

      return appId;
    },
    {
      onSuccess(id: string) {
        router.push(`/app/detail?appId=${id}&currentTab=${TabEnum.appEdit}`);
        onSuccess?.();
        onClose();
      },
      successToast: t('common:create_success'),
      errorToast: t('common:create_failed')
    }
  );

  const isDatasetsEmpty =
    type === AppTypeEnum.assistant && (smartCustomerService?.datasets?.length ?? 0) === 0;
  const isWorkflowCopilot = type === AppTypeEnum.workflow && createMode === 'copilot';
  const isCopilotDisabled = isWorkflowCopilot
    ? !workflowGenerationRequirement?.trim() || !copilotModel
    : false;
  const isConfirmDisabled = isDatasetsEmpty || isCopilotDisabled;
  const tooltipLabel = isDatasetsEmpty ? t('app:files_cascader_select_first') : '';

  return (
    <MyModal
      title={t(MODAL_TITLE[type])}
      onClose={onClose}
      isOpen
      isCentered={!isPc}
      w={'600px'}
      maxW={['90vw', '600px']}
      isLoading={isCreating}
    >
      <ModalBody>
        {/* 工作流：类型选择 */}
        {type === AppTypeEnum.workflow && (
          <Box mb={4}>
            <SfRadio
              list={[
                { title: t('app:create_mode_manual'), value: 'manual' },
                { title: t('app:create_mode_copilot'), value: 'copilot' }
              ]}
              value={createMode}
              onChange={(v) => setCreateMode(v as CreateMode)}
            />
          </Box>
        )}

        {/* 图标 & 名称 */}
        <Box mb={4}>
          <FormLabel required mb={2.5}>
            {t('common:app_icon_and_name')}
          </FormLabel>
          <Flex alignItems={'center'}>
            <MyTooltip label={t('common:set_avatar')}>
              <Flex
                borderRadius={'6px'}
                w={10}
                h={10}
                border={'1px solid'}
                borderColor={'myGray.200'}
                justifyContent={'center'}
                alignItems={'center'}
                mr={2.5}
                cursor={'pointer'}
                flexShrink={0}
                onClick={handleAvatarSelectorOpen}
              >
                <Avatar src={avatar} borderRadius={'4.667px'} />
              </Flex>
            </MyTooltip>
            <Input
              flex={1}
              h={'34px'}
              autoFocus
              {...register('name', {
                required: t('common:core.app.error.App name can not be empty')
              })}
            />
          </Flex>
        </Box>

        {/* 描述 */}
        <Box mb={4}>
          <FormLabel mb={2.5}>{t('common:plugin.Description')}</FormLabel>
          <Textarea resize={'vertical'} minH={'50px'} h={'50px'} {...register('intro')} />
        </Box>

        {/* 智能问答：知识库选择 */}
        {type === AppTypeEnum.assistant && (
          <SmartCustomerServiceForm
            value={smartCustomerService!}
            onChange={(data) => setValue('smartCustomerService', data)}
          />
        )}

        {/* 工作流-智能生成：AI 模型 + 需求 */}
        {type === AppTypeEnum.workflow && createMode === 'copilot' && (
          <>
            <Box mb={4}>
              <FormLabel required mb={2.5}>
                {t('app:workflow_model_label')}
              </FormLabel>
              <AIModelSelector
                w={'100%'}
                value={copilotModel}
                list={modelList}
                onChange={setCopilotModel}
              />
            </Box>

            <Box>
              <Flex alignItems={'center'} mb={2.5}>
                <FormLabel required>{t('app:workflow_requirement_label')}</FormLabel>
                <MyPopover
                  trigger={'hover'}
                  placement={'right-start'}
                  hasArrow={false}
                  p={0}
                  w={'360px'}
                  Trigger={
                    <Box ml={1} display={'inline-flex'} alignItems={'center'} cursor={'default'}>
                      <MyIcon name={'help' as any} w={'16px'} color={'myGray.500'} />
                    </Box>
                  }
                >
                  {() => (
                    <Box p={'12px'}>
                      <Box fontSize={'xs'} color={'#333'} mb={2}>
                        {t('app:workflow_requirement_tooltip_title')}
                      </Box>
                      <Box
                        fontSize={'xs'}
                        color={'#333'}
                        border={'1px solid #E8EBF0'}
                        borderRadius={'4px'}
                        p={'10px'}
                        whiteSpace={'pre-wrap'}
                        cursor={'default'}
                        maxH={'400px'}
                        overflowY={'auto'}
                      >
                        {t('app:workflow_requirement_tooltip_example')}
                      </Box>
                    </Box>
                  )}
                </MyPopover>
              </Flex>
              <Textarea
                value={workflowGenerationRequirement}
                onChange={(e) => setValue('workflowGenerationRequirement', e.target.value)}
                minH={'200px'}
                resize={'vertical'}
              />
            </Box>
          </>
        )}
      </ModalBody>

      <ModalFooter gap={2}>
        <Button variant={'whiteBase'} onClick={onClose}>
          {t('common:Cancel')}
        </Button>
        <MyTooltip label={tooltipLabel} isDisabled={!tooltipLabel}>
          <Button
            variant={'primary'}
            isLoading={isCreating}
            isDisabled={isConfirmDisabled}
            onClick={handleSubmit((data) =>
              onclickCreate(data, isWorkflowCopilot ? 'copilot' : 'manual')
            )}
          >
            {t('common:Confirm')}
          </Button>
        </MyTooltip>
      </ModalFooter>
      <AvatarUploader />
    </MyModal>
  );
};

export default CreateModal;
