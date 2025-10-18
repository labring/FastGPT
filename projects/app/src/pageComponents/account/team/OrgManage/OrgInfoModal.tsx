import { getUploadAvatarPresignedUrl } from '@/web/common/file/api';
import { postCreateOrg, putUpdateOrg } from '@/web/support/user/team/org/api';
import { Button, HStack, Input, ModalBody, ModalFooter, Textarea } from '@chakra-ui/react';
import { DEFAULT_ORG_AVATAR } from '@fastgpt/global/common/system/constants';
import { useUploadAvatar } from '@fastgpt/web/common/file/hooks/useUploadAvatar';
import Avatar from '@fastgpt/web/components/common/Avatar';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';

export type OrgFormType = {
  _id: string;
  avatar: string;
  description?: string;
  name: string;
  path?: string;
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
  onSuccess,
  updateCurrentOrg,
  parentId
}: {
  editOrg: OrgFormType;
  onClose: () => void;
  onSuccess: () => void;
  updateCurrentOrg: (data: { name?: string; avatar?: string; description?: string }) => void;
  parentId?: string;
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
      if (parentId === undefined) return;
      return postCreateOrg({
        name: data.name,
        avatar: data.avatar,
        orgId: parentId,
        description: data.description
      });
    },
    {
      successToast: t('common:create_success'),
      onSuccess: () => {
        onClose();
        onSuccess();
      }
    }
  );

  const { runAsync: onUpdate, loading: isLoadingUpdate } = useRequest2(
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
      successToast: t('common:update_success'),
      onSuccess: () => {
        onClose();
        onSuccess();
      }
    }
  );

  const {
    Component: AvatarUploader,
    uploading: uploadingAvatar,
    handleFileSelectorOpen: handleAvatarSelectorOpen
  } = useUploadAvatar(getUploadAvatarPresignedUrl, {
    onSuccess: (avatar) => {
      setValue('avatar', avatar);
    }
  });

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
            onClick={handleAvatarSelectorOpen}
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
              onUpdate(data).then(() => {
                updateCurrentOrg(data);
              });
            } else {
              onCreate(data);
            }
          })}
        >
          {isEdit ? t('common:Save') : t('common:new_create')}
        </Button>
      </ModalFooter>
      <AvatarUploader />
    </MyModal>
  );
}

export default OrgInfoModal;
