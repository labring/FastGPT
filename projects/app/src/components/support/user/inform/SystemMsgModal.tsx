import React, { useCallback } from 'react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useUserStore } from '@/web/support/user/useUserStore';
import { Button, ModalBody, ModalFooter, useDisclosure } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { LOGO_ICON } from '@fastgpt/global/common/system/constants';
import { getSystemMsgModalData } from '@/web/support/user/inform/api';
import dynamic from 'next/dynamic';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { webPushTrack } from '@/web/common/middle/tracks/utils';
const Markdown = dynamic(() => import('@/components/Markdown'), { ssr: false });

const SystemMsgModal = ({}: {}) => {
  const { t } = useTranslation();
  const { userInfo, systemMsgReadId, setSysMsgReadId } = useUserStore();

  const { isOpen, onOpen, onClose } = useDisclosure();

  const { data } = useRequest2(
    async () => {
      if (!userInfo?._id) {
        return;
      }
      return getSystemMsgModalData();
    },
    {
      refreshDeps: [systemMsgReadId, userInfo?._id],
      manual: false,
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
