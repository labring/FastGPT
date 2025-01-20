import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { postCreateOrg, putUpdateOrg } from '@/web/support/user/team/org/api';
import { Button, HStack, Input, ModalBody, ModalFooter, Textarea } from '@chakra-ui/react';
import { DEFAULT_ORG_AVATAR } from '@fastgpt/global/common/system/constants';
import Avatar from '@fastgpt/web/components/common/Avatar';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import dynamic from 'next/dynamic';
import { useForm } from 'react-hook-form';

export type OrgFormType = {
  _id: string;
  avatar: string;
  description?: string;
  name: string;
  path: string;
  parentId?: string;
};

export const defaultOrgForm: OrgFormType = {
  _id: '',
  avatar: '',
  description: '',
  name: '',
  path: ''
};

function OrgInfoModal({
  editOrg,
  onClose,
  onSuccess
}: {
  editOrg: OrgFormType;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();

  const isEdit = !!editOrg._id;

  const { register, handleSubmit, setValue, watch } = useForm<OrgFormType>({
    defaultValues: {
      name: editOrg.name,
      avatar: editOrg.avatar,
      description: editOrg.description
    }
  });
  const avatar = watch('avatar');

  const { run: onCreate, loading: isLoadingCreate } = useRequest2(
    async (data: OrgFormType) => {
      if (!editOrg.parentId) return;
      return postCreateOrg({
        name: data.name,
        avatar: data.avatar,
        parentId: editOrg.parentId,
        description: data.description
      });
    },
    {
      successToast: t('common:common.Create Success'),
      onSuccess: () => {
        onClose();
        onSuccess();
      }
    }
  );

  const { run: onUpdate, loading: isLoadingUpdate } = useRequest2(
    async (data: OrgFormType) => {
      if (!editOrg._id) return;
      return putUpdateOrg({
        orgId: editOrg._id,
        name: data.name,
        avatar: data.avatar,
        description: data.description
      });
    },
    {
      successToast: t('common:common.Update Success'),
      onSuccess: () => {
        onClose();
        onSuccess();
      }
    }
  );

  const {
    File: AvatarSelect,
    onOpen: onOpenSelectAvatar,
    onSelectImage
  } = useSelectFile({
    fileType: '.jpg, .jpeg, .png',
    multiple: false
  });
  const { loading: uploadingAvatar, run: onSelectAvatar } = useRequest2(
    async (file: File[]) => {
      return onSelectImage(file, {
        maxW: 300,
        maxH: 300
      });
    },
    {
      onSuccess: (src: string) => {
        setValue('avatar', src);
      }
    }
  );

  const isLoading = uploadingAvatar || isLoadingUpdate || isLoadingCreate;

  return (
    <MyModal
      isOpen
      onClose={onClose}
      title={isEdit ? t('account_team:edit_org_info') : t('account_team:create_org')}
      iconSrc={'modal/edit'}
    >
      <ModalBody flex={1} overflow={'auto'} display={'flex'} flexDirection={'column'} gap={4}>
        <FormLabel w="80px">{t('user:team.avatar_and_name')}</FormLabel>
        <HStack>
          <Avatar
            src={avatar || DEFAULT_ORG_AVATAR}
            onClick={onOpenSelectAvatar}
            cursor={'pointer'}
            borderRadius={'md'}
          />
          <Input
            bgColor="myGray.50"
            {...register('name', { required: true })}
            placeholder={t('account_team:org_name')}
          />
        </HStack>
        <FormLabel w="80px">{t('account_team:org_description')}</FormLabel>
        <Textarea
          bgColor="myGray.50"
          {...register('description')}
          placeholder={t('account_team:org_description')}
        />
      </ModalBody>
      <ModalFooter alignItems="flex-end">
        <Button
          isLoading={isLoading}
          onClick={handleSubmit((data) => {
            if (isEdit) {
              onUpdate(data);
            } else {
              onCreate(data);
            }
          })}
        >
          {isEdit ? t('common:common.Save') : t('common:new_create')}
        </Button>
      </ModalFooter>
      <AvatarSelect onSelect={onSelectAvatar} />
    </MyModal>
  );
}

export default OrgInfoModal;
