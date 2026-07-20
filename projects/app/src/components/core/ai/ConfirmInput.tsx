import React, { useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertIcon,
  Box,
  Button,
  ModalBody,
  ModalFooter
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useMemoizedFn } from 'ahooks';
import MyModal from '@fastgpt/web/components/common/MyModal';
import DeleteConfirmInput from '@fastgpt/web/components/common/DeleteConfirmInput';

/**
 * 危险操作二次确认弹窗（设计 §12 / F2-S3、F2-S4、F3-S3、F3-S4）：
 * 确认按钮在输入值与 confirmValue（模型名/渠道名）完全匹配前保持禁用；
 * 不传 confirmValue 时（如删除渠道但无受影响模型）退化为普通确认弹窗。
 *
 * Confirm-with-input modal for dangerous operations (design §12): the confirm
 * button stays disabled until the input matches `confirmValue` (model/channel
 * name). When `confirmValue` is omitted (e.g. deleting a channel with no
 * affected models) it degrades to a plain confirm dialog.
 */
export type ConfirmInputProps = {
  title: React.ReactNode; // Modal title
  message: React.ReactNode; // Warning copy, rendered in an Alert banner
  detail?: React.ReactNode; // Affected resources list (e.g. joined affected model names)
  confirmPlaceholder?: string; // Input placeholder
  confirmValue?: string; // Value the input must match; empty = no input confirmation
  onConfirm: () => void | Promise<void>;
};

export const ConfirmInput = ({
  isOpen,
  onClose,
  title,
  message,
  detail,
  confirmPlaceholder,
  confirmValue,
  onConfirm
}: ConfirmInputProps & { isOpen: boolean; onClose: () => void }) => {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);

  const isInputRequired = !!confirmValue;
  const canConfirm = !isInputRequired || inputValue.trim() === confirmValue.trim();

  // Reset the input each time the modal opens. Adjusted during render (React
  // "adjusting state during rendering" pattern) instead of an effect.
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setInputValue('');
      setLoading(false);
    }
  }

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setLoading(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <MyModal isOpen={isOpen} onClose={onClose} isCentered title={title}>
      <ModalBody>
        <Alert status="warning" borderRadius="md">
          <AlertIcon />
          <AlertDescription fontSize="sm" color={'myGray.900'}>
            {message}
          </AlertDescription>
        </Alert>
        {!!detail && (
          <Box mt={4}>
            <Box fontSize={'sm'} color={'myGray.600'}>
              {t('account_model:affected_resources')}
            </Box>
            <Box mt={1} fontSize={'sm'} color={'myGray.900'} whiteSpace={'pre-wrap'}>
              {detail}
            </Box>
          </Box>
        )}
        {isInputRequired && (
          <Box mt={4}>
            <DeleteConfirmInput
              value={inputValue}
              confirmText={confirmValue}
              onChange={setInputValue}
              placeholder={confirmPlaceholder}
            />
          </Box>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant={'whiteBase'} mr={3} onClick={onClose} isDisabled={loading}>
          {t('common:Cancel')}
        </Button>
        <Button
          variant={'dangerFill'}
          isDisabled={!canConfirm}
          isLoading={loading}
          onClick={handleConfirm}
        >
          {t('common:Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

/**
 * useConfirm hook 同款形态（openConfirmInput / ConfirmInputModal），
 * 供表格操作列/开关等命令式触发点使用（设计 §12.1）。
 */
export const useConfirmInput = () => {
  const [state, setState] = useState<ConfirmInputProps | null>(null);

  const openConfirmInput = useMemoizedFn((props: ConfirmInputProps) => {
    setState(props);
  });

  const onClose = useMemoizedFn(() => setState(null));

  const ConfirmInputModal = useMemoizedFn(() => {
    if (!state) return null;
    return <ConfirmInput isOpen onClose={onClose} {...state} />;
  });

  return { openConfirmInput, onClose, ConfirmInputModal };
};
