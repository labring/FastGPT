import React, { useCallback } from 'react';
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
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import Avatar from '@fastgpt/web/components/common/Avatar';
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
import { AppPermissionList } from '@fastgpt/global/support/permission/app/constant';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { resumeInheritPer } from '@/web/core/app/api';
import { useI18n } from '@/web/context/I18n';
import ResumeInherit from '@/components/support/permission/ResumeInheritText';
import { PermissionValueType } from '@fastgpt/global/support/permission/type';
import { RequireOnlyOne } from '@fastgpt/global/common/type/utils';

const InfoModal = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  const { commonT } = useI18n();
  const { toast } = useToast();
  const { updateAppDetail, appDetail, reloadApp } = useContextSelector(AppContext, (v) => v);

  const { File, onOpen: onOpenSelectFile } = useSelectFile({
    fileType: '.jpg,.png',
    multiple: false
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
          title: t('common:common.Update Success'),
          status: 'success'
        });
        reloadApp();
      },
      errorToast: t('common:common.Update Failed')
    }
  );

  const saveSubmitError = useCallback(() => {
    // deep search message
    const deepSearch = (obj: any): string => {
      if (!obj) return t('common:common.Submit failed');
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

  const onUpdateCollaborators = ({
    members,
    groups,
    permission
  }: {
    members?: string[];
    groups?: string[];
    permission: PermissionValueType;
  }) =>
    postUpdateAppCollaborators({
      members,
      groups,
      permission,
      appId: appDetail._id
    });

  const onDelCollaborator = async (props: RequireOnlyOne<{ tmbId: string; groupId: string }>) =>
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
            title={t('common:common.Set Avatar')}
            onClick={() => onOpenSelectFile()}
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
                mode="all"
                permission={appDetail.permission}
                onGetCollaboratorList={() => getCollaboratorList(appDetail._id)}
                permissionList={AppPermissionList}
                onUpdateCollaborators={async (props) =>
                  onUpdateCollaborators({
                    permission: props.permission,
                    members: props.members,
                    groups: props.groups
                  })
                }
                onDelOneCollaborator={onDelCollaborator}
                refreshDeps={[appDetail.inheritPermission]}
                isInheritPermission={appDetail.inheritPermission}
                hasParent={!!appDetail.parentId}
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
                        <Box fontSize={'sm'}>{commonT('permission.Collaborator')}</Box>
                        <Flex flexDirection="row" gap="2">
                          <Button
                            size="sm"
                            variant="whitePrimary"
                            leftIcon={<MyIcon w="4" name="common/settingLight" />}
                            onClick={onOpenManageModal}
                          >
                            {t('common:permission.Manage')}
                          </Button>
                          <Button
                            size="sm"
                            variant="whitePrimary"
                            leftIcon={<MyIcon w="4" name="support/permission/collaborator" />}
                            onClick={onOpenAddMember}
                          >
                            {t('common:common.Add')}
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
          {t('common:common.Close')}
        </Button>
        <Button isLoading={btnLoading} onClick={saveUpdateModel}>
          {t('common:common.Save')}
        </Button>
      </ModalFooter>

      <File onSelect={onSelectFile} />
    </MyModal>
  );
};

export default React.memo(InfoModal);
