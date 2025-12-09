import React, { useMemo } from 'react';
import { Flex, Box, Button, ModalBody, Input, Link, ModalFooter, Grid } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import type { WecomAppType, OutLinkEditType } from '@fastgpt/global/support/outLink/type';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import { createShareChat, updateShareChat } from '@/web/support/outLink/api';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getDocPath } from '@/web/common/system/doc';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyIcon from '@fastgpt/web/components/common/Icon';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { useMyStep } from '@fastgpt/web/hooks/useStep';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { format } from 'date-fns';
import { ShareLinkContainer } from '../components/showShareLinkModal';
import { formatTime2YMDHM } from '@fastgpt/global/common/string/time';

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
  onCreate: (shareId: string) => Promise<string | undefined>;
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

  const {
    runAsync: onclickCreate,
    loading: creating,
    data: createShareId
  } = useRequest2(
    (e) =>
      createShareChat({
        ...e,
        appId,
        type: PublishChannelEnum.wecom
      }),
    {
      errorToast: t('common:create_failed'),
      successToast: t('common:create_success'),
      onSuccess: async (shareId) => {
        const _id = await onCreate(shareId);
        if (_id) {
          setValue('_id', _id);
        }
      }
    }
  );

  const {
    runAsync: onclickUpdate,
    loading: updating,
    data: updatedShareId
  } = useRequest2((e) => updateShareChat(e), {
    errorToast: t('common:update_failed'),
    successToast: t('common:update_success'),
    onSuccess: onEdit
  });

  const shareId = useMemo(() => createShareId || updatedShareId, [createShareId, updatedShareId]);

  // 判断是否已经创建成功（有 createShareId 说明已经创建）
  const isCreated = useMemo(() => !!createShareId, [createShareId]);
  const isEditMode = useMemo(() => isEdit || isCreated, [isEdit, isCreated]);

  const { feConfigs } = useSystemStore();
  const { MyStep, activeStep, goToNext, goToPrevious } = useMyStep({
    steps: [
      {
        title: t('publish:wecom.create_modal.step.1')
      },
      {
        title: t('publish:wecom.create_modal.step.2')
      }
    ]
  });

  const baseUrl = useMemo(
    () => feConfigs?.customApiDomain || `${location.origin}/api`,
    [feConfigs?.customApiDomain]
  );

  return (
    <MyModal
      iconSrc="core/app/publish/wecom"
      title={
        isEditMode ? t('publish:wecom.edit_modal_title') : t('publish:wecom.create_modal_title')
      }
      minW={['auto', '60rem']}
      onClose={onClose}
    >
      <ModalBody fontSize={'14px'} p={8}>
        <MyStep />
        {activeStep === 0 && (
          <>
            <Grid
              gridTemplateColumns={'200px 1fr'}
              rowGap="4"
              mt="4"
              pb="24px"
              borderBottom="1px solid"
              borderColor="myGray.200"
            >
              <Box color="myGray.900" fontWeight={'500'}>
                {t('publish:basic_info')}
              </Box>
              <Grid gridTemplateColumns={'1fr 1fr'} gap="4">
                <Flex flexDir={'column'} gap="2">
                  <FormLabel required>{t('common:Name')}</FormLabel>
                  <Input
                    placeholder={t('publish:publish_name')}
                    maxLength={100}
                    {...register('name', {
                      required: t('common:name_is_empty')
                    })}
                  />
                </Flex>
                <Flex flexDir={'column'} gap="2">
                  <FormLabel>
                    QPM
                    <QuestionTip ml={1} label={t('publish:qpm_tips')}></QuestionTip>
                  </FormLabel>
                  <Input
                    max={1000}
                    {...register('limit.QPM', {
                      min: 0,
                      max: 1000,
                      valueAsNumber: true,
                      required: t('publish:qpm_is_empty')
                    })}
                  />
                </Flex>
                <Flex flexDir={'column'} gap="2">
                  <FormLabel>
                    {t('common:support.outlink.Max usage points')}
                    <QuestionTip
                      ml={1}
                      label={t('common:support.outlink.Max usage points tip')}
                    ></QuestionTip>
                  </FormLabel>
                  <Input
                    {...register('limit.maxUsagePoints', {
                      min: -1,
                      max: 10000000,
                      valueAsNumber: true,
                      required: true
                    })}
                  />
                </Flex>
                <Flex flexDir={'column'} gap="2">
                  <FormLabel>{t('common:expired_time')}</FormLabel>
                  <Input
                    type="datetime-local"
                    defaultValue={
                      defaultData.limit?.expiredTime
                        ? formatTime2YMDHM(defaultData.limit?.expiredTime)
                        : ''
                    }
                    onChange={(e) => {
                      setValue('limit.expiredTime', new Date(e.target.value));
                    }}
                  />
                </Flex>
              </Grid>
            </Grid>

            <Grid gridTemplateColumns={'200px 1fr'} rowGap="4" mt="24px">
              <Flex h="min">
                <Box color="myGray.900" fontWeight="500">
                  {t('publish:wecom.api')}
                </Box>
                <Flex>
                  {feConfigs?.docUrl && (
                    <Link
                      href={getDocPath('/docs/use-cases/external-integration/wecom')}
                      target={'_blank'}
                      ml={2}
                      color={'primary.500'}
                      fontSize={'sm'}
                    >
                      <Flex alignItems={'center'}>
                        <MyIcon name="book" w={'17px'} h={'17px'} mr="1" />
                        {t('common:read_doc')}
                      </Flex>
                    </Link>
                  )}
                </Flex>
              </Flex>

              <Grid gridTemplateColumns={'1fr 1fr'} columnGap="4">
                <Flex flexDir={'column'} gap="2">
                  <FormLabel required>Token</FormLabel>
                  <Input
                    placeholder="Token"
                    {...register('app.CallbackToken', {
                      required: true
                    })}
                  />
                </Flex>
                <Flex flexDir={'column'} gap="2">
                  <FormLabel required>AES Key</FormLabel>
                  <Input
                    placeholder="AES Key"
                    {...register('app.CallbackEncodingAesKey', { required: true })}
                  />
                </Flex>
              </Grid>
            </Grid>
          </>
        )}
        {activeStep === 1 && (
          <Box mt="4">
            <ShareLinkContainer
              shareLink={`${baseUrl}/support/outLink/wecom/${shareId}`}
              img="/imgs/outlink/wecom-copylink-instruction.png"
              defaultDomain={false}
              showCustomDomainSelector={true}
            ></ShareLinkContainer>
          </Box>
        )}
      </ModalBody>
      <ModalFooter>
        {activeStep === 1 && (
          <Button
            variant={'whiteBase'}
            mr={3}
            onClick={() => {
              goToPrevious();
            }}
          >
            {t('common:last_step')}
          </Button>
        )}
        <Button
          isLoading={creating || updating}
          onClick={() => {
            if (activeStep === 0) {
              submitShareChat((data) =>
                (isEditMode ? onclickUpdate(data) : onclickCreate(data)).then(() => goToNext())
              )();
            } else {
              onClose();
            }
          }}
        >
          {t('common:Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default WecomEditModal;
