import React, { useMemo } from 'react';
import { Flex, Box, Button, ModalFooter, ModalBody, Input } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import type { FeishuType, OutLinkEditType } from '@fastgpt/global/support/outLink/type';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import { useRequest } from '@/web/common/hooks/useRequest';
import dayjs from 'dayjs';
import { createShareChat, updateShareChat } from '@/web/support/outLink/api';
import { useI18n } from '@/web/context/I18n';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';

const FeiShuEditModal = ({
  appId,
  defaultData,
  onClose,
  onCreate,
  onEdit
}: {
  appId: string;
  defaultData: OutLinkEditType<FeishuType>;
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

  const { mutate: onclickCreate, isLoading: creating } = useRequest({
    mutationFn: async (e: OutLinkEditType<FeishuType>) => {
      createShareChat({
        ...e,
        appId,
        type: PublishChannelEnum.feishu
      });
    },
    errorToast: t('common.Create Failed'),
    onSuccess: onCreate
  });
  const { mutate: onclickUpdate, isLoading: updating } = useRequest({
    mutationFn: (e: OutLinkEditType<FeishuType>) => {
      return updateShareChat(e);
    },
    errorToast: t('common.Update Failed'),
    onSuccess: onEdit
  });

  return (
    <MyModal
      isOpen={true}
      iconSrc="/imgs/modal/shareFill.svg"
      title={isEdit ? publishT('Edit Link') : publishT('Create Link')}
    >
      <ModalBody>
        <Flex alignItems={'center'}>
          <Box flex={'0 0 90px'}>{t('Name')}</Box>
          <Input
            placeholder={publishT('Feishu name') || 'Link Name'} // TODO: i18n
            maxLength={20}
            {...register('name', {
              required: t('common.Name is empty') || 'Name is empty'
            })}
          />
        </Flex>
        <Flex alignItems={'center'} mt={4}>
          <Flex flex={'0 0 90px'} alignItems={'center'}>
            QPM
            <QuestionTip ml={1} label={publishT('QPM Tips' || '')}></QuestionTip>
          </Flex>
          <Input
            max={1000}
            {...register('limit.QPM', {
              min: 0,
              max: 1000,
              valueAsNumber: true,
              required: publishT('QPM is empty') || ''
            })}
          />
        </Flex>
        <Flex alignItems={'center'} mt={4}>
          <Flex flex={'0 0 90px'} alignItems={'center'}>
            {t('support.outlink.Max usage points')}
            <QuestionTip ml={1} label={t('support.outlink.Max usage points tip')}></QuestionTip>
          </Flex>
          <Input
            {...register('limit.maxUsagePoints', {
              min: -1,
              max: 10000000,
              valueAsNumber: true,
              required: true
            })}
          />
        </Flex>
        <Flex alignItems={'center'} mt={4}>
          <Flex flex={'0 0 90px'} alignItems={'center'}>
            {t('common.Expired Time')}
          </Flex>
          <Input
            type="datetime-local"
            defaultValue={
              defaultData.limit?.expiredTime
                ? dayjs(defaultData.limit?.expiredTime).format('YYYY-MM-DDTHH:mm')
                : ''
            }
            onChange={(e) => {
              setValue('limit.expiredTime', new Date(e.target.value));
            }}
          />
        </Flex>
        <Flex alignItems={'center'} mt={4}>
          <Flex flex={'0 0 90px'} alignItems={'center'}>
            默认回复
            {/* TODO: i18n */}
          </Flex>
          <Input
            placeholder={publishT('Default Response') || 'Link Name'}
            maxLength={20}
            {...register('defaultResponse', {
              required: true
            })}
          />
        </Flex>
        <Flex alignItems={'center'} mt={4}>
          <Flex flex={'0 0 90px'} alignItems={'center'}>
            立即回复
            {/* TODO: i18n */}
          </Flex>
          <Input
            placeholder={publishT('Default Response') || 'Link Name'}
            maxLength={20}
            {...register('immediateResponse', {
              required: true
            })}
          />
        </Flex>
        <Flex alignItems={'center'} mt={4}>
          <Box flex={'0 0 90px'}>{t('core.module.http.AppId')}</Box>
          <Input
            placeholder={t('core.module.http.appId') || 'Link Name'}
            // maxLength={20}
            {...register('app.appId', {
              required: true
            })}
          />
        </Flex>
        <Flex alignItems={'center'} mt={4}>
          <Box flex={'0 0 90px'}>{t('core.module.http.AppSecret')}</Box>
          <Input
            placeholder={'App Secret'}
            // maxLength={20}
            {...register('app.appSecret', {
              required: t('common.Name is empty') || 'Name is empty'
            })}
          />
        </Flex>
        <Flex alignItems={'center'} mt={4}>
          <Box flex={'0 0 90px'}>Encrypt Key</Box>
          <Input
            placeholder="Encrypt Key"
            // maxLength={20}
            {...register('app.encryptKey', {
              required: t('common.Name is empty') || 'Name is empty'
            })}
          />
        </Flex>
        <Flex alignItems={'center'} mt={4}>
          <Box flex={'0 0 90px'}>Verification Token</Box>
          <Input
            placeholder="Verification Token"
            // maxLength={20}
            {...register('app.verificationToken', {
              required: t('common.Name is empty') || 'Name is empty'
            })}
          />
        </Flex>
        {/* <Flex alignItems={'center'} mt={4}> */}
        {/*   <Flex flex={'0 0 90px'} alignItems={'center'}> */}
        {/*     限制回复 */}
        {/*   </Flex> */}
        {/*   <Switch {...register('wecomConfig.ReplyLimit')} size={'lg'} /> */}
        {/* </Flex> */}
      </ModalBody>
      <ModalFooter>
        <Button variant={'whiteBase'} mr={3} onClick={onClose}>
          {t('common.Close')}
        </Button>
        <Button
          isLoading={creating || updating}
          onClick={submitShareChat((data) => (isEdit ? onclickUpdate(data) : onclickCreate(data)))}
        >
          {t('common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default FeiShuEditModal;
