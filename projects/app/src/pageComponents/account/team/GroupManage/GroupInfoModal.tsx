import { Input, HStack, ModalBody, Button, ModalFooter } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import Avatar from '@fastgpt/web/components/common/Avatar';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { useTranslation } from 'next-i18next';
import React from 'react';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useForm } from 'react-hook-form';
import { postCreateGroup, putUpdateGroup } from '@/web/support/user/team/group/api';
import { DEFAULT_TEAM_AVATAR } from '@fastgpt/global/common/system/constants';
import { type MemberGroupListItemType } from '@fastgpt/global/support/permission/memberGroup/type';

export type GroupFormType = {
  avatar: string;
  name: string;
};

function GroupInfoModal({
  onClose,
  editGroup,
  onSuccess
}: {
  onClose: () => void;
  editGroup?: MemberGroupListItemType<true>;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();

  const {
    File: AvatarSelect,
    onOpen: onOpenSelectAvatar,
    onSelectImage
  } = useSelectFile({
    fileType: '.jpg, .jpeg, .png',
    multiple: false
  });

  const { register, handleSubmit, getValues, setValue } = useForm<GroupFormType>({
    defaultValues: {
      name: editGroup?.name || '',
      avatar: editGroup?.avatar || DEFAULT_TEAM_AVATAR
    }
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

  const { runAsync: onCreate, loading: isLoadingCreate } = useRequest2(
    (data: GroupFormType) => {
      return postCreateGroup({
        name: data.name,
        avatar: data.avatar
      });
    },
    {
      onSuccess: () => Promise.all([onClose(), onSuccess()])
    }
  );

  const { runAsync: onUpdate, loading: isLoadingUpdate } = useRequest2(
    async (data: GroupFormType) => {
      if (!editGroup) return;
      return putUpdateGroup({
        groupId: editGroup._id,
        name: data.name,
        avatar: data.avatar
      });
    },
    {
      onSuccess: () => Promise.all([onClose(), onSuccess()])
    }
  );

  const isLoading = isLoadingUpdate || isLoadingCreate || uploadingAvatar;

  return (
    <MyModal
      onClose={onClose}
      title={editGroup ? t('user:team.group.edit') : t('user:team.group.create')}
      iconSrc={editGroup?.avatar ?? DEFAULT_TEAM_AVATAR}
    >
      <ModalBody flex={1} overflow={'auto'} display={'flex'} flexDirection={'column'} gap={4}>
        <FormLabel>{t('user:team.avatar_and_name')}</FormLabel>
        <HStack>
          <Avatar
            src={getValues('avatar')}
            onClick={onOpenSelectAvatar}
            cursor={'pointer'}
            borderRadius={'md'}
          />
          <Input
            bgColor="myGray.50"
            {...register('name', { required: true })}
            placeholder={t('user:team.group.name')}
          />
        </HStack>
      </ModalBody>
      <ModalFooter alignItems="flex-end">
        <Button
          isLoading={isLoading}
          onClick={handleSubmit((data) => {
            if (editGroup) {
              onUpdate(data);
            } else {
              onCreate(data);
            }
          })}
        >
          {editGroup ? t('common:Save') : t('common:new_create')}
        </Button>
      </ModalFooter>
      <AvatarSelect onSelect={onSelectAvatar} />
    </MyModal>
  );
}

export default GroupInfoModal;
