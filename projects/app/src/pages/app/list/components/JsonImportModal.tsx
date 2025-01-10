import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { Box, Button, Flex, Input, ModalBody, ModalFooter } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import { appTypeMap } from './CreateModal';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { useEffect, useState } from 'react';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getAppType } from '@fastgpt/global/core/app/utils';
import { useContextSelector } from 'use-context-selector';
import { AppListContext } from './context';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { postCreateApp } from '@/web/core/app/api';
import { useRouter } from 'next/router';
import { form2AppWorkflow } from '@/web/core/app/utils';
import DragEditor from '@fastgpt/web/components/common/Textarea/DragEditor';

type FormType = {
  avatar: string;
  name: string;
  type: AppTypeEnum | '';
};

const JsonImportModal = ({ onClose }: { onClose: () => void }) => {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { isPc } = useSystem();
  const { parentId, loadMyApps } = useContextSelector(AppListContext, (v) => v);
  const router = useRouter();

  const { register, setValue, watch, handleSubmit } = useForm<FormType>({
    defaultValues: {
      avatar: appTypeMap[AppTypeEnum.simple].avatar,
      name: '',
      type: AppTypeEnum.simple
    }
  });
  const avatar = watch('avatar');

  const {
    File,
    onOpen: onOpenSelectFile,
    onSelectImage
  } = useSelectFile({
    fileType: '.jpg,.png',
    multiple: false
  });

  const { File: ConfigFile, onOpen: onOpenSelectConfigFile } = useSelectFile({
    fileType: 'json',
    multiple: false
  });

  const [workflowStr, setWorkflowStr] = useState('');

  const { runAsync: onSubmit, loading: isCreating } = useRequest2(
    async (data: FormType) => {
      if (!data.type) {
        return Promise.reject(t('app:type_not_recognized'));
      }

      let workflow;
      try {
        if (data.type === AppTypeEnum.simple) {
          const appForm = JSON.parse(workflowStr);
          workflow = form2AppWorkflow(appForm, t);
        } else {
          workflow = JSON.parse(workflowStr);
        }
      } catch (err) {
        return Promise.reject(t('app:invalid_json_format'));
      }

      return postCreateApp({
        parentId,
        avatar: data.avatar,
        name: data.name,
        type: data.type,
        modules: workflow.nodes,
        edges: workflow.edges,
        chatConfig: workflow.chatConfig
      });
    },
    {
      onSuccess(id: string) {
        router.push(`/app/detail?appId=${id}`);
        loadMyApps();
        onClose();
      },
      successToast: t('common:common.Create Success')
    }
  );

  useEffect(() => {
    try {
      const workflow = JSON.parse(workflowStr);
      const type = getAppType(workflow);
      setValue('type', type);
      if (type && !avatar.startsWith('/')) {
        setValue('avatar', appTypeMap[type].avatar);
      }
    } catch (err) {
      console.error(err);
    }
  }, [avatar, setValue, workflowStr]);

  return (
    <>
      <MyModal
        isOpen
        onClose={onClose}
        isLoading={isCreating}
        title={t('app:type.Import from json')}
        iconSrc="common/importLight"
        iconColor={'primary.600'}
        isCentered={!isPc}
        maxW={['90vw', '40rem']}
      >
        <ModalBody px={9}>
          <Box color={'myGray.800'} fontWeight={'bold'}>
            {t('common:common.Set Name')}
          </Box>
          <Flex mt={2} alignItems={'center'}>
            <MyTooltip label={t('common:common.Set Avatar')}>
              <Avatar
                flexShrink={0}
                src={avatar}
                w={['28px', '36px']}
                h={['28px', '36px']}
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
          <Flex mt={3} w={'458px'}>
            <DragEditor
              value={workflowStr}
              onChange={setWorkflowStr}
              rows={10}
              File={ConfigFile}
              onOpen={onOpenSelectConfigFile}
            />
          </Flex>
        </ModalBody>
        <ModalFooter>
          <Button onClick={handleSubmit(onSubmit)}>{t('common:add_new')}</Button>
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
