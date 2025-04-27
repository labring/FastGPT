import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { Box, Button, Flex, Input, ModalBody, ModalFooter, Spinner, Text } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import { appTypeMap } from '@/pageComponents/app/constants';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { useEffect, useMemo, useState } from 'react';
import { getAppType } from '@fastgpt/global/core/app/utils';
import { useContextSelector } from 'use-context-selector';
import { AppListContext } from './context';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { postCreateApp } from '@/web/core/app/api';
import { useRouter } from 'next/router';
import { form2AppWorkflow } from '@/web/core/app/utils';
import ImportAppConfigEditor from '@/pageComponents/app/ImportAppConfigEditor';
import { fetchWorkflowFromUrl } from '@/web/core/app/workflow';
import { useToast } from '@fastgpt/web/hooks/useToast';

type FormType = {
  avatar: string;
  name: string;
  workflowStr: string;
};

type UTMParams = {
  keyword?: string;
  source?: string;
  medium?: string;
  content?: string;
};

const JsonImportModal = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  const { parentId, loadMyApps } = useContextSelector(AppListContext, (v) => v);
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');

  const { register, setValue, watch, handleSubmit } = useForm<FormType>({
    defaultValues: {
      avatar: '',
      name: '',
      workflowStr: ''
    }
  });
  const workflowStr = watch('workflowStr');

  // 检查并获取utm_workflow
  useEffect(() => {
    const isBrowser = typeof window !== 'undefined';
    if (!isBrowser) return;

    const checkWorkflow = async () => {
      try {
        const url = sessionStorage.getItem('utm_workflow');
        if (!url) return;

        try {
          const workflowData = await fetchWorkflowFromUrl(url);

          if (!workflowData) {
            throw new Error('无法获取工作流数据');
          }

          setValue('workflowStr', JSON.stringify(workflowData, null, 2));

          try {
            const utmParamsStr = localStorage.getItem('utm_params');
            if (utmParamsStr) {
              const params = JSON.parse(utmParamsStr) as UTMParams;
              if (params.content) setValue('name', params.content);
            }
          } catch (error) {
            console.error('解析utm_params出错:', error);
          }

          sessionStorage.removeItem('utm_workflow');
        } catch (error) {
          console.error('获取工作流数据失败:', error);
        }
      } catch (error) {
        console.error('检查工作流URL出错:', error);
      }
    };

    checkWorkflow();
  }, []);

  const avatar = watch('avatar');
  const {
    File,
    onOpen: onOpenSelectFile,
    onSelectImage
  } = useSelectFile({
    fileType: '.jpg,.png',
    multiple: false
  });
  // If the user does not select an avatar, it will follow the type to change
  const selectedAvatar = useMemo(() => {
    if (avatar) return avatar;

    const defaultVal = appTypeMap[AppTypeEnum.simple].avatar;
    if (!workflowStr) return defaultVal;

    try {
      const workflow = JSON.parse(workflowStr);
      const type = getAppType(workflow);
      if (type) return appTypeMap[type].avatar;
      return defaultVal;
    } catch (err) {
      return defaultVal;
    }
  }, [avatar, workflowStr]);

  const { runAsync: onSubmit, loading: isCreating } = useRequest2(
    async ({ name, workflowStr }: FormType) => {
      const utmParamsStr = sessionStorage.getItem('utm_params');
      let utmParams: UTMParams | null = null;
      sessionStorage.removeItem('utm_params');
      try {
        if (utmParamsStr) {
          utmParams = JSON.parse(utmParamsStr);
        }
      } catch (error) {
        console.error('解析utm_params出错:', error);
      }

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
        utm_platform: utmParams?.medium,
        utm_projectcode: utmParams?.content
      });
    },
    {
      refreshDeps: [selectedAvatar],
      onSuccess(id: string) {
        router.push(`/app/detail?appId=${id}`);
        loadMyApps();
        onClose();
      },
      successToast: t('common:common.Create Success')
    }
  );

  return (
    <>
      <MyModal
        isOpen
        onClose={onClose}
        isLoading={isCreating}
        title={t('app:type.Import from json')}
        iconSrc="common/importLight"
        iconColor={'primary.600'}
      >
        <ModalBody>
          {isLoading ? (
            <Flex direction="column" align="center" justify="center" py={8}>
              <Spinner size="xl" color="blue.500" mb={4} />
              <Text>{loadingStatus}</Text>
            </Flex>
          ) : (
            <>
              <Box color={'myGray.800'} fontWeight={'bold'}>
                {t('common:common.Set Name')}
              </Box>
              <Flex mt={2} alignItems={'center'}>
                <MyTooltip label={t('common:common.Set Avatar')}>
                  <Avatar
                    flexShrink={0}
                    src={selectedAvatar}
                    w={['1.75rem', '2.25rem']}
                    h={['1.75rem', '2.25rem']}
                    cursor={'pointer'}
                    borderRadius={'md'}
                    onClick={onOpenSelectFile}
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
            </>
          )}
        </ModalBody>
        <ModalFooter gap={4}>
          <Button variant={'whiteBase'} onClick={onClose}>
            {t('common:common.Cancel')}
          </Button>
          <Button onClick={handleSubmit(onSubmit)} isDisabled={isLoading}>
            {t('common:common.Confirm')}
          </Button>
        </ModalFooter>
      </MyModal>
      <File
        onSelect={(e) =>
          onSelectImage(e, {
            maxH: 300,
            maxW: 300,
            callback: (e) => setValue('avatar', e)
          })
        }
      />
    </>
  );
};

export default JsonImportModal;
