import CollaboratorContextProvider from '@/components/support/permission/MemberManager/context';
import ResumeInherit from '@/components/support/permission/ResumeInheritText';
import { AppContext } from './context';
import { resumeInheritPer } from '@/web/core/app/api';
import {
  deleteAppCollaborators,
  getCollaboratorList,
  postUpdateAppCollaborators
} from '@/web/core/app/api/collaborator';
import {
  Box,
  Button,
  Flex,
  FormControl,
  Input,
  ModalBody,
  ModalFooter,
  Textarea
} from '@chakra-ui/react';
import type { RequireOnlyOne } from '@fastgpt/global/common/type/utils';
import type { AppSchema } from '@fastgpt/global/core/app/type.d';
import { AppRoleList } from '@fastgpt/global/support/permission/app/constant';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useTranslation } from 'next-i18next';
import React, { useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { useContextSelector } from 'use-context-selector';
import { ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import { useUploadAvatar } from '@fastgpt/web/common/file/hooks/useUploadAvatar';
import { getUploadAvatarPresignedUrl } from '@/web/common/file/api';

const InfoModal = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { updateAppDetail, appDetail, reloadApp } = useContextSelector(AppContext, (v) => v);

  const { Component: AvatarUploader, handleFileSelectorOpen: handleAvatarSelectorOpen } =
    useUploadAvatar(getUploadAvatarPresignedUrl, {
      onSuccess: (avatar) => setValue('avatar', avatar)
    });

  const {
    register,
    setValue,
    watch,
    formState: { errors },
    handleSubmit
  } = useForm({
    defaultValues: appDetail
  });
  const avatar = watch('avatar');

  // submit config
  const { runAsync: saveSubmitSuccess, loading: btnLoading } = useRequest2(
    async (data: AppSchema) => {
      await updateAppDetail({
        name: data.name,
        avatar: data.avatar,
        intro: data.intro
      });
    },
    {
      onSuccess() {
        toast({
          title: t('common:update_success'),
          status: 'success'
        });
        reloadApp();
      },
      errorToast: t('common:update_failed')
    }
  );

  const saveSubmitError = useCallback(() => {
    // deep search message
    const deepSearch = (obj: any): string => {
      if (!obj) return t('common:submit_failed');
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
    () => handleSubmit((data) => saveSubmitSuccess(data).then(onClose), saveSubmitError)(),
    [handleSubmit, onClose, saveSubmitError, saveSubmitSuccess]
  );

  const onDelCollaborator = async (
    props: RequireOnlyOne<{ tmbId: string; groupId: string; orgId: string }>
  ) =>
    deleteAppCollaborators({
      appId: appDetail._id,
      ...props
    });

  const { runAsync: resumeInheritPermission } = useRequest2(() => resumeInheritPer(appDetail._id), {
    errorToast: t('common:resume_failed'),
    onSuccess: () => {
      reloadApp();
    }
  });

  return (
    <MyModal
      isOpen={true}
      onClose={onClose}
      iconSrc="/imgs/workflow/ai.svg"
      title={t('common:core.app.setting')}
    >
      <ModalBody>
        <Box fontSize={'sm'}>{t('common:core.app.Name and avatar')}</Box>
        <Flex mt={2} alignItems={'center'}>
          <Avatar
            src={avatar}
            w={['26px', '34px']}
            h={['26px', '34px']}
            cursor={'pointer'}
            borderRadius={'md'}
            mr={4}
            title={t('common:set_avatar')}
            onClick={handleAvatarSelectorOpen}
          />
          <FormControl>
            <Input
              bg={'myWhite.600'}
              placeholder={t('common:core.app.Set a name for your app')}
              {...register('name', {
                required: true
              })}
            ></Input>
          </FormControl>
        </Flex>
        <Box mt={4} mb={1} fontSize={'sm'}>
          {t('common:core.app.App intro')}
        </Box>
        <Textarea
          rows={4}
          maxLength={500}
          placeholder={t('common:core.app.Make a brief introduction of your app')}
          bg={'myWhite.600'}
          {...register('intro')}
        />

        {/* role */}
        {appDetail.permission.hasManagePer && (
          <>
            {!appDetail.inheritPermission && appDetail.parentId && (
              <Box mt={3}>
                <ResumeInherit onResume={resumeInheritPermission} />
              </Box>
            )}
            <Box mt={6}>
              <CollaboratorContextProvider
                defaultRole={ReadRoleVal}
                permission={appDetail.permission}
                onGetCollaboratorList={() => getCollaboratorList(appDetail._id)}
                roleList={AppRoleList}
                onUpdateCollaborators={async ({ collaborators }) =>
                  postUpdateAppCollaborators({
                    collaborators,
                    appId: appDetail._id
                  })
                }
                onDelOneCollaborator={onDelCollaborator}
                refreshDeps={[appDetail.inheritPermission]}
                isInheritPermission={appDetail.inheritPermission}
                hasParent={!!appDetail.parentId}
              >
                {({ MemberListCard, onOpenManageModal }) => {
                  return (
                    <>
                      <Flex
                        alignItems="center"
                        flexDirection="row"
                        justifyContent="space-between"
                        w="full"
                      >
                        <Box fontSize={'sm'}>{t('common:permission.Collaborator')}</Box>
                        <Button
                          size="sm"
                          variant="whitePrimary"
                          leftIcon={<MyIcon w="4" name="common/settingLight" />}
                          onClick={onOpenManageModal}
                        >
                          {t('common:permission.Manage')}
                        </Button>
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
          {t('common:Close')}
        </Button>
        <Button isLoading={btnLoading} onClick={saveUpdateModel}>
          {t('common:Save')}
        </Button>
      </ModalFooter>

      <AvatarUploader />
    </MyModal>
  );
};

export default React.memo(InfoModal);
