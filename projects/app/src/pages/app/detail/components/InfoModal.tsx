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
import CollaboratorContextProvider from '@/components/support/permission/MemberManager/context';
import {
  postUpdateAppCollaborators,
  deleteAppCollaborators,
  getCollaboratorList
} from '@/web/core/app/api/collaborator';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '@/pages/app/detail/components/context';
import {
  AppDefaultPermissionVal,
  AppPermissionList
} from '@fastgpt/global/support/permission/app/constant';
import { PermissionValueType } from '@fastgpt/global/support/permission/type';
import DefaultPermissionList from '@/components/support/permission/DefaultPerList';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { UpdateClbPermissionProps } from '@fastgpt/global/support/permission/collaborator';

const InfoModal = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { updateAppDetail, appDetail } = useContextSelector(AppContext, (v) => v);

  const { File, onOpen: onOpenSelectFile } = useSelectFile({
    fileType: '.jpg,.png',
    multiple: false
  });

  const {
    register,
    setValue,
    getValues,
    formState: { errors },
    handleSubmit,
    watch
  } = useForm({
    defaultValues: appDetail
  });
  const defaultPermission = watch('defaultPermission');
  const avatar = getValues('avatar');

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
      } catch (err: any) {
        toast({
          title: getErrText(err, t('common.error.Select avatar failed')),
          status: 'warning'
        });
      }
    },
    [setValue, t, toast]
  );

  const onUpdateCollaborators = async ({ tmbIds, permission }: UpdateClbPermissionProps) => {
    await postUpdateAppCollaborators({
      tmbIds,
      permission,
      appId: appDetail._id
    });
  };
  const onDelCollaborator = async (tmbId: string) => {
    await deleteAppCollaborators({
      appId: appDetail._id,
      tmbId
    });
  };

  return (
    <MyModal
      isOpen={true}
      onClose={onClose}
      iconSrc="/imgs/workflow/ai.svg"
      title={t('core.app.setting')}
    >
      <ModalBody>
        <Box fontSize={'sm'}>{t('core.app.Name and avatar')}</Box>
        <Flex mt={2} alignItems={'center'}>
          <Avatar
            src={avatar}
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
        <Box mt={4} mb={1} fontSize={'sm'}>
          {t('core.app.App intro')}
        </Box>
        <Textarea
          rows={4}
          maxLength={500}
          placeholder={t('core.app.Make a brief introduction of your app')}
          bg={'myWhite.600'}
          {...register('intro')}
        />

        {/* role */}
        {appDetail.permission.hasManagePer && (
          <>
            <Box mt="4">
              <Box fontSize={'sm'}>{t('permission.Default permission')}</Box>
              <DefaultPermissionList
                mt="2"
                per={defaultPermission}
                defaultPer={AppDefaultPermissionVal}
                onChange={(v) => setValue('defaultPermission', v)}
              />
            </Box>
            <Box mt={6}>
              <CollaboratorContextProvider
                permission={appDetail.permission}
                onGetCollaboratorList={() => getCollaboratorList(appDetail._id)}
                permissionList={AppPermissionList}
                onUpdateCollaborators={onUpdateCollaborators}
                onDelOneCollaborator={onDelCollaborator}
              >
                {({ MemberListCard, onOpenManageModal, onOpenAddMember }) => {
                  return (
                    <>
                      <Flex
                        alignItems="center"
                        flexDirection="row"
                        justifyContent="space-between"
                        w="full"
                      >
                        <Box fontSize={'sm'}>协作者</Box>
                        <Flex flexDirection="row" gap="2">
                          <Button
                            size="sm"
                            variant="whitePrimary"
                            leftIcon={<MyIcon w="4" name="common/settingLight" />}
                            onClick={onOpenManageModal}
                          >
                            {t('permission.Manage')}
                          </Button>
                          <Button
                            size="sm"
                            variant="whitePrimary"
                            leftIcon={<MyIcon w="4" name="support/permission/collaborator" />}
                            onClick={onOpenAddMember}
                          >
                            {t('common.Add')}
                          </Button>
                        </Flex>
                      </Flex>
                      <MemberListCard mt={2} p={1.5} bg="myGray.100" borderRadius="md" />
                    </>
                  );
                }}
              </CollaboratorContextProvider>
            </Box>
          </>
        )}
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
