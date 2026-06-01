import { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import { useForm, useWatch } from 'react-hook-form';
import type { ChatInputGuideConfigType } from '@fastgpt/global/core/app/type';
import { useToast } from '@fastgpt/web/hooks/useToast';

type UseInputGuideConfigFormProps = {
  isOpen: boolean;
  value: ChatInputGuideConfigType;
  total: number;
  onClose: () => void;
  onChange: (e: ChatInputGuideConfigType) => void;
};

const isHttpUrl = (value: string) => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
};

/**
 * 管理输入引导主配置弹窗的草稿态。
 * 弹窗内修改只写入 react-hook-form，确认时才校验并提交，避免开关或输入框变更立即影响应用配置。
 */
export const useInputGuideConfigForm = ({
  isOpen,
  value,
  total,
  onClose,
  onChange
}: UseInputGuideConfigFormProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { register, reset, control, setValue, handleSubmit } = useForm<ChatInputGuideConfigType>({
    defaultValues: value
  });
  const draftOpen = useWatch({ control, name: 'open' });
  const draftCustomUrl = useWatch({ control, name: 'customUrl' }) || '';
  const trimmedCustomUrl = draftCustomUrl.trim();

  // 每次重新打开弹窗时从外部配置恢复草稿，关闭后丢弃未确认的修改。
  useEffect(() => {
    if (!isOpen) return;

    reset(value);
  }, [isOpen, reset, value]);

  const handleConfirm = useCallback(
    (data: ChatInputGuideConfigType) => {
      if (data.open) {
        if (trimmedCustomUrl && !isHttpUrl(trimmedCustomUrl)) {
          toast({
            status: 'warning',
            title: t('app:input_guide_custom_url_invalid')
          });
          return;
        }

        // 这里不是自定义地址字段自身错误，用户也可以通过配置词库满足条件，因此只 toast 提醒。
        if (!trimmedCustomUrl && total <= 0) {
          toast({
            status: 'warning',
            title: t('app:input_guide_config_required')
          });
          return;
        }
      }

      onChange({
        ...data,
        customUrl: trimmedCustomUrl
      });
      onClose();
    },
    [onChange, onClose, t, toast, total, trimmedCustomUrl]
  );

  const handleConfirmSubmit = useMemo(
    () => handleSubmit(handleConfirm),
    [handleConfirm, handleSubmit]
  );

  const setDraftOpen = useCallback(
    (open: boolean) => {
      setValue('open', open);
    },
    [setValue]
  );

  const customUrlRegister = register('customUrl');

  return {
    customUrlRegister,
    draftOpen: !!draftOpen,
    handleConfirmSubmit,
    setDraftOpen
  };
};
