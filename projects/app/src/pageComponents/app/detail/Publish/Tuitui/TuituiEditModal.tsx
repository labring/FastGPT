import { Box, Button, Flex, Input, ModalBody } from '@chakra-ui/react';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import type { OutLinkEditType, TuituiAppType } from '@fastgpt/global/support/outLink/type';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import { createShareChat, updateShareChat } from '@/web/support/outLink/api';
import BasicInfo from '../components/BasicInfo';

const TuituiEditModal = ({
  appId,
  defaultData,
  onClose,
  onCreate,
  onEdit,
  isEdit = false
}: {
  appId: string;
  defaultData: OutLinkEditType<TuituiAppType>;
  onClose: () => void;
  onCreate: (id: string) => void;
  onEdit: () => void;
  isEdit?: boolean;
}) => {
  const { t } = useTranslation();
  const {
    register,
    setValue,
    handleSubmit: submitShareChat
  } = useForm({
    defaultValues: defaultData
  });

  const { runAsync: onclickCreate, loading: creating } = useRequest2(
    (e: Omit<OutLinkEditType<TuituiAppType>, 'appId' | 'type'>) =>
      createShareChat({
        ...e,
        appId,
        type: PublishChannelEnum.tuitui,
        app: {
          appId: e?.app?.appId?.trim(),
          appSecret: e.app?.appSecret?.trim()
        }
      }),
    {
      errorToast: t('common:create_failed'),
      successToast: t('common:create_success'),
      onSuccess: onCreate
    }
  );

  const { runAsync: onclickUpdate, loading: updating } = useRequest2(
    (e) =>
      updateShareChat({
        ...e,
        app: {
          appId: e?.app?.appId?.trim(),
          appSecret: e.app?.appSecret?.trim()
        }
      }),
    {
      errorToast: t('common:update_failed'),
      successToast: t('common:update_success'),
      onSuccess: onEdit
    }
  );

  return (
    <MyModal
      iconSrc="core/app/publish/tuitui"
      title={isEdit ? t('publish:tuitui.edit_modal_title') : t('publish:tuitui.create_modal_title')}
      minW={['auto', '60rem']}
    >
      <ModalBody display={'grid'} gridTemplateColumns={['1fr', '1fr 1fr']} fontSize={'14px'} p={0}>
        <Box p={8} h={['auto', '400px']} borderRight={'base'}>
          <BasicInfo register={register} setValue={setValue} defaultData={defaultData} />
        </Box>
        <Flex p={8} h={['auto', '400px']} flexDirection="column" gap={6}>
          <Flex alignItems={'center'}>
            <FormLabel flex={'0 0 6.25rem'} required>
              APP ID
            </FormLabel>
            <Input
              placeholder={'APP ID'}
              {...register('app.appId', {
                required: true
              })}
            />
          </Flex>
          <Flex alignItems={'center'}>
            <FormLabel flex={'0 0 6.25rem'} required>
              APP Secret
            </FormLabel>
            <Input
              placeholder={'APP Secret'}
              {...register('app.appSecret', {
                required: true
              })}
            />
          </Flex>
          <Box flex={1}></Box>

          <Flex justifyContent={'end'}>
            <Button variant={'whiteBase'} mr={3} onClick={onClose}>
              {t('common:Close')}
            </Button>
            <Button
              isLoading={creating || updating}
              onClick={submitShareChat((data) =>
                isEdit ? onclickUpdate(data) : onclickCreate(data)
              )}
            >
              {t('common:Confirm')}
            </Button>
          </Flex>
        </Flex>
      </ModalBody>
    </MyModal>
  );
};

export default TuituiEditModal;
