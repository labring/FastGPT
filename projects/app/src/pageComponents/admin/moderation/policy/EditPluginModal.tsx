import React, { useMemo, useState } from 'react';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { Box, Button, Flex, Input, ModalBody, ModalFooter, Switch, Text } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MySelect from '@fastgpt/web/components/common/MySelect';
import HiddenInput from '@/components/common/HiddenInput';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { jsonSchema2SecretInput } from '@fastgpt/global/core/app/jsonschema';
import { ModerationSecretMaskedValue } from '@fastgpt/global/core/plugin/moderation/constants';
import type { AdminModerationPluginItemType } from '@fastgpt/global/core/plugin/moderation/type';
import { postAdminSaveModerationConfig } from '@/web/core/plugin/admin/moderation/api';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';

type EditPluginModalProps = {
  plugin: AdminModerationPluginItemType;
  onClose: () => void;
  onSuccess: () => void;
};

const EditPluginModal: React.FC<EditPluginModalProps> = ({ plugin, onClose, onSuccess }) => {
  const { toast } = useToast();
  const { i18n } = useSafeTranslation();

  const inputList = useMemo(
    () =>
      jsonSchema2SecretInput({ jsonSchema: plugin.secretSchema as any, lang: i18n.language }) ?? [],
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
                title: `请填写必填项: ${field.label || field.key}`
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
        title: '配置已保存'
      });
      onSuccess();
      onClose();
    },
    {
      manual: true,
      errorToast: '保存配置失败'
    }
  );

  return (
    <MyModal
      isOpen
      onClose={onClose}
      title={plugin.name || plugin.pluginId}
      isCentered
      maxW={['90vw', '480px']}
    >
      <ModalBody pt={2} pb={4}>
        <Flex flexDirection={'column'} gap={5}>
          {inputList.length === 0 ? (
            <Text color={'myGray.500'} fontSize={'sm'}>
              该插件无需配置附加参数。
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
                        h={'38px'}
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
                          已配置凭据
                        </Text>
                      </Flex>
                      <Button
                        size={'sm'}
                        variant={'whiteBase'}
                        onClick={() => handleClearSecret(item.key)}
                      >
                        修改
                      </Button>
                    </Flex>
                  ) : item.inputType === 'secret' ? (
                    <HiddenInput
                      h={'38px'}
                      placeholder={item.placeholder ?? `请输入 ${item.label || item.key}`}
                      value={typeof val === 'string' ? val : ''}
                      onChange={(e: any) => handleFieldChange(item.key, e.target.value)}
                    />
                  ) : item.inputType === 'switch' ? (
                    <Switch
                      isChecked={!!val}
                      onChange={(e) => handleFieldChange(item.key, e.target.checked)}
                    />
                  ) : item.inputType === 'select' ? (
                    <MySelect
                      width={'100%'}
                      placeholder={item.placeholder ?? `请选择 ${item.label || item.key}`}
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
                      h={'38px'}
                      placeholder={item.placeholder ?? `请输入 ${item.label || item.key}`}
                      value={val ?? ''}
                      onChange={(e) => handleFieldChange(item.key, e.target.value)}
                    />
                  )}
                </Box>
              );
            })
          )}
        </Flex>
      </ModalBody>

      <ModalFooter>
        <Button variant={'whiteBase'} mr={3} onClick={onClose} isDisabled={saving}>
          取消
        </Button>
        <Button onClick={handleSave} isLoading={saving}>
          保存
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default EditPluginModal;
