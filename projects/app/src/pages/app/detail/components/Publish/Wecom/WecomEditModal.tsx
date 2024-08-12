import React from 'react';
import { Flex, Box, Button, ModalFooter, ModalBody, Input, Link, Grid } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import type { WecomAppType, OutLinkEditType } from '@fastgpt/global/support/outLink/type';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import { createShareChat, updateShareChat } from '@/web/support/outLink/api';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import BasicInfo from '../components/BasicInfo';
import { getDocPath } from '@/web/common/system/doc';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useSystem } from '@fastgpt/web/hooks/useSystem';

const WecomEditModal = ({
  appId,
  defaultData,
  onClose,
  onCreate,
  onEdit,
  isEdit = false
}: {
  appId: string;
  defaultData: OutLinkEditType<WecomAppType>;
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
    (e) =>
      createShareChat({
        ...e,
        appId,
        type: PublishChannelEnum.wecom
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

  const { feConfigs } = useSystemStore();
  const { isPc } = useSystem();

  return (
    <MyModal
      iconSrc="/imgs/modal/shareFill.svg"
      title={isEdit ? t('publish:wecom.edit_modal_title') : t('publish:wecom.create_modal_title')}
      minW={isPc ? '900px' : ''}
    >
      <ModalBody minH={'400px'}>
        <Grid {...(isPc ? { gridTemplateColumns: '1fr 1fr' } : {})} fontSize={'14px'}>
          <Box pr="8">
            <BasicInfo register={register} setValue={setValue} defaultData={defaultData} />
          </Box>
          <Flex
            flexDirection="column"
            {...(isPc ? { borderLeft: 'sm', pl: '8' } : { mt: '8', borderTop: 'sm', pt: '8' })}
            color="myGray.900"
          >
            <Flex alignItems="center">
              <Box color="myGray.600">{t('publish:wecom.api')}</Box>
              {feConfigs?.docUrl && (
                <Link
                  href={feConfigs.openAPIDocUrl || getDocPath('/docs/use-cases/wecom-bot')}
                  target={'_blank'}
                  ml={2}
                  color={'primary.500'}
                  fontSize={'sm'}
                >
                  <Flex alignItems={'center'}>
                    <MyIcon name="book" mr="1" />
                    {t('common:common.Read document')}
                  </Flex>
                </Link>
              )}
            </Flex>
            <Flex alignItems={'center'} mt={4}>
              <Box flex={'0 0 100px'}>App ID</Box>
              <Input
                placeholder={t('common:core.module.http.AppId')}
                {...register('app.SuiteId', {
                  required: true
                })}
              />
            </Flex>
            <Flex alignItems={'center'} mt={4}>
              <Box flex={'0 0 100px'}>App Secret</Box>
              <Input
                placeholder={'App Secret'}
                {...register('app.SuiteSecret', {
                  required: t('common:common.name_is_empty')
                })}
              />
            </Flex>
            <Flex alignItems={'center'} mt={4}>
              <Box flex={'0 0 100px'}>Encrypt Key</Box>
              <Input placeholder="Encrypt Key" {...register('app.CallbackToken')} />
            </Flex>
            <Flex alignItems={'center'} mt={4}>
              <Box flex={'0 0 100px'}>Encrypt Key</Box>
              <Input placeholder="Encrypt Key" {...register('app.CallbackEncodingAesKey')} />
            </Flex>
          </Flex>
        </Grid>
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

export default WecomEditModal;
