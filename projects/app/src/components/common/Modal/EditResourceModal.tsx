import React, { useCallback } from 'react';
import { ModalFooter, ModalBody, Input, Button, Box, Textarea, HStack } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal/index';
import { useTranslation } from 'next-i18next';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { useForm } from 'react-hook-form';
import { compressImgFileAndUpload } from '@/web/common/file/controller';
import { MongoImageTypeEnum } from '@fastgpt/global/common/file/image/constants';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { getErrText } from '@fastgpt/global/common/error/utils';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useToast } from '@fastgpt/web/hooks/useToast';

export type EditResourceInfoFormType = {
  id: string;
  name: string;
  avatar?: string;
  intro?: string;
};

const EditResourceModal = ({
  onClose,
  onEdit,
  title,
  ...defaultForm
}: EditResourceInfoFormType & {
  title: string;
  onClose: () => void;
  onEdit: (data: EditResourceInfoFormType) => any;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { register, watch, setValue, handleSubmit } = useForm<EditResourceInfoFormType>({
    defaultValues: defaultForm
  });
  const avatar = watch('avatar');

  const { runAsync: onSave, loading } = useRequest2(
    (data: EditResourceInfoFormType) => onEdit(data),
    {
      onSuccess: (res) => {
        onClose();
      }
    }
  );

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
          title: getErrText(err, t('common:common.error.Select avatar failed')),
          status: 'warning'
        });
      }
    },
    [setValue, t, toast]
  );

  return (
    <MyModal isOpen onClose={onClose} iconSrc={avatar} title={title}>
      <ModalBody>
        <Box>
          <FormLabel mb={1}>{t('common:core.app.Name and avatar')}</FormLabel>
          <HStack spacing={4}>
            <MyTooltip label={t('common:common.Set Avatar')}>
              <Avatar
                flex={'0 0 2rem'}
                src={avatar}
                w={'2rem'}
                h={'2rem'}
                cursor={'pointer'}
                borderRadius={'sm'}
                onClick={onOpenSelectFile}
              />
            </MyTooltip>
            <Input
              {...register('name', { required: true })}
              bg={'myGray.50'}
              autoFocus
              maxLength={20}
            />
          </HStack>
        </Box>
        <Box mt={4}>
          <FormLabel mb={1}>{t('common:common.Intro')}</FormLabel>
          <Textarea {...register('intro')} bg={'myGray.50'} maxLength={200} />
        </Box>
      </ModalBody>
      <ModalFooter>
        <Button isLoading={loading} onClick={handleSubmit(onSave)} px={6}>
          {t('common:common.Confirm')}
        </Button>
      </ModalFooter>

      <File onSelect={onSelectFile} />
    </MyModal>
  );
};

export default EditResourceModal;
