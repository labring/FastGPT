import React, { useState, useCallback } from 'react';
import {
  Box,
  Flex,
  Button,
  FormControl,
  Input,
  Textarea,
  ModalFooter,
  ModalBody
} from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { AppSchema } from '@fastgpt/global/core/app/type.d';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { compressImgFileAndUpload } from '@/web/common/file/controller';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import Avatar from '@/components/Avatar';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { MongoImageTypeEnum } from '@fastgpt/global/common/file/image/constants';
import MemberManager from '@/components/support/permission/MemberManager';
import {
  addAppCollaborators,
  deleteAppCollaborators,
  getCollaboratorList
} from '@/web/core/app/collaborator';
import { useQuery } from '@tanstack/react-query';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '@/web/core/app/context/appContext';
import MyTooltip from '@/components/MyTooltip';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import MySelect from '@fastgpt/web/components/common/MySelect';
import {
  AppDefaultPermission,
  AppPermission,
  AppPermissionList,
  AppReadPermission,
  AppWritePermission
} from '@fastgpt/service/support/permission/app/permission';
import { PermissionValueType } from '@fastgpt/service/support/permission/resourcePermission/permisson';
import { useAppStore } from '@/web/core/app/store/useAppStore';

enum defaultPermissionEnum {
  private = 'private',
  read = 'read',
  edit = 'edit'
}

const defaultPermissionSelectList = [
  { label: '仅协作者访问', value: defaultPermissionEnum.private },
  { label: '团队可访问', value: defaultPermissionEnum.read },
  { label: '团队可编辑', value: defaultPermissionEnum.edit }
];

const defaultPermissionMap = {
  [defaultPermissionEnum.private]: AppDefaultPermission.value,
  [defaultPermissionEnum.read]: AppReadPermission.value,
  [defaultPermissionEnum.edit]: AppWritePermission.value,
  [AppDefaultPermission.value]: defaultPermissionEnum.private,
  [AppReadPermission.value]: defaultPermissionEnum.read,
  [AppWritePermission.value]: defaultPermissionEnum.edit
};

const InfoModal = ({
  defaultApp,
  onClose,
  onSuccess
}: {
  defaultApp: AppSchema;
  onClose: () => void;
  onSuccess?: () => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { updateAppDetail } = useContextSelector(AppContext, (v) => v);

  const { File, onOpen: onOpenSelectFile } = useSelectFile({
    fileType: '.jpg,.png',
    multiple: false
  });

  const {
    register,
    setValue,
    getValues,
    formState: { errors },
    handleSubmit
  } = useForm({
    defaultValues: defaultApp
  });
  const [refresh, setRefresh] = useState(false);

  // submit config
  const { mutate: saveSubmitSuccess, isLoading: btnLoading } = useRequest({
    mutationFn: async (data: AppSchema) => {
      await updateAppDetail({
        name: data.name,
        avatar: data.avatar,
        intro: data.intro,
        defaultPermission: data.defaultPermission
      });
    },
    onSuccess() {
      onSuccess && onSuccess();
      onClose();
      toast({
        title: t('common.Update Success'),
        status: 'success'
      });
    },
    errorToast: t('common.Update Failed')
  });

  const saveSubmitError = useCallback(() => {
    // deep search message
    const deepSearch = (obj: any): string => {
      if (!obj) return t('common.Submit failed');
      if (!!obj.message) {
        return obj.message;
      }
      return deepSearch(Object.values(obj)[0]);
    };
    toast({
      title: deepSearch(errors),
      status: 'error',
      duration: 4000,
      isClosable: true
    });
  }, [errors, t, toast]);

  const saveUpdateModel = useCallback(
    () => handleSubmit((data) => saveSubmitSuccess(data), saveSubmitError)(),
    [handleSubmit, saveSubmitError, saveSubmitSuccess]
  );

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
        setRefresh((state) => !state);
      } catch (err: any) {
        toast({
          title: getErrText(err, t('common.error.Select avatar failed')),
          status: 'warning'
        });
      }
    },
    [setValue, t, toast]
  );

  const { data: CollaboratorList, refetch: refetchCollaboratorList } = useQuery(
    ['CollaboratorList'],
    () => {
      return getCollaboratorList(defaultApp._id);
    }
  );

  return (
    <MyModal
      isOpen={true}
      onClose={onClose}
      iconSrc="/imgs/workflow/ai.svg"
      title={t('core.app.setting')}
    >
      <ModalBody>
        <Box>{t('core.app.Name and avatar')}</Box>
        <Flex mt={2} alignItems={'center'}>
          <Avatar
            src={getValues('avatar')}
            w={['26px', '34px']}
            h={['26px', '34px']}
            cursor={'pointer'}
            borderRadius={'md'}
            mr={4}
            title={t('common.Set Avatar')}
            onClick={() => onOpenSelectFile()}
          />
          <FormControl>
            <Input
              bg={'myWhite.600'}
              placeholder={t('core.app.Set a name for your app')}
              {...register('name', {
                required: true
              })}
            ></Input>
          </FormControl>
        </Flex>
        <Box mt={4} mb={1}>
          {t('core.app.App intro')}
        </Box>
        {/* <Box color={'myGray.500'} mb={2} fontSize={'sm'}>
            该介绍主要用于记忆和在应用市场展示
          </Box> */}
        <Textarea
          rows={4}
          maxLength={500}
          placeholder={t('core.app.Make a brief introduction of your app')}
          bg={'myWhite.600'}
          {...register('intro')}
        />

        <Flex mt="4" mb="1" justifyContent="space-between" w="full" flexDirection="column">
          <Flex alignItems="center">
            默认权限
            <MyTooltip label={'默认权限相关文案'} forceShow>
              <QuestionOutlineIcon display={['none', 'inline']} ml={1} />
            </MyTooltip>
          </Flex>
          <MySelect
            mt="2"
            list={defaultPermissionSelectList}
            value={
              defaultPermissionMap[getValues('defaultPermission')] || defaultPermissionEnum.private
            }
            onchange={(v) => {
              setValue('defaultPermission', defaultPermissionMap[v]);
              setRefresh((state) => !state);
            }}
          />
        </Flex>

        <MemberManager
          collaboratorList={CollaboratorList}
          permissionList={AppPermissionList}
          addCollaborators={(tmbIds: string[], permission: PermissionValueType) => {
            const res = addAppCollaborators({
              tmbIds,
              permission,
              appId: defaultApp._id
            });
            refetchCollaboratorList();
            return res;
          }}
          permissionConfig={Object.entries(AppPermission).map(([_, value]) => {
            return {
              type: value.type,
              name: value.name,
              description: value.description,
              value: value.value
            };
          })}
          refetchCollaboratorList={() => {
            refetchCollaboratorList();
          }}
          deleteCollaborator={(tmbId: string) => {
            const res = deleteAppCollaborators({
              appId: defaultApp._id,
              tmbId
            });
            refetchCollaboratorList();
            return res;
          }}
        />
      </ModalBody>

      <ModalFooter>
        <Button variant={'whiteBase'} mr={3} onClick={onClose}>
          {t('common.Close')}
        </Button>
        <Button isLoading={btnLoading} onClick={saveUpdateModel}>
          {t('common.Save')}
        </Button>
      </ModalFooter>

      <File onSelect={onSelectFile} />
    </MyModal>
  );
};

export default React.memo(InfoModal);
