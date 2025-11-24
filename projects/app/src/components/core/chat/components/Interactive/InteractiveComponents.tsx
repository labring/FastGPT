import React, { useEffect } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { Controller, useForm, type UseFormHandleSubmit } from 'react-hook-form';
import Markdown from '@/components/Markdown';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import {
  type UserInputInteractive,
  type UserSelectInteractive,
  type UserSelectOptionItemType
} from '@fastgpt/global/core/workflow/template/system/interactive/type';
import InputRender from '@/components/core/app/formRender';
import { nodeInputTypeToInputType } from '@/components/core/app/formRender/utils';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import LeftRadio from '@fastgpt/web/components/common/Radio/LeftRadio';
import { getPresignedChatFileGetUrl } from '@/web/common/file/api';
import { useContextSelector } from 'use-context-selector';
import { WorkflowRuntimeContext } from '@/components/core/chat/ChatContainer/context/workflowRuntimeContext';

const DescriptionBox = React.memo(function DescriptionBox({
  description
}: {
  description?: string;
}) {
  if (!description) return null;
  return (
    <Box mb={4}>
      <Markdown source={description} />
    </Box>
  );
});

export const SelectOptionsComponent = React.memo(function SelectOptionsComponent({
  interactiveParams,
  onSelect
}: {
  interactiveParams: UserSelectInteractive['params'];
  onSelect: (value: string) => void;
}) {
  const { description, userSelectOptions, userSelectedVal } = interactiveParams;

  return (
    <Box maxW={'100%'}>
      <DescriptionBox description={description} />
      <Box w={'250px'}>
        <LeftRadio<string>
          py={3.5}
          gridGap={3}
          align={'center'}
          list={userSelectOptions.map((option: UserSelectOptionItemType) => ({
            title: (
              <Box fontSize={'sm'} whiteSpace={'pre-wrap'} wordBreak={'break-word'}>
                {option.value}
              </Box>
            ),
            value: option.value
          }))}
          value={userSelectedVal || ''}
          defaultBg={'white'}
          activeBg={'white'}
          onChange={(val) => onSelect(val)}
          isDisabled={!!userSelectedVal}
        />
      </Box>
    </Box>
  );
});

export const FormInputComponent = React.memo(function FormInputComponent({
  interactiveParams: { description, inputForm, submitted },
  defaultValues = {},
  chatItemDataId,
  SubmitButton
}: {
  interactiveParams: UserInputInteractive['params'];
  defaultValues?: Record<string, any>;
  chatItemDataId?: string;
  SubmitButton: (e: { onSubmit: UseFormHandleSubmit<Record<string, any>> }) => React.JSX.Element;
}) {
  // 尝试从 sessionStorage 恢复表单数据
  const savedFormData = React.useMemo(() => {
    if (typeof window !== 'undefined' && chatItemDataId) {
      // 如果已提交，优先尝试从 submitted 缓存恢复
      if (submitted) {
        const submittedData = sessionStorage.getItem(`interactiveForm_${chatItemDataId}_submitted`);
        if (submittedData) {
          try {
            const parsedData = JSON.parse(submittedData);
            // 处理文件类型字段：将简化的文件对象转换回完整的文件对象
            inputForm?.forEach((item) => {
              if (
                item.type === 'fileSelect' &&
                Array.isArray(parsedData[item.key]) &&
                parsedData[item.key].length > 0
              ) {
                const files = parsedData[item.key];
                // 检查是否是简化的文件对象（只有 url, key, name, type）
                if (files[0]?.url && !files[0]?.id) {
                  // 转换为完整的文件对象
                  parsedData[item.key] = files.map((file: any) => ({
                    id: file.key || `${Date.now()}-${Math.random()}`,
                    type: file.type || 'file',
                    name: file.name || 'file',
                    url: file.url,
                    key: file.key,
                    icon: file.type === 'image' ? file.url : 'common/file',
                    status: 1
                  }));
                }
              }
            });
            return parsedData;
          } catch (e) {}
        }
        return defaultValues;
      }

      const saved = sessionStorage.getItem(`interactiveForm_${chatItemDataId}`);
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          return defaultValues;
        }
      }
    }
    return defaultValues;
  }, [chatItemDataId, defaultValues, submitted, inputForm]);

  const { handleSubmit, control, watch, reset, setValue } = useForm({
    defaultValues: savedFormData
  });

  const appId = useContextSelector(WorkflowRuntimeContext, (v) => v.appId);
  const outLinkAuthData = useContextSelector(WorkflowRuntimeContext, (v) => v.outLinkAuthData);

  // 当 savedFormData 变化时，重置表单
  React.useEffect(() => {
    reset(savedFormData);
  }, [savedFormData, reset]);

  // 刷新文件 URL（处理 TTL 过期）
  useEffect(() => {
    if (!submitted || !inputForm) return;

    // 遍历所有文件类型字段，刷新 URL
    const refreshFileUrls = async () => {
      for (const item of inputForm) {
        if (item.type === 'fileSelect' && savedFormData[item.key]) {
          const files = savedFormData[item.key];
          if (Array.isArray(files) && files.length > 0 && files[0]?.key) {
            try {
              // 刷新每个文件的 URL
              const refreshedFiles = await Promise.all(
                files.map(async (file: any) => {
                  if (file.key) {
                    try {
                      const newUrl = await getPresignedChatFileGetUrl({
                        key: file.key,
                        appId,
                        outLinkAuthData
                      });
                      return {
                        ...file,
                        url: newUrl,
                        icon: file.type === 'image' ? newUrl : file.icon
                      };
                    } catch (error) {
                      console.error('Failed to refresh file URL:', error);
                      return file; // 保留原 URL
                    }
                  }
                  return file;
                })
              );
              // 更新表单值
              setValue(item.key, refreshedFiles);
            } catch (error) {
              console.error('Failed to refresh file URLs:', error);
            }
          }
        }
      }
    };

    refreshFileUrls();
  }, [submitted, inputForm, savedFormData, appId, outLinkAuthData, setValue]);

  // 监听表单变化并保存到 sessionStorage
  const formValues = watch();
  React.useEffect(() => {
    if (typeof window !== 'undefined' && chatItemDataId && !submitted) {
      sessionStorage.setItem(`interactiveForm_${chatItemDataId}`, JSON.stringify(formValues));
    }
  }, [formValues, chatItemDataId, submitted]);

  return (
    <Box>
      <DescriptionBox description={description} />
      <Flex flexDirection={'column'} gap={3}>
        {inputForm.map((input) => {
          const inputType = nodeInputTypeToInputType([input.type]);

          return (
            <Box key={input.key}>
              <Flex alignItems={'center'} mb={1}>
                {input.required && <Box color={'red.500'}>*</Box>}
                <FormLabel>{input.label}</FormLabel>
                {input.description && <QuestionTip ml={1} label={input.description} />}
              </Flex>
              <Controller
                key={input.key}
                control={control}
                name={input.key}
                rules={{ required: input.required }}
                render={({ field: { onChange, value }, fieldState: { error } }) => {
                  return (
                    <InputRender
                      {...input}
                      inputType={inputType}
                      value={value}
                      onChange={onChange}
                      isDisabled={submitted}
                      isInvalid={!!error}
                      maxLength={input.maxLength}
                      min={input.min}
                      max={input.max}
                      list={input.list}
                      isRichText={false}
                      canLocalUpload={true}
                      canSelectFile={true}
                    />
                  );
                }}
              />
            </Box>
          );
        })}
      </Flex>

      {!submitted && (
        <Flex justifyContent={'flex-end'} mt={4}>
          <SubmitButton onSubmit={handleSubmit} />
        </Flex>
      )}
    </Box>
  );
});
