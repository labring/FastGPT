import { Box, Button, Flex, Input, Textarea } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import { useForm, useWatch } from 'react-hook-form';
import { createAppTypeMap } from '@/pageComponents/app/constants';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { useCallback, useMemo } from 'react';
import { useContextSelector } from 'use-context-selector';
import { AppListContext } from './context';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { postCreateApp } from '@/web/core/app/api';
import { useRouter } from 'next/router';
import ImportAppConfigEditor from '@/pageComponents/app/ImportAppConfigEditor';
import { postFetchWorkflow } from '@/web/support/marketing/api';
import {
  getUtmParams,
  getUtmWorkflow,
  removeUtmParams,
  removeUtmWorkflow
} from '@/web/support/marketing/utils';
import { useUploadAvatar } from '@fastgpt/web/common/file/hooks/useUploadAvatar';
import { getUploadAvatarPresignedUrl } from '@/web/common/file/api';
import {
  isDashboardImportAppTypeAllowed,
  type JsonImportModalScene,
  parseDashboardImportConfig,
  resolveImportAppType
} from '@/pageComponents/dashboard/agent/utils/appTemplateParse';

type FormType = {
  avatar: string;
  name: string;
  intro: string;
  workflowStr: string;
};

type JsonImportModalProps = {
  scene: JsonImportModalScene;
  onClose: () => void;
};

const JsonImportModal = ({ scene, onClose }: JsonImportModalProps) => {
  const { t } = useTranslation();
  const { parentId, loadMyApps } = useContextSelector(AppListContext, (v) => v);
  const router = useRouter();

  const { register, setValue, getValues, control, handleSubmit } = useForm<FormType>({
    defaultValues: {
      avatar: '',
      name: '',
      intro: '',
      workflowStr: ''
    }
  });
  const workflowStr = useWatch({ control, name: 'workflowStr' }) || '';

  const syncImportMetaToForm = useCallback(
    (value: string) => {
      try {
        const config = JSON.parse(value);
        const { name, intro } =
          config && typeof config === 'object'
            ? (config as { name?: unknown; intro?: unknown })
            : {};
        const { name: currentName, intro: currentIntro } = getValues();

        // 名称和介绍需要独立判断，避免其中一个已有输入时阻止另一个自动回填。
        if (!currentName.trim() && typeof name === 'string' && name.trim()) {
          setValue('name', name);
        }
        if (!currentIntro.trim() && typeof intro === 'string') {
          setValue('intro', intro);
        }
      } catch {
        // JSON 编辑器负责展示格式错误；自动回填只在配置可解析时执行。
      }
    },
    [getValues, setValue]
  );

  const { loading: isFetching } = useRequest(
    async () => {
      const url = getUtmWorkflow();
      if (!url) return;

      const workflowData = await postFetchWorkflow({ url });
      const workflowStr = JSON.stringify(workflowData, null, 2);

      setValue('workflowStr', workflowStr);

      const utmParams = getUtmParams();
      if (utmParams.shortUrlContent && !getValues('name').trim()) {
        setValue('name', utmParams.shortUrlContent);
      }
      syncImportMetaToForm(workflowStr);
    },
    { manual: false }
  );

  const handleCloseJsonImportModal = () => {
    onClose();
    removeUtmParams();
    removeUtmWorkflow();
  };

  const avatar = useWatch({ control, name: 'avatar' }) || '';

  const { Component: AvatarUploader, handleFileSelectorOpen: handleAvatarSelectorOpen } =
    useUploadAvatar(getUploadAvatarPresignedUrl, {
      onSuccess(avatar) {
        setValue('avatar', avatar);
      }
    });

  // If the user does not select an avatar, it will follow the type to change
  const selectedAvatar = useMemo(() => {
    if (avatar) return avatar;

    const defaultType = scene === 'tool' ? AppTypeEnum.workflowTool : AppTypeEnum.simple;
    const defaultVal = createAppTypeMap[defaultType].icon;
    if (!workflowStr) return defaultVal;

    try {
      const workflow = JSON.parse(workflowStr);
      const type = resolveImportAppType(workflow);
      if (type && isDashboardImportAppTypeAllowed({ appType: type, scene })) {
        return createAppTypeMap[type].icon;
      }
      return defaultVal;
    } catch {
      return defaultVal;
    }
  }, [avatar, scene, workflowStr]);

  const { runAsync: onSubmit, loading: isCreating } = useRequest(
    async ({ name, intro, workflowStr }: FormType) => {
      if ((intro || '').length > 500) {
        throw new Error(t('app:app_intro_too_long'));
      }

      let config: unknown;
      try {
        config = JSON.parse(workflowStr);
      } catch {
        throw new Error(t('app:invalid_json_format'));
      }

      const { workflow, appType } = parseDashboardImportConfig({
        config,
        scene,
        t
      });

      return postCreateApp({
        parentId,
        avatar: selectedAvatar,
        name: (name || '').trim() || t('app:unnamed_app'),
        intro: (intro || '').trim(),
        type: appType,
        modules: workflow.nodes,
        edges: workflow.edges || [],
        chatConfig: workflow.chatConfig,
        utmParams: getUtmParams()
      });
    },
    {
      refreshDeps: [selectedAvatar],
      onSuccess(id: string) {
        router.push(`/app/detail?appId=${id}`);
        loadMyApps();
        handleCloseJsonImportModal();
      },
      successToast: t('common:create_success')
    }
  );

  return (
    <>
      <MyModal
        isOpen
        onClose={handleCloseJsonImportModal}
        isLoading={isCreating || isFetching}
        title={t('app:type.Import from json')}
        size={'md'}
        isCentered
        closeOnOverlayClick={false}
        footer={
          <>
            <Button size={'md'} variant={'whiteBase'} onClick={handleCloseJsonImportModal}>
              {t('common:Cancel')}
            </Button>
            <Button size={'md'} onClick={handleSubmit(onSubmit)}>
              {t('common:Confirm')}
            </Button>
          </>
        }
      >
        <Flex flexDirection={'column'} gap={4}>
          <ImportAppConfigEditor
            value={workflowStr}
            onChange={(value) => setValue('workflowStr', value)}
            onBlur={syncImportMetaToForm}
            onFileChange={syncImportMetaToForm}
            rows={12}
            textareaHeight={'150px'}
          />

          <Box>
            <Box mb={2} fontSize={'sm'} color={'myGray.900'} fontWeight={'500'}>
              {t('app:avatar_and_name')}
            </Box>
            <Flex alignItems={'center'}>
              <MyTooltip label={t('common:set_avatar')}>
                <Flex
                  flexShrink={0}
                  w={'32px'}
                  h={'32px'}
                  border={'1px solid'}
                  borderColor={'myGray.200'}
                  justifyContent={'center'}
                  alignItems={'center'}
                  p={'4px'}
                  cursor={'pointer'}
                  borderRadius={'4px'}
                  onClick={handleAvatarSelectorOpen}
                >
                  <Avatar src={selectedAvatar} w={'24px'} borderRadius={'4px'} />
                </Flex>
              </MyTooltip>
              <Input
                flex={1}
                ml={3}
                h={'32px'}
                bg={'white'}
                placeholder={t('app:unnamed_app')}
                {...register('name')}
              />
            </Flex>
          </Box>

          <Box>
            <Box mb={2} fontSize={'sm'} color={'myGray.900'} fontWeight={'500'}>
              {t('app:app_intro')}
            </Box>
            <Textarea
              h={'60px'}
              minH={'60px'}
              resize={'none'}
              bg={'white'}
              placeholder={t('app:app_intro_placeholder')}
              {...register('intro')}
            />
          </Box>
        </Flex>
      </MyModal>
      <AvatarUploader />
    </>
  );
};

export default JsonImportModal;
