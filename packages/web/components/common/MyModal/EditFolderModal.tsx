import React, { useMemo } from 'react';
import { Input, Button, Box, Textarea, Flex } from '@chakra-ui/react';
import MyModal from '../../v2/common/MyModal';
import { useTranslation } from 'next-i18next';
import { useRequest } from '../../../hooks/useRequest';
import FormLabel from '../MyBox/FormLabel';
import RadioGroup from '../Radio/RadioGroup';
import QuestionTip from '../MyTooltip/QuestionTip';
import { useForm, useWatch } from 'react-hook-form';

export type EditFolderFormType = {
  id?: string;
  name?: string;
  intro?: string;
  inheritPermission?: boolean;
};
type CommitType = {
  name: string;
  intro?: string;
  inheritPermission?: boolean;
};

const EditFolderModal = ({
  onClose,
  onCreate,
  onEdit,
  id,
  name,
  intro,
  showInheritPermission = false
}: EditFolderFormType & {
  onClose: () => void;
  onCreate: (data: CommitType) => any;
  onEdit: (data: CommitType & { id: string }) => any;
  showInheritPermission?: boolean;
}) => {
  const { t } = useTranslation();
  const isEdit = !!id;
  const { register, handleSubmit, setValue, control } = useForm<EditFolderFormType>({
    defaultValues: {
      name,
      intro,
      inheritPermission: true
    }
  });

  const inheritPermission = useWatch({ control, name: 'inheritPermission' });

  const typeMap = useMemo(
    () =>
      isEdit
        ? {
            title: t('common:dataset.Edit Folder')
          }
        : {
            title: t('common:dataset.Create Folder')
          },
    [isEdit, t]
  );

  const { run: onSave, loading } = useRequest(
    ({ name = '', intro, inheritPermission = true }: EditFolderFormType) => {
      const trimmedName = name.trim();
      if (!trimmedName) return;

      if (id) return onEdit({ id, name: trimmedName, intro });
      return onCreate({
        name: trimmedName,
        intro,
        ...(showInheritPermission ? { inheritPermission } : {})
      });
    },
    {
      onSuccess: () => {
        onClose();
      }
    }
  );

  return (
    <MyModal
      isOpen
      onClose={onClose}
      title={typeMap.title}
      size={'sm'}
      isCentered
      borderRadius={'10px'}
      closeOnOverlayClick={false}
      footer={
        <>
          <Button variant={'whiteBase'} onClick={onClose}>
            {t('common:Cancel')}
          </Button>
          <Button isLoading={loading} onClick={handleSubmit(onSave)}>
            {t('common:Confirm')}
          </Button>
        </>
      }
    >
      <Flex flexDirection={'column'} gap={6}>
        <Box>
          <FormLabel mb={2}>{t('common:input_name')}</FormLabel>
          <Input
            {...register('name', { required: true })}
            size={'sm'}
            autoFocus
            maxLength={100}
            placeholder={t('common:folder_name_placeholder')}
          />
        </Box>
        <Box>
          <FormLabel mb={2}>{t('common:folder_description')}</FormLabel>
          <Textarea
            {...register('intro')}
            h={'100px'}
            minH={'100px'}
            maxLength={200}
            resize={'vertical'}
            placeholder={t('common:folder_description_placeholder')}
          />
        </Box>
        {showInheritPermission && !isEdit && (
          <Box>
            <Flex alignItems={'center'} mb={2}>
              <FormLabel mb={0}>{t('common:permission.Folder permission')}</FormLabel>
              <QuestionTip
                ml={1}
                maxW={'240px'}
                label={t('common:permission.Folder permission tip')}
              />
            </Flex>
            <RadioGroup
              fontSize={'sm'}
              list={[
                {
                  title: 'common:permission.Follow parent folder',
                  value: true
                },
                {
                  title: 'common:permission.Only me',
                  value: false
                }
              ]}
              value={inheritPermission ?? true}
              onChange={(value) => setValue('inheritPermission', value)}
            />
          </Box>
        )}
      </Flex>
    </MyModal>
  );
};

export default EditFolderModal;
