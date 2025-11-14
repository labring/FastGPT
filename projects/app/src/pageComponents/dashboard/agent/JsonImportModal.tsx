import { Box, Button, Flex, Input, ModalBody, ModalFooter } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import { createAppTypeMap } from '@/pageComponents/app/constants';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { useMemo } from 'react';
import { getAppType } from '@fastgpt/global/core/app/utils';
import { useContextSelector } from 'use-context-selector';
import { AppListContext } from './context';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { postCreateApp } from '@/web/core/app/api';
import { useRouter } from 'next/router';
import { form2AppWorkflow } from '@/web/core/app/utils';
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

type FormType = {
  avatar: string;
  name: string;
  workflowStr: string;
};

const JsonImportModal = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  const { parentId, loadMyApps } = useContextSelector(AppListContext, (v) => v);
  const router = useRouter();

  const { register, setValue, watch, handleSubmit } = useForm<FormType>({
    defaultValues: {
      avatar: '',
      name: '',
      workflowStr: ''
    }
  });
  const workflowStr = watch('workflowStr');

  const { loading: isFetching } = useRequest2(
    async () => {
      const url = getUtmWorkflow();
      if (!url) return;

      const workflowData = await postFetchWorkflow({ url });

      setValue('workflowStr', JSON.stringify(workflowData, null, 2));

      const utmParams = getUtmParams();
      if (utmParams.shortUrlContent) setValue('name', utmParams.shortUrlContent);
    },
    { manual: false }
  );

  const handleCloseJsonImportModal = () => {
    onClose();
    removeUtmParams();
    removeUtmWorkflow();
  };

  const avatar = watch('avatar');

  const { Component: AvatarUploader, handleFileSelectorOpen: handleAvatarSelectorOpen } =
    useUploadAvatar(getUploadAvatarPresignedUrl, {
      onSuccess(avatar) {
        setValue('avatar', avatar);
      }
    });

  // If the user does not select an avatar, it will follow the type to change
  const selectedAvatar = useMemo(() => {
    if (avatar) return avatar;

    const defaultVal = createAppTypeMap[AppTypeEnum.simple].icon;
    if (!workflowStr) return defaultVal;

    try {
      const workflow = JSON.parse(workflowStr);
      const type = getAppType(workflow);
      if (type) return createAppTypeMap[type].icon;
      return defaultVal;
    } catch (err) {
      return defaultVal;
    }
  }, [avatar, workflowStr]);

  const { runAsync: onSubmit, loading: isCreating } = useRequest2(
    async ({ name, workflowStr }: FormType) => {
      const { workflow, appType } = await (async () => {
        try {
          const workflow = JSON.parse(workflowStr);
          const appType = getAppType(workflow);

          if (!appType) {
            return Promise.reject(t('app:type_not_recognized'));
          }

          if (appType === AppTypeEnum.simple) {
            return {
              workflow: form2AppWorkflow(workflow, t),
              appType
            };
          }

          return {
            workflow,
            appType
          };
        } catch (err) {
          return Promise.reject(t('app:invalid_json_format'));
        }
      })();

      return postCreateApp({
        parentId,
        avatar: selectedAvatar,
        name,
        type: appType,
        modules: workflow.nodes,
        edges: workflow.edges,
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
        isLoading={isCreating || isFetching}
        title={t('app:type.Import from json')}
        iconSrc="common/importLight"
        iconColor={'primary.600'}
      >
        <ModalBody>
          <Box color={'myGray.800'} fontWeight={'bold'}>
            {t('common:input_name')}
          </Box>
          <Flex mt={2} alignItems={'center'}>
            <MyTooltip label={t('common:set_avatar')}>
              <Avatar
                flexShrink={0}
                src={selectedAvatar}
                w={['1.75rem', '2.25rem']}
                h={['1.75rem', '2.25rem']}
                cursor={'pointer'}
                borderRadius={'md'}
                onClick={handleAvatarSelectorOpen}
              />
            </MyTooltip>
            <Input
              flex={1}
              ml={3}
              autoFocus
              bg={'myWhite.600'}
              {...register('name', {
                required: t('common:core.app.error.App name can not be empty')
              })}
            />
          </Flex>
          <Box mt={5}>
            <ImportAppConfigEditor
              value={workflowStr}
              onChange={(e) => setValue('workflowStr', e)}
              rows={10}
            />
          </Box>
        </ModalBody>
        <ModalFooter gap={4}>
          <Button variant={'whiteBase'} onClick={handleCloseJsonImportModal}>
            {t('common:Cancel')}
          </Button>
          <Button onClick={handleSubmit(onSubmit)}>{t('common:Confirm')}</Button>
        </ModalFooter>
      </MyModal>
      <AvatarUploader />
    </>
  );
};

export default JsonImportModal;
