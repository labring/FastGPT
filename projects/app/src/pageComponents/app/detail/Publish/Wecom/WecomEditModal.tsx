import React from 'react';
import { Flex, Box, Button, ModalBody, Input, Link } from '@chakra-ui/react';
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
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';

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

  return (
    <MyModal
      iconSrc="core/app/publish/wecom"
      title={isEdit ? t('publish:wecom.edit_modal_title') : t('publish:wecom.create_modal_title')}
      minW={['auto', '60rem']}
    >
      <ModalBody display={'grid'} gridTemplateColumns={['1fr', '1fr 1fr']} fontSize={'14px'} p={0}>
        <Box p={8} minH={['auto', '400px']} borderRight={'base'}>
          <BasicInfo register={register} setValue={setValue} defaultData={defaultData} />
        </Box>
        <Flex p={8} minH={['auto', '400px']} flexDirection="column" gap={6}>
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
                  <MyIcon name="book" w={'17px'} h={'17px'} mr="1" />
                  {t('common:common.Read document')}
                </Flex>
              </Link>
            )}
          </Flex>
          <Flex alignItems={'center'}>
            <FormLabel flex={'0 0 6.25rem'} required>
              Corp ID
            </FormLabel>
            <Input
              placeholder="Corp ID"
              {...register('app.CorpId', {
                required: true
              })}
            />
          </Flex>
          <Flex alignItems={'center'}>
            <FormLabel flex={'0 0 6.25rem'} required>
              Agent ID
            </FormLabel>
            <Input
              placeholder="Agent ID"
              {...register('app.AgentId', {
                required: true
              })}
            />
          </Flex>
          <Flex alignItems={'center'}>
            <FormLabel flex={'0 0 6.25rem'} required>
              Secret
            </FormLabel>
            <Input
              placeholder="Secret"
              {...register('app.SuiteSecret', {
                required: true
              })}
            />
          </Flex>
          <Flex alignItems={'center'}>
            <FormLabel flex={'0 0 6.25rem'} required>
              Token
            </FormLabel>
            <Input
              placeholder="Token"
              {...register('app.CallbackToken', {
                required: true
              })}
            />
          </Flex>
          <Flex alignItems={'center'}>
            <FormLabel flex={'0 0 6.25rem'} required>
              AES Key
            </FormLabel>
            <Input
              placeholder="AES Key"
              {...(register('app.CallbackEncodingAesKey'), { required: true })}
            />
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

export default WecomEditModal;
