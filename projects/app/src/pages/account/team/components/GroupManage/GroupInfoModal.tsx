import { Input, HStack, ModalBody, Button, ModalFooter } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import Avatar from '@fastgpt/web/components/common/Avatar';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';

import { useTranslation } from 'next-i18next';
import React, { useMemo } from 'react';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { compressImgFileAndUpload } from '@/web/common/file/controller';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { MongoImageTypeEnum } from '@fastgpt/global/common/file/image/constants';
import { useForm } from 'react-hook-form';
import { useContextSelector } from 'use-context-selector';
import { TeamContext } from '../context';
import { postCreateGroup, putUpdateGroup } from '@/web/support/user/team/group/api';
import { DEFAULT_TEAM_AVATAR } from '@fastgpt/global/common/system/constants';

export type GroupFormType = {
  avatar: string;
  name: string;
};

function GroupInfoModal({ onClose, editGroupId }: { onClose: () => void; editGroupId?: string }) {
  const { refetchGroups, groups, refetchMembers } = useContextSelector(TeamContext, (v) => v);
  const { t } = useTranslation();
  const { File: AvatarSelect, onOpen: onOpenSelectAvatar } = useSelectFile({
    fileType: '.jpg, .jpeg, .png',
    multiple: false
  });

  const group = useMemo(() => {
    return groups.find((item) => item._id === editGroupId);
  }, [editGroupId, groups]);

  const { register, handleSubmit, getValues, setValue } = useForm<GroupFormType>({
    defaultValues: {
      name: group?.name || '',
      avatar: group?.avatar || DEFAULT_TEAM_AVATAR
    }
  });

  const { loading: uploadingAvatar, run: onSelectAvatar } = useRequest2(
    async (file: File[]) => {
      const src = await compressImgFileAndUpload({
        type: MongoImageTypeEnum.groupAvatar,
        file: file[0],
        maxW: 300,
        maxH: 300
      });
      return src;
    },
    {
      onSuccess: (src: string) => {
        setValue('avatar', src);
      }
    }
  );

  const { run: onCreate, loading: isLoadingCreate } = useRequest2(
    (data: GroupFormType) => {
      return postCreateGroup({
        name: data.name,
        avatar: data.avatar
      });
    },
    {
      onSuccess: () => Promise.all([onClose(), refetchGroups(), refetchMembers()])
    }
  );

  const { run: onUpdate, loading: isLoadingUpdate } = useRequest2(
    async (data: GroupFormType) => {
      if (!editGroupId) return;
      return putUpdateGroup({
        groupId: editGroupId,
        name: data.name,
        avatar: data.avatar
      });
    },
    {
      onSuccess: () => Promise.all([onClose(), refetchGroups(), refetchMembers()])
    }
  );

  const isLoading = isLoadingUpdate || isLoadingCreate || uploadingAvatar;

  return (
    <MyModal
      onClose={onClose}
      title={editGroupId ? t('user:team.group.edit') : t('user:team.group.create')}
      iconSrc={group?.avatar ?? DEFAULT_TEAM_AVATAR}
    >
      <ModalBody flex={1} overflow={'auto'} display={'flex'} flexDirection={'column'} gap={4}>
        <FormLabel w="80px">{t('user:team.avatar_and_name')}</FormLabel>
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
            if (editGroupId) {
              onUpdate(data);
            } else {
              onCreate(data);
            }
          })}
        >
          {editGroupId ? t('common:common.Save') : t('common:new_create')}
        </Button>
      </ModalFooter>
      <AvatarSelect onSelect={onSelectAvatar} />
    </MyModal>
  );
}

export default GroupInfoModal;
