import React from 'react';
import { Flex, Box, Button, ModalBody, Input, Link } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import type { DingtalkAppType, OutLinkEditType } from '@fastgpt/global/support/outLink/type';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import { createShareChat, updateShareChat } from '@/web/support/outLink/api';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import BasicInfo from '../components/BasicInfo';
import { getDocPath } from '@/web/common/system/doc';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyIcon from '@fastgpt/web/components/common/Icon';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';

const DingTalkEditModal = ({
  appId,
  defaultData,
  onClose,
  onCreate,
  onEdit,
  isEdit = false
}: {
  appId: string;
  defaultData: OutLinkEditType<DingtalkAppType>;
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
    (e: Omit<OutLinkEditType<DingtalkAppType>, 'appId' | 'type'>) =>
      createShareChat({
        ...e,
        appId,
        type: PublishChannelEnum.dingtalk,
        app: {
          clientId: e?.app?.clientId?.trim(),
          clientSecret: e.app?.clientSecret?.trim()
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
          clientId: e?.app?.clientId?.trim(),
          clientSecret: e.app?.clientSecret?.trim()
        }
      }),
    {
      errorToast: t('common:update_failed'),
      successToast: t('common:update_success'),
      onSuccess: onEdit
    }
  );

  const { feConfigs } = useSystemStore();

  return (
    <MyModal
      iconSrc="common/dingtalkFill"
      title={
        isEdit ? t('publish:dingtalk.edit_modal_title') : t('publish:dingtalk.create_modal_title')
      }
      minW={['auto', '60rem']}
    >
      <ModalBody display={'grid'} gridTemplateColumns={['1fr', '1fr 1fr']} fontSize={'14px'} p={0}>
        <Box p={8} h={['auto', '400px']} borderRight={'base'}>
          <BasicInfo register={register} setValue={setValue} defaultData={defaultData} />
        </Box>
        <Flex p={8} h={['auto', '400px']} flexDirection="column" gap={6}>
          <Flex alignItems="center">
            <Box color="myGray.600">{t('publish:dingtalk.api')}</Box>
            {feConfigs?.docUrl && (
              <Link
                href={getDocPath('/docs/use-cases/external-integration/dingtalk/')}
                target={'_blank'}
                ml={2}
                color={'primary.500'}
                fontSize={'sm'}
              >
                <Flex alignItems={'center'}>
                  <MyIcon w={'17px'} h={'17px'} name="book" mr="1" />
                  {t('common:read_doc')}
                </Flex>
              </Link>
            )}
          </Flex>
          <Flex alignItems={'center'}>
            <FormLabel flex={'0 0 6.25rem'} required>
              Client ID
            </FormLabel>
            <Input
              placeholder={'Client ID'}
              {...register('app.clientId', {
                required: true
              })}
            />
          </Flex>
          <Flex alignItems={'center'}>
            <FormLabel flex={'0 0 6.25rem'} required>
              Client Secret
            </FormLabel>
            <Input
              placeholder={'Client Secret'}
              {...register('app.clientSecret', {
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

export default DingTalkEditModal;
