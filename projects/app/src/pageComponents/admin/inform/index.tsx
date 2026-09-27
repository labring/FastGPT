'use client';
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

const tocItems: SettingTOCItem[] = [
  { id: 'systemModal', label: '系统公告配置' },
  { id: 'sendInform', label: '发送系统通知' },
  { id: 'operationalAd', label: '积分区广告配置' },
  { id: 'activityAd', label: '全屏活动广告配置' }
];

const InformSetting = () => {
  // 1. 系统公告
  const { ConfirmModal: ConfirmSettingSystemModal, openConfirm: onOpenConfirmSystemModal } =
    useConfirm({
      content: '确认修改系统公告？'
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
      successToast: '修改成功'
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
      content: '确认发送系统通知？'
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
      successToast: '发送成功，通知会逐步推送'
    }
  );

  // 3. 积分区广告
  const { ConfirmModal: ConfirmOperationalAd, openConfirm: onOpenConfirmOperationalAd } =
    useConfirm({
      content: '确认保存运营广告配置？'
    });
  const { ConfirmModal: ConfirmClearOperationalAd, openConfirm: onOpenConfirmClearOperationalAd } =
    useConfirm({
      content: '确认清除运营广告配置？'
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
      successToast: '保存成功',
      errorToast: '保存失败'
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
      successToast: '清除成功',
      errorToast: '清除失败'
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
    content: '确认保存活动广告配置？'
  });
  const { ConfirmModal: ConfirmClearActivityAd, openConfirm: onOpenConfirmClearActivityAd } =
    useConfirm({
      content: '确认清除活动广告配置？'
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
      successToast: '保存成功',
      errorToast: '保存失败'
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
      successToast: '清除成功',
      errorToast: '清除失败'
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
      headerTitle={'通知管理'}
      headerDescription={'系统公告强提示、站内广播通知与运营活动广告管理'}
      tocItems={tocItems}
    >
      {/* 1. 系统公告配置 */}
      <AdminSettingSection id="systemModal" title="系统公告配置">
        <Text fontSize={'xs'} color={'myGray.500'} mb={4}>
          设置公告内容后，用户登录系统将通过弹窗进行强提示（关闭后该公告不再弹出）。仅允许设置 1
          条，支持 Markdown 语法。
        </Text>

        <AdminFormItem label="公告内容 (Markdown)" isRequired mb={4}>
          <Textarea
            rows={8}
            {...registerSystemMsgModal('content', { required: true })}
            placeholder="支持 Markdown 格式，例如：## 系统升级维护通知..."
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
            保存公告
          </Button>
        </Box>
      </AdminSettingSection>

      {/* 2. 发送系统通知 */}
      <AdminSettingSection id="sendInform" title="发送系统通知" showDivider>
        <Text fontSize={'xs'} color={'myGray.500'} mb={4}>
          向全站注册用户广播发送一条通知消息。不同消息等级对应不同的触达强度。
        </Text>

        <AdminFormItem label="消息通知等级" isRequired mb={4}>
          <MySelect
            width={'100%'}
            maxW={'400px'}
            list={[
              { label: '一般 (仅发送站内信通知)', value: InformLevelEnum.common },
              { label: '重要 (站内信 + 用户登录弹窗通知)', value: InformLevelEnum.important },
              {
                label: '紧急 (站内信 + 登录弹窗 + 邮件/短信强提醒)',
                value: InformLevelEnum.emergency
              }
            ]}
            value={informLevel}
            onChange={(value) => setValue('level', value)}
          />
        </AdminFormItem>

        <AdminFormItem label="通知标题" isRequired mb={4}>
          <Input
            placeholder="请输入通知标题"
            {...registerSystemInform('title', { required: true })}
          />
        </AdminFormItem>

        <AdminFormItem label="通知正文内容" isRequired mb={4}>
          <Textarea
            rows={6}
            placeholder="请输入通知内容正文"
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
            确认发送广播
          </Button>
        </Box>
      </AdminSettingSection>

      {/* 3. 积分区广告配置 */}
      <AdminSettingSection id="operationalAd" title="积分区广告配置" showDivider>
        <Text fontSize={'xs'} color={'myGray.500'} mb={4}>
          配置运营广告，常驻展示在主界面左下角积分用量卡片区域。
        </Text>

        <AdminFormItem label="广告横幅图片" mb={4}>
          <Box maxW={'360px'}>
            <ImageInput control={controlOperationalAd} name="operationalAdImage" />
          </Box>
        </AdminFormItem>

        <AdminFormItem label="点击跳转链接" tooltip="用户点击广告后跳转的外部或内部链接 URL" mb={4}>
          <Input
            {...registerOperationalAd('operationalAdLink')}
            placeholder="请输入完整链接，例如：https://example.com/promo"
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
            保存广告配置
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
            清除广告
          </Button>
        </HStack>
      </AdminSettingSection>

      {/* 4. 全屏活动广告配置 */}
      <AdminSettingSection id="activityAd" title="全屏活动广告配置" showDivider>
        <Text fontSize={'xs'} color={'myGray.500'} mb={4}>
          配置重大活动全屏广告，用户登录进入工作台时以全屏居中弹窗形式展现。
        </Text>

        <AdminFormItem label="全屏活动图片" mb={4}>
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

        <AdminFormItem label="点击跳转链接" tooltip="用户点击活动大图后跳转的目标 URL" mb={4}>
          <Input
            {...registerActivityAd('activityAdLink')}
            placeholder="请输入完整链接，例如：https://example.com/activity"
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
            保存活动配置
          </Button>
          <Button
            variant={'outline'}
            colorScheme={'red'}
            size={'sm'}
            px={5}
            isLoading={isClearingActivityAd}
            onClick={() => onOpenConfirmClearActivityAd({ onConfirm: () => onClearActivityAd() })()}
          >
            清除活动
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
