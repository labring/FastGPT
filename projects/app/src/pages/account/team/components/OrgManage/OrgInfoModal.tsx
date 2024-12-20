import { compressImgFileAndUpload } from '@/web/common/file/controller';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { HStack, Input, ModalBody, ModalFooter, Button, Textarea } from '@chakra-ui/react';
import { MongoImageTypeEnum } from '@fastgpt/global/common/file/image/constants';
import { DEFAULT_ORG_AVATAR } from '@fastgpt/global/common/system/constants';
import { OrgType } from '@fastgpt/global/support/user/team/org/type';
import Avatar from '@fastgpt/web/components/common/Avatar';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'next-i18next';
import { postCreateOrg, putUpdateOrg } from '@/web/support/user/team/org/api';
import { useEffect } from 'react';

export type OrgFormType = {
  avatar?: string;
  description?: string;
  name: string;
};

function OrgInfoModal({
  editOrg,
  createOrgParentId: parentId,
  onClose,
  onSuccess
}: {
  editOrg?: OrgType;
  createOrgParentId?: string;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const { t } = useTranslation();
  const { File: AvatarSelect, onOpen: onOpenSelectAvatar } = useSelectFile({
    fileType: '.jpg, .jpeg, .png',
    multiple: false
  });

  const { register, handleSubmit, getValues, setValue } = useForm<OrgFormType>({
    defaultValues: {
      name: '',
      avatar: undefined,
      description: undefined
    }
  });

  useEffect(() => {
    setValue('name', editOrg?.name ?? '');
    setValue('avatar', editOrg?.avatar);
    setValue('description', editOrg?.description);
    console.log(editOrg);
  }, [editOrg, setValue]);

  const { run: onCreate, loading: isLoadingCreate } = useRequest2(
    (data: OrgFormType, parentId: string) => {
      return postCreateOrg({
        name: data.name,
        avatar: data.avatar,
        parentId,
        description: data.description
      });
    },
    {
      onSuccess: () => {
        onClose();
        onSuccess?.();
      }
    }
  );

  const { run: onUpdate, loading: isLoadingUpdate } = useRequest2(
    (data: OrgFormType, orgId: string) => {
      return putUpdateOrg({
        orgId,
        name: data.name,
        avatar: data.avatar,
        description: data.description
      });
    },
    {
      onSuccess: () => {
        onClose();
        onSuccess?.();
      }
    }
  );

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

  const isLoading = uploadingAvatar;

  return (
    <MyModal
      isOpen={!!(editOrg || parentId)}
      onClose={onClose}
      title={editOrg ? t('account_team:edit_org_info') : t('account_team:create_org')}
      iconSrc={editOrg?.avatar || DEFAULT_ORG_AVATAR}
    >
      <ModalBody flex={1} overflow={'auto'} display={'flex'} flexDirection={'column'} gap={4}>
        <FormLabel w="80px">{t('user:team.avatar_and_name')}</FormLabel>
        <HStack>
          <Avatar
            src={getValues('avatar') || DEFAULT_ORG_AVATAR}
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
        <Textarea {...register('description')} placeholder={t('account_team:org_description')} />
      </ModalBody>
      <ModalFooter alignItems="flex-end">
        <Button
          isLoading={isLoading}
          onClick={handleSubmit((data) => {
            if (editOrg) {
              onUpdate(data, editOrg._id);
            } else if (parentId) {
              onCreate(data, parentId);
            }
          })}
        >
          {editOrg ? t('common:common.Save') : t('common:new_create')}
        </Button>
      </ModalFooter>
      <AvatarSelect onSelect={onSelectAvatar} />
    </MyModal>
  );
}

export default OrgInfoModal;
