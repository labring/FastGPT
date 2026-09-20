import React, { useCallback } from 'react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { Button, ModalBody, ModalFooter, useDisclosure } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { LOGO_ICON } from '@fastgpt/global/common/system/constants';
import { getSystemMsgModalData } from '@/web/support/user/inform/api';
import dynamic from 'next/dynamic';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { webPushTrack } from '@/web/common/middle/tracks/utils';
const Markdown = dynamic(() => import('@/components/Markdown'), { ssr: false });

const SystemMsgModal = () => {
  const { t } = useTranslation();
  const { userInfo, systemMsgReadId, setSysMsgReadId } = useUserStore();
  const { feConfigs } = useSystemStore();

  const { isOpen, onOpen, onClose } = useDisclosure();

  const { data } = useRequest(
    async () => {
      if (!userInfo?._id) {
        return;
      }
      // 系统公告由商业版提供，未授权（含 License 已到期）时接口会拒绝，不发起请求避免报错弹窗
      if (!feConfigs?.isPlus) {
        return;
      }
      return getSystemMsgModalData();
    },
    {
      refreshDeps: [systemMsgReadId, userInfo?._id, feConfigs?.isPlus],
      manual: false,
      // 公告属于附加展示：未配置或不可用时静默跳过，不向用户报错
      errorToast: '',
      onSuccess(res) {
        if (res?.content && (!systemMsgReadId || res.id !== systemMsgReadId)) {
          onOpen();
        }
      }
    }
  );

  const onclickRead = useCallback(() => {
    if (!data) return;
    setSysMsgReadId(data.id);

    webPushTrack.readSystemAnnouncement({
      announcementId: data.id
    });

    onClose();
  }, [data, onClose, setSysMsgReadId]);

  return isOpen ? (
    <MyModal isOpen iconSrc={LOGO_ICON} title={t('common:support.user.inform.System message')}>
      <ModalBody overflow={'auto'}>
        <Markdown source={data?.content} />
      </ModalBody>
      <ModalFooter>
        <Button onClick={onclickRead}>{t('common:support.inform.Read')}</Button>
      </ModalFooter>
    </MyModal>
  ) : null;
};

export default React.memo(SystemMsgModal);
