import React from 'react';
import { ModalBody, Box, Flex, Input, ModalFooter, Button } from '@chakra-ui/react';
import MyModal from '@/components/MyModal';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import { useRequest } from '@/web/common/hooks/useRequest';
import type { UserType } from '@fastgpt/global/support/user/type.d';

const StandDetailModal = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();

  return (
    <MyModal
      isOpen
      onClose={onClose}
      iconSrc="acount/plansBlue"
      title={t('user.OpenAI Account Setting')}
    >
      <ModalBody></ModalBody>
      <ModalFooter></ModalFooter>
    </MyModal>
  );
};

export default StandDetailModal;
