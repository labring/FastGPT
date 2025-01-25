import React from 'react';
import { Flex, Box, Button, ModalBody, Input, Link } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import type { FeishuAppType, OutLinkEditType } from '@fastgpt/global/support/outLink/type';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import { createShareChat, updateShareChat } from '@/web/support/outLink/api';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import BasicInfo from '../components/BasicInfo';
import { getDocPath } from '@/web/common/system/doc';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyIcon from '@fastgpt/web/components/common/Icon';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';

const FeiShuEditModal = ({
  appId,
  defaultData,
  onClose,
  onCreate,
  onEdit,
  isEdit = false
}: {
  appId: string;
  defaultData: OutLinkEditType<FeishuAppType>;
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
    (e: Omit<OutLinkEditType<FeishuAppType>, 'appId' | 'type'>) =>
      createShareChat({
        ...e,
        appId,
        type: PublishChannelEnum.feishu,
        app: {
          appId: e?.app?.appId?.trim(),
          appSecret: e.app?.appSecret?.trim(),
          encryptKey: e.app?.encryptKey?.trim()
        }
      }),
    {
      errorToast: t('common:common.Create Failed'),
      successToast: t('common:common.Create Success'),
      onSuccess: onCreate
    }
  );

  const { runAsync: onclickUpdate, loading: updating } = useRequest2(
    (e) =>
      updateShareChat({
        ...e,
        app: {
          appId: e?.app?.appId?.trim(),
          appSecret: e.app?.appSecret?.trim(),
          encryptKey: e.app?.encryptKey?.trim()
        }
      }),
    {
      errorToast: t('common:common.Update Failed'),
      successToast: t('common:common.Update Success'),
      onSuccess: onEdit
    }
  );

  const { feConfigs } = useSystemStore();

  return (
    <MyModal
      iconSrc="core/app/publish/lark"
      title={isEdit ? t('publish:edit_feishu_bot') : t('publish:new_feishu_bot')}
      minW={['auto', '60rem']}
    >
      <ModalBody display={'grid'} gridTemplateColumns={['1fr', '1fr 1fr']} fontSize={'14px'} p={0}>
        <Box p={8} h={['auto', '400px']} borderRight={'base'}>
          <BasicInfo register={register} setValue={setValue} defaultData={defaultData} />
        </Box>
        <Flex p={8} h={['auto', '400px']} flexDirection="column" gap={6}>
          <Flex alignItems="center">
            <Box color="myGray.600">{t('publish:feishu_api')}</Box>
            {feConfigs?.docUrl && (
              <Link
                href={
                  feConfigs.openAPIDocUrl ||
                  getDocPath('/docs/use-cases/external-integration/feishu/')
                }
                target={'_blank'}
                ml={2}
                color={'primary.500'}
                fontSize={'sm'}
              >
                <Flex alignItems={'center'}>
                  <MyIcon w={'17px'} h={'17px'} name="book" mr="1" />
                  {t('common:common.Read document')}
                </Flex>
              </Link>
            )}
          </Flex>
          <Flex alignItems={'center'}>
            <FormLabel flex={'0 0 6.25rem'} required>
              App ID
            </FormLabel>
            <Input
              placeholder={t('common:core.module.http.AppId')}
              {...register('app.appId', {
                required: true
              })}
            />
          </Flex>
          <Flex alignItems={'center'}>
            <FormLabel flex={'0 0 6.25rem'} required>
              App Secret
            </FormLabel>
            <Input
              placeholder={'App Secret'}
              {...register('app.appSecret', {
                required: true
              })}
            />
          </Flex>
          <Flex alignItems={'center'}>
            <FormLabel flex={'0 0 6.25rem'}>Encrypt Key</FormLabel>
            <Input placeholder="Encrypt Key" {...register('app.encryptKey')} />
          </Flex>

          <Box flex={1}></Box>

          <Flex justifyContent={'end'}>
            <Button variant={'whiteBase'} mr={3} onClick={onClose}>
              {t('common:common.Close')}
            </Button>
            <Button
              isLoading={creating || updating}
              onClick={submitShareChat((data) =>
                isEdit ? onclickUpdate(data) : onclickCreate(data)
              )}
            >
              {t('common:common.Confirm')}
            </Button>
          </Flex>
        </Flex>
      </ModalBody>
    </MyModal>
  );
};

export default FeiShuEditModal;
