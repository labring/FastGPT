import React from 'react';
import { Box, Button, Flex, Grid, Input, ModalBody, ModalFooter } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import type { WechatAppType, OutLinkEditType } from '@fastgpt/global/support/outLink/type';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import { createShareChat, updateShareChat } from '@/web/support/outLink/api';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';

const WechatEditModal = ({
  appId,
  defaultData,
  onClose,
  onCreate,
  onEdit,
  isEdit = false
}: {
  appId: string;
  defaultData: OutLinkEditType<WechatAppType>;
  onClose: () => void;
  onCreate: (shareId: string) => Promise<string | undefined>;
  onEdit: () => void;
  isEdit?: boolean;
}) => {
  const { t } = useTranslation();
  const { register, setValue, handleSubmit } = useForm({
    defaultValues: defaultData
  });

  const { runAsync: onclickCreate, loading: creating } = useRequest(
    (e) =>
      createShareChat({
        ...e,
        appId,
        type: PublishChannelEnum.wechat
      }),
    {
      errorToast: t('common:create_failed'),
      successToast: t('common:create_success'),
      onSuccess: async (shareId) => {
        const _id = await onCreate(shareId);
        if (_id) setValue('_id', _id);
        onClose();
      }
    }
  );

  const { runAsync: onclickUpdate, loading: updating } = useRequest((e) => updateShareChat(e), {
    errorToast: t('common:update_failed'),
    successToast: t('common:update_success'),
    onSuccess: () => {
      onEdit();
      onClose();
    }
  });

  return (
    <MyModal
      iconSrc="core/app/publish/wechat"
      title={isEdit ? t('publish:wechat.edit') : t('publish:wechat.create')}
      minW={['auto', '500px']}
      onClose={onClose}
    >
      <ModalBody fontSize={'14px'} p={8}>
        <Grid gridTemplateColumns={'1fr'} gap={4}>
          <Flex flexDir={'column'} gap={2}>
            <FormLabel required>{t('common:Name')}</FormLabel>
            <Input
              placeholder={t('publish:wechat.name_placeholder')}
              maxLength={100}
              {...register('name', { required: t('common:name_is_empty') })}
            />
          </Flex>

          <Flex flexDir={'column'} gap={2}>
            <FormLabel>
              {t('common:support.outlink.Max usage points')}
              <QuestionTip ml={1} label={t('common:support.outlink.Max usage points tip')} />
            </FormLabel>
            <Input
              {...register('limit.maxUsagePoints', {
                min: -1,
                max: 10000000,
                valueAsNumber: true
              })}
            />
          </Flex>
        </Grid>
      </ModalBody>
      <ModalFooter>
        <Button variant={'whiteBase'} mr={3} onClick={onClose}>
          {t('common:Close')}
        </Button>
        <Button
          isLoading={creating || updating}
          onClick={handleSubmit((data) => (isEdit ? onclickUpdate(data) : onclickCreate(data)))}
        >
          {t('common:Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default WechatEditModal;
