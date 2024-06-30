import React, { useCallback, useRef } from 'react';
import {
  Box,
  Flex,
  Button,
  ModalFooter,
  ModalBody,
  Input,
  Grid,
  useTheme,
  Card
} from '@chakra-ui/react';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { useForm } from 'react-hook-form';
import { compressImgFileAndUpload } from '@/web/common/file/controller';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { postCreateApp } from '@/web/core/app/api';
import { useRouter } from 'next/router';
import { simpleBotTemplates, workflowTemplates, pluginTemplates } from '@/web/core/app/templates';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import Avatar from '@/components/Avatar';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { MongoImageTypeEnum } from '@fastgpt/global/common/file/image/constants';
import { useContextSelector } from 'use-context-selector';
import { AppListContext } from './context';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { useI18n } from '@/web/context/I18n';

type FormType = {
  avatar: string;
  name: string;
  templateId: string;
};

export type CreateAppType = AppTypeEnum.simple | AppTypeEnum.workflow | AppTypeEnum.plugin;

const CreateModal = ({ onClose, type }: { type: CreateAppType; onClose: () => void }) => {
  const { t } = useTranslation();
  const { appT } = useI18n();
  const { toast } = useToast();
  const router = useRouter();
  const { parentId, loadMyApps } = useContextSelector(AppListContext, (v) => v);
  const { isPc } = useSystemStore();

  const typeMap = useRef({
    [AppTypeEnum.simple]: {
      icon: 'core/app/simpleBot',
      title: appT('type.Create simple bot'),
      avatar: '/imgs/app/avatar/simple.svg',
      templates: simpleBotTemplates
    },
    [AppTypeEnum.workflow]: {
      icon: 'core/app/type/workflowFill',
      avatar: '/imgs/app/avatar/workflow.svg',
      title: appT('type.Create workflow bot'),
      templates: workflowTemplates
    },
    [AppTypeEnum.plugin]: {
      icon: 'core/app/type/pluginFill',
      avatar: '/imgs/app/avatar/plugin.svg',
      title: appT('type.Create plugin bot'),
      templates: pluginTemplates
    }
  });
  const typeData = typeMap.current[type];

  const { register, setValue, watch, handleSubmit } = useForm<FormType>({
    defaultValues: {
      avatar: typeData.avatar,
      name: '',
      templateId: typeData.templates[0].id
    }
  });
  const avatar = watch('avatar');
  const templateId = watch('templateId');

  const { File, onOpen: onOpenSelectFile } = useSelectFile({
    fileType: '.jpg,.png',
    multiple: false
  });

  const onSelectFile = useCallback(
    async (e: File[]) => {
      const file = e[0];
      if (!file) return;
      try {
        const src = await compressImgFileAndUpload({
          type: MongoImageTypeEnum.appAvatar,
          file,
          maxW: 300,
          maxH: 300
        });
        setValue('avatar', src);
      } catch (err: any) {
        toast({
          title: getErrText(err, t('common.error.Select avatar failed')),
          status: 'warning'
        });
      }
    },
    [setValue, t, toast]
  );

  const { mutate: onclickCreate, isLoading: creating } = useRequest({
    mutationFn: async (data: FormType) => {
      const template = typeData.templates.find((item) => item.id === data.templateId);
      if (!template) {
        return Promise.reject(t('core.dataset.error.Template does not exist'));
      }
      return postCreateApp({
        parentId,
        avatar: data.avatar || template.avatar,
        name: data.name,
        type: template.type,
        modules: template.modules || [],
        edges: template.edges || []
      });
    },
    onSuccess(id: string) {
      router.push(`/app/detail?appId=${id}`);
      loadMyApps();
      onClose();
    },
    successToast: t('common.Create Success'),
    errorToast: t('common.Create Failed')
  });

  return (
    <MyModal
      iconSrc={typeData.icon}
      title={typeData.title}
      isOpen
      onClose={onClose}
      isCentered={!isPc}
    >
      <ModalBody>
        <Box color={'myGray.800'} fontWeight={'bold'}>
          {t('common.Set Name')}
        </Box>
        <Flex mt={2} alignItems={'center'}>
          <MyTooltip label={t('common.Set Avatar')}>
            <Avatar
              flexShrink={0}
              src={avatar}
              w={['28px', '32px']}
              h={['28px', '32px']}
              cursor={'pointer'}
              borderRadius={'sm'}
              onClick={onOpenSelectFile}
            />
          </MyTooltip>
          <Input
            flex={1}
            ml={4}
            autoFocus
            bg={'myWhite.600'}
            {...register('name', {
              required: t('core.app.error.App name can not be empty')
            })}
          />
        </Flex>
        <Box mt={[4, 7]} mb={[0, 3]} color={'myGray.800'} fontWeight={'bold'}>
          {t('core.app.Select app from template')}
        </Box>
        <Grid
          userSelect={'none'}
          gridTemplateColumns={['repeat(1,1fr)', 'repeat(2,1fr)']}
          gridGap={[2, 4]}
        >
          {typeData.templates.map((item) => (
            <Card
              key={item.id}
              border={'base'}
              p={3}
              borderRadius={'md'}
              cursor={'pointer'}
              boxShadow={'sm'}
              {...(templateId === item.id
                ? {
                    bg: 'primary.50',
                    borderColor: 'primary.500'
                  }
                : {
                    _hover: {
                      boxShadow: 'md'
                    }
                  })}
              onClick={() => {
                setValue('templateId', item.id);
              }}
            >
              <Flex alignItems={'center'}>
                <Avatar src={item.avatar} borderRadius={'md'} w={'20px'} />
                <Box ml={3} color={'myGray.900'}>
                  {t(item.name)}
                </Box>
              </Flex>
              <Box fontSize={'xs'} mt={2} color={'myGray.600'}>
                {t(item.intro)}
              </Box>
            </Card>
          ))}
        </Grid>
      </ModalBody>

      <ModalFooter>
        <Button variant={'whiteBase'} mr={3} onClick={onClose}>
          {t('common.Close')}
        </Button>
        <Button px={6} isLoading={creating} onClick={handleSubmit((data) => onclickCreate(data))}>
          {t('common.Confirm Create')}
        </Button>
      </ModalFooter>

      <File onSelect={onSelectFile} />
    </MyModal>
  );
};

export default CreateModal;
