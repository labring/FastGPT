'use client';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import React from 'react';
import { Box, Button, HStack, Input, Textarea, Text } from '@chakra-ui/react';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import {
  getSystemMsgModal,
  postSendSystemMsg,
  postUpdateSystemMsgModal,
  postUpdateOperationalAd,
  getOperationalAd,
  postUpdateActivityAd,
  getActivityAd
} from '@/web/admin/system/inform/api';
import { useForm, useWatch } from 'react-hook-form';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { InformLevelEnum } from '@fastgpt/global/support/user/inform/constants';
import ImageInput from '@/pageComponents/admin/settings/ImageInput';
import { useMount } from 'ahooks';
import {
  AdminSettingPage,
  AdminSettingSection,
  AdminFormItem,
  type SettingTOCItem
} from '@/pageComponents/admin/settings';

const InformSetting = () => {
  const { t } = useClientTranslation('admin');
  const tocItems: SettingTOCItem[] = [
    { id: 'systemModal', label: t('admin:system_announcement_config') },
    { id: 'sendInform', label: t('admin:send_system_notification') },
    { id: 'operationalAd', label: t('admin:points_area_ad_config') },
    { id: 'activityAd', label: t('admin:fullscreen_campaign_ad_config') }
  ];

  // 1. 系统公告
  const { ConfirmModal: ConfirmSettingSystemModal, openConfirm: onOpenConfirmSystemModal } =
    useConfirm({
      content: t('admin:confirm_update_system_announcement')
    });
  const {
    register: registerSystemMsgModal,
    handleSubmit: handleSubmitUpdateSystemMsgModal,
    reset: resetUpdateSystemMsgModal
  } = useForm({
    defaultValues: {
      content: ''
    }
  });
  const { runAsync: onUpdateSystemModal, loading: isUpdatingSystemModal } = useRequest(
    postUpdateSystemMsgModal,
    {
      successToast: t('common:update_success')
    }
  );
  useMount(async () => {
    const res = await getSystemMsgModal();
    resetUpdateSystemMsgModal({
      content: res?.content || ''
    });
  });

  // 2. 系统通知
  const { ConfirmModal: ConfirmSendSystemMsg, openConfirm: onOpenConfirmSendSystemMsg } =
    useConfirm({
      content: t('admin:confirm_send_system_notification')
    });
  const {
    control: controlSystemInform,
    setValue,
    register: registerSystemInform,
    handleSubmit: handleSubmitSendSystemInform
  } = useForm({
    defaultValues: {
      level: InformLevelEnum.common,
      title: '',
      content: ''
    }
  });
  const informLevel = useWatch({ control: controlSystemInform, name: 'level' });
  const { runAsync: onUpdateSendSystemMsg, loading: isUpdatingSendSystemMsg } = useRequest(
    postSendSystemMsg,
    {
      successToast: t('admin:sent_notifications_delivered_gradually')
    }
  );

  // 3. 积分区广告
  const { ConfirmModal: ConfirmOperationalAd, openConfirm: onOpenConfirmOperationalAd } =
    useConfirm({
      content: t('admin:confirm_save_operations_ad_config')
    });
  const { ConfirmModal: ConfirmClearOperationalAd, openConfirm: onOpenConfirmClearOperationalAd } =
    useConfirm({
      content: t('admin:confirm_clear_operations_ad_config')
    });
  const {
    control: controlOperationalAd,
    register: registerOperationalAd,
    handleSubmit: handleSubmitOperationalAd,
    reset: resetOperationalAd
  } = useForm({
    defaultValues: {
      operationalAdImage: '',
      operationalAdLink: ''
    }
  });
  const { runAsync: onUpdateOperationalAd, loading: isUpdatingOperationalAd } = useRequest(
    postUpdateOperationalAd,
    {
      successToast: t('common:save_success'),
      errorToast: t('admin:save_failed')
    }
  );
  const { runAsync: onClearOperationalAd, loading: isClearingOperationalAd } = useRequest(
    async () => {
      const result = await postUpdateOperationalAd({
        operationalAdImage: '',
        operationalAdLink: ''
      });
      resetOperationalAd({
        operationalAdImage: '',
        operationalAdLink: ''
      });
      return result;
    },
    {
      successToast: t('admin:clear_success'),
      errorToast: t('admin:clear_failed')
    }
  );
  useMount(async () => {
    const res = await getOperationalAd();
    resetOperationalAd({
      operationalAdImage: res?.operationalAdImage || '',
      operationalAdLink: res?.operationalAdLink || ''
    });
  });

  // 4. 底部活动全屏广告
  const { ConfirmModal: ConfirmActivityAd, openConfirm: onOpenConfirmActivityAd } = useConfirm({
    content: t('admin:confirm_save_campaign_ad_config')
  });
  const { ConfirmModal: ConfirmClearActivityAd, openConfirm: onOpenConfirmClearActivityAd } =
    useConfirm({
      content: t('admin:confirm_clear_campaign_ad_config')
    });
  const {
    control: controlActivityAd,
    register: registerActivityAd,
    handleSubmit: handleSubmitActivityAd,
    reset: resetActivityAd
  } = useForm({
    defaultValues: {
      activityAdImage: '',
      activityAdLink: ''
    }
  });
  const { runAsync: onUpdateActivityAd, loading: isUpdatingActivityAd } = useRequest(
    postUpdateActivityAd,
    {
      successToast: t('common:save_success'),
      errorToast: t('admin:save_failed')
    }
  );
  const { runAsync: onClearActivityAd, loading: isClearingActivityAd } = useRequest(
    async () => {
      const result = await postUpdateActivityAd({ activityAdImage: '', activityAdLink: '' });
      resetActivityAd({
        activityAdImage: '',
        activityAdLink: ''
      });
      return result;
    },
    {
      successToast: t('admin:clear_success'),
      errorToast: t('admin:clear_failed')
    }
  );
  useMount(async () => {
    const res = await getActivityAd();
    resetActivityAd({
      activityAdImage: res?.activityAdImage || '',
      activityAdLink: res?.activityAdLink || ''
    });
  });

  return (
    <AdminSettingPage
      headerTitle={t('admin:page_title_inform')}
      headerDescription={t('admin:page_description_inform')}
      tocItems={tocItems}
    >
      {/* 1. 系统公告配置 */}
      <AdminSettingSection id="systemModal" title={t('admin:system_announcement_config')}>
        <Text fontSize={'xs'} color={'myGray.500'} mb={4}>
          {t('admin:after_an_announcement_is_set_users_see_a_modal_prompt_when_t')}
        </Text>

        <AdminFormItem label={t('admin:announcement_content_markdown')} isRequired mb={4}>
          <Textarea
            rows={8}
            {...registerSystemMsgModal('content', { required: true })}
            placeholder={t('admin:markdown_supported_e_g_system_maintenance_notice')}
          />
        </AdminFormItem>

        <Box mb={2}>
          <Button
            colorScheme={'blue'}
            size={'sm'}
            px={6}
            isLoading={isUpdatingSystemModal}
            onClick={handleSubmitUpdateSystemMsgModal((data) =>
              onOpenConfirmSystemModal({ onConfirm: () => onUpdateSystemModal(data) })()
            )}
          >
            {t('admin:save_announcement')}
          </Button>
        </Box>
      </AdminSettingSection>

      {/* 2. 发送系统通知 */}
      <AdminSettingSection id="sendInform" title={t('admin:send_system_notification')} showDivider>
        <Text fontSize={'xs'} color={'myGray.500'} mb={4}>
          {t('admin:broadcast_a_notification_to_all_registered_users_different_l')}
        </Text>

        <AdminFormItem label={t('admin:notification_level')} isRequired mb={4}>
          <MySelect
            width={'100%'}
            maxW={'400px'}
            list={[
              { label: t('admin:normal_in_app_message_only'), value: InformLevelEnum.common },
              { label: t('admin:important_in_app_login_modal'), value: InformLevelEnum.important },
              {
                label: t('admin:urgent_in_app_login_modal_email_sms'),
                value: InformLevelEnum.emergency
              }
            ]}
            value={informLevel}
            onChange={(value) => setValue('level', value)}
          />
        </AdminFormItem>

        <AdminFormItem label={t('admin:notification_title')} isRequired mb={4}>
          <Input
            placeholder={t('admin:enter_the_notification_title')}
            {...registerSystemInform('title', { required: true })}
          />
        </AdminFormItem>

        <AdminFormItem label={t('admin:notification_body')} isRequired mb={4}>
          <Textarea
            rows={6}
            placeholder={t('admin:enter_the_notification_body')}
            {...registerSystemInform('content', { required: true })}
          />
        </AdminFormItem>

        <Box mb={2}>
          <Button
            colorScheme={'blue'}
            size={'sm'}
            px={6}
            isLoading={isUpdatingSendSystemMsg}
            onClick={handleSubmitSendSystemInform((data) =>
              onOpenConfirmSendSystemMsg({ onConfirm: () => onUpdateSendSystemMsg(data) })()
            )}
          >
            {t('admin:confirm_broadcast')}
          </Button>
        </Box>
      </AdminSettingSection>

      {/* 3. 积分区广告配置 */}
      <AdminSettingSection id="operationalAd" title={t('admin:points_area_ad_config')} showDivider>
        <Text fontSize={'xs'} color={'myGray.500'} mb={4}>
          {t('admin:configure_the_operations_ad_shown_persistently_in_the_points')}
        </Text>

        <AdminFormItem label={t('admin:ad_banner_image')} mb={4}>
          <Box maxW={'360px'}>
            <ImageInput control={controlOperationalAd} name="operationalAdImage" />
          </Box>
        </AdminFormItem>

        <AdminFormItem
          label={t('admin:click_to_open_link')}
          tooltip={t('admin:destination_url_external_or_internal_after_a_user_clicks_the')}
          mb={4}
        >
          <Input
            {...registerOperationalAd('operationalAdLink')}
            placeholder={t('admin:enter_a_full_url_e_g_https_example_com_promo')}
          />
        </AdminFormItem>

        <HStack spacing={3} mb={2}>
          <Button
            colorScheme={'blue'}
            size={'sm'}
            px={6}
            isLoading={isUpdatingOperationalAd}
            onClick={handleSubmitOperationalAd((data) =>
              onOpenConfirmOperationalAd({ onConfirm: () => onUpdateOperationalAd(data) })()
            )}
          >
            {t('admin:save_ad_config')}
          </Button>
          <Button
            variant={'outline'}
            colorScheme={'red'}
            size={'sm'}
            px={5}
            isLoading={isClearingOperationalAd}
            onClick={() =>
              onOpenConfirmClearOperationalAd({ onConfirm: () => onClearOperationalAd() })()
            }
          >
            {t('admin:clear_ad')}
          </Button>
        </HStack>
      </AdminSettingSection>

      {/* 4. 全屏活动广告配置 */}
      <AdminSettingSection
        id="activityAd"
        title={t('admin:fullscreen_campaign_ad_config')}
        showDivider
      >
        <Text fontSize={'xs'} color={'myGray.500'} mb={4}>
          {t('admin:configure_the_fullscreen_campaign_ad_shown_as_a_centered_mod')}
        </Text>

        <AdminFormItem label={t('admin:fullscreen_campaign_image')} mb={4}>
          <Box maxW={'420px'}>
            <ImageInput
              control={controlActivityAd}
              name="activityAdImage"
              uploadMaxW={1920}
              uploadMaxH={1920}
              uploadMaxSize={1024 * 1024 * 5}
            />
          </Box>
        </AdminFormItem>

        <AdminFormItem
          label={t('admin:click_to_open_link')}
          tooltip={t('admin:destination_url_after_a_user_clicks_the_campaign_image')}
          mb={4}
        >
          <Input
            {...registerActivityAd('activityAdLink')}
            placeholder={t('admin:enter_a_full_url_e_g_https_example_com_activity')}
          />
        </AdminFormItem>

        <HStack spacing={3} mb={2}>
          <Button
            colorScheme={'blue'}
            size={'sm'}
            px={6}
            isLoading={isUpdatingActivityAd}
            onClick={handleSubmitActivityAd((data) =>
              onOpenConfirmActivityAd({ onConfirm: () => onUpdateActivityAd(data) })()
            )}
          >
            {t('admin:save_campaign_config')}
          </Button>
          <Button
            variant={'outline'}
            colorScheme={'red'}
            size={'sm'}
            px={5}
            isLoading={isClearingActivityAd}
            onClick={() => onOpenConfirmClearActivityAd({ onConfirm: () => onClearActivityAd() })()}
          >
            {t('admin:clear_campaign')}
          </Button>
        </HStack>
      </AdminSettingSection>

      {/* 二次确认弹窗 */}
      <ConfirmSendSystemMsg />
      <ConfirmSettingSystemModal />
      <ConfirmOperationalAd />
      <ConfirmClearOperationalAd />
      <ConfirmActivityAd />
      <ConfirmClearActivityAd />
    </AdminSettingPage>
  );
};

export default InformSetting;
