'use client';
import { Box, Button, Flex, HStack, Input, Textarea } from '@chakra-ui/react';
import React from 'react';
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
} from '@/web/common/system/inform/api';
import { useForm } from 'react-hook-form';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { InformLevelEnum } from '@fastgpt/global/support/user/inform/constants';
import BoxCard from '@/components/admin/BoxContainer/Card';
import ImageInput from '@/pageComponents/admin/settings/ImageInput';
import { useMount } from 'ahooks';

const InformSetting = () => {
  // 系统公告

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

  // 系统通知
  const { ConfirmModal: ConfirmSendSystemMsg, openConfirm: onOpenConfirmSendSystemMsg } =
    useConfirm({
      content: '确认发送系统通知？'
    });
  const {
    setValue,
    register: registerSystemInform,
    handleSubmit: handleSubmitSendSystemInform,
    watch
  } = useForm({
    defaultValues: {
      level: InformLevelEnum.common,
      title: '',
      content: ''
    }
  });
  const informLevel = watch('level');
  const { runAsync: onUpdateSendSystemMsg, loading: isUpdatingSendSystemMsg } = useRequest(
    postSendSystemMsg,
    {
      successToast: '发送成功，通知会逐步推送'
    }
  );

  // 全屏广告
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

  // 底部广告
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
    <>
      <BoxCard>
        <HStack>
          <Box fontSize={'2xl'}>系统公告配置</Box>
          <Button
            variant={'whitePrimary'}
            size={'sm'}
            ml={2}
            isLoading={isUpdatingSystemModal}
            onClick={handleSubmitUpdateSystemMsgModal((data) =>
              onOpenConfirmSystemModal({ onConfirm: () => onUpdateSystemModal(data) })()
            )}
          >
            保存
          </Button>
        </HStack>
        <Box py={2}>
          设置该内容，会在用户登录系统后，通过弹窗形式进行强提示。用户关闭后，下次不再提示。只能设置1个该类型通知。支持
          markdown 格式。
        </Box>
        <Textarea rows={10} {...registerSystemMsgModal('content', {})} />
      </BoxCard>
      <BoxCard mt={4}>
        <HStack>
          <Box fontSize={'2xl'}>发送系统通知</Box>
          <Button
            variant={'whitePrimary'}
            size={'sm'}
            ml={2}
            isLoading={isUpdatingSendSystemMsg}
            onClick={handleSubmitSendSystemInform((data) =>
              onOpenConfirmSendSystemMsg({ onConfirm: () => onUpdateSendSystemMsg(data) })()
            )}
          >
            确认发送
          </Button>
        </HStack>
        <Box py={2}>为所有用户发送一个通知，不同等级通知，会有不同提示。</Box>
        <Flex alignItems={'center'}>
          <Box flex={'0 0 100px'} mr={2}>
            消息等级
          </Box>
          <MySelect
            list={[
              { label: '一般(仅发站内信)', value: InformLevelEnum.common },
              { label: '重要（站内信+登录通知）', value: InformLevelEnum.important },
              { label: '紧急（站内信+登录通知+邮件/短信提醒）', value: InformLevelEnum.emergency }
            ]}
            value={informLevel}
            onChange={(value) => setValue('level', value)}
          />
        </Flex>
        <Flex alignItems={'center'} mt={3}>
          <Box flex={'0 0 100px'} mr={2}>
            通知标题
          </Box>
          <Input
            placeholder="通知标题"
            {...registerSystemInform('title', {
              required: true
            })}
          ></Input>
        </Flex>
        <Textarea
          mt={2}
          rows={10}
          placeholder="通知内容"
          {...registerSystemInform('content', {
            required: true
          })}
        />
      </BoxCard>
      <BoxCard mt={4}>
        <HStack>
          <Box fontSize={'2xl'}>配置底部广告(积分区)</Box>
          <Button
            variant={'primary'}
            size={'sm'}
            ml={2}
            isLoading={isUpdatingOperationalAd}
            onClick={handleSubmitOperationalAd((data) =>
              onOpenConfirmOperationalAd({ onConfirm: () => onUpdateOperationalAd(data) })()
            )}
          >
            保存
          </Button>
          <Button
            variant={'dangerFill'}
            size={'sm'}
            isLoading={isClearingOperationalAd}
            onClick={() =>
              onOpenConfirmClearOperationalAd({ onConfirm: () => onClearOperationalAd() })()
            }
          >
            清除
          </Button>
        </HStack>
        <Box py={2}>配置运营活动广告，会常驻在工作台左下角用量卡片处</Box>

        <Box fontSize={'18px'} color={'myGray.700'}>
          运营图片
        </Box>
        <ImageInput control={controlOperationalAd} name="operationalAdImage" />
        <Box fontSize={'18px'} color={'myGray.700'} mb={2}>
          跳转链接
        </Box>
        <Input
          {...registerOperationalAd('operationalAdLink')}
          placeholder="请输入完整的 URL，例如: https://example.com"
        />
      </BoxCard>
      <BoxCard mt={4}>
        <HStack>
          <Box fontSize={'2xl'}>配置全屏广告</Box>
          <Button
            variant={'primary'}
            size={'sm'}
            ml={2}
            isLoading={isUpdatingActivityAd}
            onClick={handleSubmitActivityAd((data) =>
              onOpenConfirmActivityAd({ onConfirm: () => onUpdateActivityAd(data) })()
            )}
          >
            保存
          </Button>
          <Button
            variant={'dangerFill'}
            size={'sm'}
            isLoading={isClearingActivityAd}
            onClick={() => onOpenConfirmClearActivityAd({ onConfirm: () => onClearActivityAd() })()}
          >
            清除
          </Button>
        </HStack>
        <Box py={2}>配置活动广告，会在用户登录进入时展示开屏弹窗</Box>

        <Box fontSize={'18px'} color={'myGray.700'}>
          活动图片
        </Box>
        <ImageInput
          control={controlActivityAd}
          name="activityAdImage"
          uploadMaxW={1920}
          uploadMaxH={1920}
          uploadMaxSize={1024 * 1024 * 5}
        />
        <Box fontSize={'18px'} color={'myGray.700'} mb={2}>
          跳转链接
        </Box>
        <Input
          {...registerActivityAd('activityAdLink')}
          placeholder="请输入完整的 URL，例如: https://example.com"
        />
      </BoxCard>
      <ConfirmSendSystemMsg />
      <ConfirmSettingSystemModal />
      <ConfirmOperationalAd />
      <ConfirmClearOperationalAd />
      <ConfirmActivityAd />
      <ConfirmClearActivityAd />
    </>
  );
};

export default InformSetting;
