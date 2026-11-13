import React, { useMemo, useState } from 'react';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { Box, Button, Flex, Input, Switch, Text } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MySelect from '@fastgpt/web/components/common/MySelect';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import HiddenInput from '@/components/common/HiddenInput';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import {
  jsonSchema2SecretInput,
  type JSONSchemaInputType
} from '@fastgpt/global/core/app/jsonschema';
import { ModerationSecretMaskedValue } from '@fastgpt/global/core/plugin/moderation/constants';
import type { AdminModerationPluginItemType } from '@fastgpt/global/core/plugin/moderation/type';
import { postAdminSaveModerationConfig } from '@/web/core/plugin/admin/moderation/api';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';

type EditPluginModalProps = {
  plugin: AdminModerationPluginItemType;
  onClose: () => void;
  onSuccess: () => void;
};

const isJSONSchemaInput = (value: unknown): value is JSONSchemaInputType =>
  typeof value === 'object' && value !== null;

const EditPluginModal: React.FC<EditPluginModalProps> = ({ plugin, onClose, onSuccess }) => {
  const { toast } = useToast();
  const { t, i18n } = useSafeTranslation();

  const inputList = useMemo(
    () =>
      jsonSchema2SecretInput({
        jsonSchema: isJSONSchemaInput(plugin.secretSchema) ? plugin.secretSchema : undefined,
        lang: i18n.language
      }) ?? [],
    [plugin.secretSchema, i18n.language]
  );

  // 初始化表单状态：复用已保存的 secretsVal
  const [formValues, setFormValues] = useState<Record<string, any>>(() => {
    return { ...(plugin.secretsVal ?? {}) };
  });

  // 记录哪些 secret 字段用户主动点击了“重新修改”
  const [clearedSecretKeys, setClearedSecretKeys] = useState<Set<string>>(new Set());

  const handleFieldChange = (key: string, value: any) => {
    setFormValues((prev) => ({
      ...prev,
      [key]: value
    }));
  };

  const handleClearSecret = (key: string) => {
    setClearedSecretKeys((prev) => new Set(prev).add(key));
    setFormValues((prev) => ({
      ...prev,
      [key]: ''
    }));
  };

  const { runAsync: handleSave, loading: saving } = useRequest(
    async () => {
      // 校验规则：保存时检查是否有必填项空值，有则阻止保存
      for (const field of inputList) {
        if (field.required) {
          const val = formValues[field.key];
          // 如果字段是 secret 且未被清除（仍是脱敏占位），说明已有有效值
          const isConfiguredMasked =
            field.inputType === 'secret' &&
            val === ModerationSecretMaskedValue &&
            !clearedSecretKeys.has(field.key);

          if (!isConfiguredMasked) {
            if (
              val === undefined ||
              val === null ||
              (typeof val === 'string' && val.trim() === '')
            ) {
              toast({
                status: 'warning',
                title: t('admin:moderation.required_field', { label: field.label || field.key })
              });
              return;
            }
          }
        }
      }

      await postAdminSaveModerationConfig({
        pluginId: plugin.pluginId,
        secretsVal: formValues
      });

      toast({
        status: 'success',
        title: t('admin:moderation.config_saved')
      });
      onSuccess();
      onClose();
    },
    {
      manual: true,
      // Provider responses may contain technical details; show actionable guidance instead.
      errorToast: '',
      onError: () => {
        toast({
          status: 'error',
          title: t('admin:moderation.config_save_failed'),
          description: t('admin:moderation.config_save_failed_desc')
        });
      }
    }
  );

  return (
    <MyModal
      isOpen
      onClose={onClose}
      title={plugin.name || plugin.pluginId}
      isCentered
      w={'480px'}
      footer={
        <>
          <Button variant={'whiteBase'} onClick={onClose} isDisabled={saving}>
            {t('common:Cancel')}
          </Button>
          <Button onClick={() => void handleSave().catch(() => {})} isLoading={saving}>
            {t('common:Save')}
          </Button>
        </>
      }
    >
      <Flex flexDirection={'column'} gap={5}>
        {inputList.length === 0 ? (
          <Text color={'myGray.500'} fontSize={'sm'}>
            {t('admin:moderation.no_extra_params')}
          </Text>
        ) : (
          inputList.map((item) => {
            const val = formValues[item.key];
            const isMasked =
              item.inputType === 'secret' &&
              val === ModerationSecretMaskedValue &&
              !clearedSecretKeys.has(item.key);

            return (
              <Box key={item.key}>
                <Flex alignItems={'center'} gap={1} mb={2}>
                  <Text fontSize={'sm'} fontWeight={'medium'} color={'myGray.900'}>
                    {item.label || item.key}
                  </Text>
                  {item.required && (
                    <Text color={'red.500'} fontSize={'sm'}>
                      *
                    </Text>
                  )}
                  {item.description && <QuestionTip label={item.description} />}
                </Flex>

                {/* 针对不同类型的输入项分别渲染 */}
                {isMasked ? (
                  <Flex alignItems={'center'} gap={2}>
                    <Flex
                      flex={1}
                      h={'36px'}
                      px={3}
                      borderRadius={'md'}
                      border={'1px solid'}
                      borderColor={'primary.200'}
                      bg={'primary.50'}
                      alignItems={'center'}
                      gap={2}
                    >
                      <MyIcon name="checkCircle" w={'16px'} color={'primary.600'} />
                      <Text fontSize={'sm'} color={'primary.700'}>
                        {t('admin:moderation.credentials_configured')}
                      </Text>
                    </Flex>
                    <Button
                      size={'sm'}
                      variant={'whiteBase'}
                      onClick={() => handleClearSecret(item.key)}
                    >
                      {t('admin:moderation.edit')}
                    </Button>
                  </Flex>
                ) : item.inputType === 'secret' ? (
                  <HiddenInput
                    h={'36px'}
                    placeholder={
                      item.placeholder ??
                      t('admin:moderation.input_placeholder', { label: item.label || item.key })
                    }
                    value={typeof val === 'string' ? val : ''}
                    onChange={(e) => handleFieldChange(item.key, e.target.value)}
                  />
                ) : item.inputType === 'switch' ? (
                  <Switch
                    isChecked={!!val}
                    onChange={(e) => handleFieldChange(item.key, e.target.checked)}
                  />
                ) : item.inputType === 'numberInput' ? (
                  <MyNumberInput
                    h={'36px'}
                    w={'100%'}
                    placeholder={
                      item.placeholder ??
                      t('admin:moderation.input_placeholder', { label: item.label || item.key })
                    }
                    value={val ?? ''}
                    onChange={(value) => {
                      // Optional cleared numbers must submit null to explicitly delete the stored field in JSON.
                      handleFieldChange(item.key, typeof value === 'number' ? value : null);
                    }}
                  />
                ) : item.inputType === 'select' ? (
                  <MySelect
                    width={'100%'}
                    placeholder={
                      item.placeholder ??
                      t('admin:moderation.select_placeholder', { label: item.label || item.key })
                    }
                    value={val}
                    list={
                      item.list?.map((opt) => ({
                        label: opt.label,
                        value: opt.value
                      })) ?? []
                    }
                    onChange={(newVal) => handleFieldChange(item.key, newVal)}
                  />
                ) : (
                  <Input
                    h={'36px'}
                    placeholder={
                      item.placeholder ??
                      t('admin:moderation.input_placeholder', { label: item.label || item.key })
                    }
                    value={val ?? ''}
                    onChange={(e) => handleFieldChange(item.key, e.target.value)}
                  />
                )}
              </Box>
            );
          })
        )}
      </Flex>
    </MyModal>
  );
};

export default EditPluginModal;
