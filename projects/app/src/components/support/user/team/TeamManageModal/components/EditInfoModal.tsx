import React, { useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'next-i18next';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { compressImgFileAndUpload } from '@/web/common/file/controller';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { Box, Button, Flex, Input, ModalBody, ModalFooter } from '@chakra-ui/react';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import Avatar from '@/components/Avatar';
import { postCreateTeam, putUpdateTeam } from '@/web/support/user/team/api';
import { CreateTeamProps } from '@fastgpt/global/support/user/team/controller.d';
import { MongoImageTypeEnum } from '@fastgpt/global/common/file/image/constants';

export type EditTeamFormDataType = CreateTeamProps & {
  id?: string;
};

export const defaultForm = {
  name: '',
  avatar: '/icon/logo.svg'
};

function EditModal({
  defaultData = defaultForm,
  onClose,
  onSuccess
}: {
  defaultData?: EditTeamFormDataType;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const { register, setValue, handleSubmit, watch } = useForm<CreateTeamProps>({
    defaultValues: defaultData
  });
  const avatar = watch('avatar');

  const { File, onOpen: onOpenSelectFile } = useSelectFile({
    fileType: '.jpg,.png,.svg',
    multiple: false
  });

  const onSelectFile = useCallback(
    async (e: File[]) => {
      const file = e[0];
      if (!file) return;
      try {
        const src = await compressImgFileAndUpload({
          type: MongoImageTypeEnum.teamAvatar,
          file,
          maxW: 300,
          maxH: 300
        });
        setValue('avatar', src);
      } catch (err: any) {
        toast({
          title: getErrText(err, t('common.Select File Failed')),
          status: 'warning'
        });
      }
    },
    [setValue, t, toast]
  );

  const { mutate: onclickCreate, isLoading: creating } = useRequest({
    mutationFn: async (data: CreateTeamProps) => {
      return postCreateTeam(data);
    },
    onSuccess() {
      onSuccess();
      onClose();
    },
    successToast: t('common.Create Success'),
    errorToast: t('common.Create Failed')
  });
  const { mutate: onclickUpdate, isLoading: updating } = useRequest({
    mutationFn: async (data: EditTeamFormDataType) => {
      if (!data.id) return Promise.resolve('');
      return putUpdateTeam({
        name: data.name,
        avatar: data.avatar
      });
    },
    onSuccess() {
      onSuccess();
      onClose();
    },
    successToast: t('common.Update Success'),
    errorToast: t('common.Update Failed')
  });

  return (
    <MyModal
      isOpen
      onClose={onClose}
      iconSrc="/imgs/modal/team.svg"
      title={defaultData.id ? t('user.team.Update Team') : t('user.team.Create Team')}
    >
      <ModalBody>
        <Box color={'myGray.800'} fontWeight={'bold'}>
          {t('user.team.Set Name')}
        </Box>
        <Flex mt={3} alignItems={'center'}>
          <MyTooltip label={t('common.Set Avatar')}>
            <Avatar
              flexShrink={0}
              src={avatar}
              w={['28px', '32px']}
              h={['28px', '32px']}
              cursor={'pointer'}
              borderRadius={'md'}
              onClick={onOpenSelectFile}
            />
          </MyTooltip>
          <Input
            flex={1}
            ml={4}
            autoFocus
            bg={'myWhite.600'}
            maxLength={20}
            placeholder={t('user.team.Team Name')}
            {...register('name', {
              required: t('common.Please Input Name')
            })}
          />
        </Flex>
      </ModalBody>

      <ModalFooter>
        {!!defaultData.id ? (
          <>
            <Box flex={1} />
            <Button variant={'whiteBase'} mr={3} onClick={onClose}>
              {t('common.Close')}
            </Button>
            <Button isLoading={updating} onClick={handleSubmit((data) => onclickUpdate(data))}>
              {t('common.Confirm Update')}
            </Button>
          </>
        ) : (
          <Button
            w={'100%'}
            isLoading={creating}
            onClick={handleSubmit((data) => onclickCreate(data))}
          >
            {t('common.Confirm Create')}
          </Button>
        )}
      </ModalFooter>
      <File onSelect={onSelectFile} />
    </MyModal>
  );
}

export default React.memo(EditModal);
