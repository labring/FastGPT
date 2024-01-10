import React, { useCallback, useState } from 'react';
import { Box, Flex, Button, ModalBody, Input, Textarea, IconButton } from '@chakra-ui/react';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { useForm } from 'react-hook-form';
import { compressImgFileAndUpload } from '@/web/common/file/controller';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useToast } from '@/web/common/hooks/useToast';
import { useRouter } from 'next/router';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useRequest } from '@/web/common/hooks/useRequest';
import { delOnePlugin, postCreatePlugin, putUpdatePlugin } from '@/web/core/plugin/api';
import Avatar from '@/components/Avatar';
import MyTooltip from '@/components/MyTooltip';
import MyModal from '@/components/MyModal';
import { useTranslation } from 'next-i18next';
import { useConfirm } from '@/web/common/hooks/useConfirm';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { CreateOnePluginParams } from '@fastgpt/global/core/plugin/controller';
import { customAlphabet } from 'nanoid';
import { MongoImageTypeEnum } from '@fastgpt/global/common/file/image/constants';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 12);

export type FormType = CreateOnePluginParams & {
  id?: string;
};
export const defaultForm: FormType = {
  avatar: '/icon/logo.svg',
  name: '',
  intro: '',
  modules: [
    {
      moduleId: nanoid(),
      name: '定义插件输入',
      avatar: '/imgs/module/input.png',
      flowType: 'pluginInput',
      showStatus: false,
      position: {
        x: 616.4226348688949,
        y: -165.05298493910115
      },
      inputs: [],
      outputs: []
    },
    {
      moduleId: nanoid(),
      name: '定义插件输出',
      avatar: '/imgs/module/output.png',
      flowType: 'pluginOutput',
      showStatus: false,
      position: {
        x: 1607.7142331269126,
        y: -151.8669210746189
      },
      inputs: [],
      outputs: []
    }
  ]
};

const CreateModal = ({
  defaultValue = defaultForm,
  onClose,
  onSuccess,
  onDelete
}: {
  defaultValue?: FormType;
  onClose: () => void;
  onSuccess: () => void;
  onDelete: () => void;
}) => {
  const { t } = useTranslation();
  const [refresh, setRefresh] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const { isPc } = useSystemStore();
  const { openConfirm, ConfirmModal } = useConfirm({
    title: t('common.Delete Tip'),
    content: t('plugin.Confirm Delete')
  });

  const { register, setValue, getValues, handleSubmit } = useForm<FormType>({
    defaultValues: defaultValue
  });

  const { File, onOpen: onOpenSelectFile } = useSelectFile({
    fileType: 'image/*',
    multiple: false
  });

  const onSelectFile = useCallback(
    async (e: File[]) => {
      const file = e[0];
      if (!file) return;
      try {
        const src = await compressImgFileAndUpload({
          type: MongoImageTypeEnum.pluginAvatar,
          file,
          maxW: 300,
          maxH: 300
        });
        setValue('avatar', src);
        setRefresh((state) => !state);
      } catch (err: any) {
        toast({
          title: getErrText(err, t('common.Select File Failed')),
          status: 'warning'
        });
      }
    },
    [setValue, t, toast]
  );

  const { mutate: onclickCreate, isLoading: creating } = useRequest({
    mutationFn: async (data: FormType) => {
      return postCreatePlugin(data);
    },
    onSuccess(id: string) {
      router.push(`/plugin/edit?pluginId=${id}`);
      onSuccess();
      onClose();
    },
    successToast: t('common.Create Success'),
    errorToast: t('common.Create Failed')
  });
  const { mutate: onclickUpdate, isLoading: updating } = useRequest({
    mutationFn: async (data: FormType) => {
      if (!data.id) return Promise.resolve('');
      // @ts-ignore
      return putUpdatePlugin(data);
    },
    onSuccess() {
      onSuccess();
      onClose();
    },
    successToast: t('common.Update Success'),
    errorToast: t('common.Update Failed')
  });

  const onclickDelApp = useCallback(async () => {
    if (!defaultValue.id) return;
    try {
      await delOnePlugin(defaultValue.id);
      toast({
        title: t('common.Delete Success'),
        status: 'success'
      });
      onDelete();
    } catch (err: any) {
      toast({
        title: getErrText(err, t('common.Delete Failed')),
        status: 'error'
      });
    }
    onClose();
  }, [defaultValue.id, onClose, toast, t, onDelete]);

  return (
    <MyModal
      isOpen
      onClose={onClose}
      iconSrc="/imgs/modal/edit.svg"
      title={defaultValue.id ? t('plugin.Update Your Plugin') : t('plugin.Create Your Plugin')}
      isCentered={!isPc}
    >
      <ModalBody>
        <Box color={'myGray.800'} fontWeight={'bold'}>
          {t('plugin.Set Name')}
        </Box>
        <Flex mt={3} alignItems={'center'}>
          <MyTooltip label={t('common.Set Avatar')}>
            <Avatar
              flexShrink={0}
              src={getValues('avatar')}
              w={['28px', '32px']}
              h={['28px', '32px']}
              cursor={'pointer'}
              borderRadius={'md'}
              onClick={onOpenSelectFile}
            />
          </MyTooltip>
          <Input
            flex={1}
            ml={4}
            autoFocus={!defaultValue.id}
            bg={'myWhite.600'}
            {...register('name', {
              required: t("common.Name Can't Be Empty")
            })}
          />
        </Flex>
        <Box mt={3}>
          <Box mb={1}>{t('plugin.Intro')}</Box>
          <Textarea {...register('intro')} bg={'myWhite.600'} rows={5} />
        </Box>
      </ModalBody>

      <Flex px={5} py={4} alignItems={'center'}>
        {!!defaultValue.id && (
          <IconButton
            className="delete"
            size={'xsSquare'}
            icon={<MyIcon name={'delete'} w={'14px'} />}
            variant={'whiteDanger'}
            aria-label={'delete'}
            _hover={{
              bg: 'red.100'
            }}
            onClick={(e) => {
              e.stopPropagation();
              openConfirm(onclickDelApp)();
            }}
          />
        )}
        <Box flex={1} />
        <Button variant={'whiteBase'} mr={3} onClick={onClose}>
          {t('common.Close')}
        </Button>
        {!!defaultValue.id ? (
          <Button isLoading={updating} onClick={handleSubmit((data) => onclickUpdate(data))}>
            {t('common.Confirm Update')}
          </Button>
        ) : (
          <Button isLoading={creating} onClick={handleSubmit((data) => onclickCreate(data))}>
            {t('common.Confirm Create')}
          </Button>
        )}
      </Flex>

      <File onSelect={onSelectFile} />
      <ConfirmModal />
    </MyModal>
  );
};

export default CreateModal;
