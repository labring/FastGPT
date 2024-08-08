import React, { useMemo } from 'react';
import { Flex, Box, Button, ModalFooter, ModalBody, Input } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import type { FeishuAppType, OutLinkEditType } from '@fastgpt/global/support/outLink/type';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import { createShareChat, updateShareChat } from '@/web/support/outLink/api';
import { useI18n } from '@/web/context/I18n';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import BasicInfo from '../components/BasicInfo';

const FeiShuEditModal = ({
  appId,
  defaultData,
  onClose,
  onCreate,
  onEdit
}: {
  appId: string;
  defaultData: OutLinkEditType<FeishuAppType>;
  onClose: () => void;
  onCreate: (id: string) => void;
  onEdit: () => void;
}) => {
  const { t } = useTranslation();
  const { publishT } = useI18n();
  const {
    register,
    setValue,
    handleSubmit: submitShareChat
  } = useForm({
    defaultValues: defaultData
  });

  const isEdit = useMemo(() => !!defaultData?._id, [defaultData]);

  const { runAsync: onclickCreate, loading: creating } = useRequest2(
    (e) =>
      createShareChat({
        ...e,
        appId,
        type: PublishChannelEnum.feishu
      }),
    {
      errorToast: t('common:common.Create Failed'),
      successToast: t('common:common.Create Success'),
      onSuccess: onCreate
    }
  );

  const { runAsync: onclickUpdate, loading: updating } = useRequest2((e) => updateShareChat(e), {
    errorToast: t('common:common.Update Failed'),
    successToast: t('common:common.Update Success'),
    onSuccess: onEdit
  });

  return (
    <MyModal
      iconSrc="/imgs/modal/shareFill.svg"
      title={isEdit ? publishT('edit_link') : publishT('create_link')}
    >
      <ModalBody>
        <Flex flexDirection="row">
          <BasicInfo register={register} setValue={setValue} defaultData={defaultData} />
          <Flex flexDirection="column" ml="4">
            <Box>{t('publish:feishu_api')}</Box>
            <Flex alignItems={'center'} mt={4}>
              <Box flex={'0 0 90px'}>App ID</Box>
              <Input
                placeholder={t('common:core.module.http.AppId') || 'link_name'}
                {...register('app.appId', {
                  required: true
                })}
              />
            </Flex>
            <Flex alignItems={'center'} mt={4}>
              <Box flex={'0 0 90px'}>App Secret</Box>
              <Input
                placeholder={'App Secret'}
                {...register('app.appSecret', {
                  required: t('common:common.name_is_empty') || 'name_is_empty'
                })}
              />
            </Flex>
            <Flex alignItems={'center'} mt={4}>
              <Box flex={'0 0 90px'}>Encrypt Key</Box>
              <Input placeholder="Encrypt Key" {...register('app.encryptKey')} />
            </Flex>
          </Flex>
        </Flex>
      </ModalBody>
      <ModalFooter>
        <Button variant={'whiteBase'} mr={3} onClick={onClose}>
          {t('common:common.Close')}
        </Button>
        <Button
          isLoading={creating || updating}
          onClick={submitShareChat((data) => (isEdit ? onclickUpdate(data) : onclickCreate(data)))}
        >
          {t('common:common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default FeiShuEditModal;
