import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { ChatRecordContext } from '@/web/core/chat/context/chatRecordContext';
import { useTranslation } from 'react-i18next';
import { useContextSelector } from 'use-context-selector';
import { PluginRunContext } from '../core/chat/ChatContainer/PluginRunBox/context';
import { useFieldArray } from 'react-hook-form';
import { useFileUpload } from '../core/chat/ChatContainer/ChatBox/hooks/useFileUpload';
import { useEffect } from 'react';
import { isEqual } from 'lodash';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { Box, Button, Flex } from '@chakra-ui/react';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import MyIcon from '@fastgpt/web/components/common/Icon';
import FilePreview from '../core/chat/ChatContainer/components/FilePreview';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import type { InputType } from '../InputRender';

const FileSelector = ({
  input,
  onChange,
  value
}: {
  input: InputType;
  onChange: (...event: any[]) => void;
  value: any;
}) => {
  const { t } = useTranslation();

  const variablesForm = useContextSelector(ChatItemContext, (v) => v.variablesForm);
  const histories = useContextSelector(ChatRecordContext, (v) => v.chatRecords);
  const appId = useContextSelector(PluginRunContext, (v) => v.appId);
  const chatId = useContextSelector(PluginRunContext, (v) => v.chatId);
  const outLinkAuthData = useContextSelector(PluginRunContext, (v) => v.outLinkAuthData);

  const fileCtrl = useFieldArray({
    control: variablesForm.control,
    name: `variables.${input.key}`
  });
  const {
    File,
    fileList,
    selectFileIcon,
    uploadFiles,
    onOpenSelectFile,
    onSelectFile,
    removeFiles,
    replaceFiles,
    hasFileUploading
  } = useFileUpload({
    fileSelectConfig: {
      canSelectFile: input.canSelectFile ?? true,
      canSelectImg: input.canSelectImg ?? false,
      maxFiles: input.maxFiles ?? 5
    },
    outLinkAuthData,
    appId,
    chatId,
    fileCtrl: fileCtrl as any
  });

  useEffect(() => {
    if (!Array.isArray(value)) {
      replaceFiles([]);
      return;
    }

    // compare file names and update if different
    const valueFileNames = value.map((item) => item.name);
    const currentFileNames = fileList.map((item) => item.name);
    if (!isEqual(valueFileNames, currentFileNames)) {
      replaceFiles(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const isDisabledInput = histories.length > 0;
  useRequest2(uploadFiles, {
    manual: false,
    errorToast: t('common:upload_file_error'),
    refreshDeps: [fileList]
  });

  useEffect(() => {
    input.setUploading?.(hasFileUploading);
    onChange(
      fileList.map((item) => ({
        type: item.type,
        name: item.name,
        url: item.url,
        icon: item.icon
      }))
    );
  }, [fileList, hasFileUploading, onChange, input.setUploading]);

  return (
    <>
      <Flex alignItems={'center'}>
        <Box position={'relative'}>
          {input.required && (
            <Box position={'absolute'} left={-2} top={'-1px'} color={'red.600'}>
              *
            </Box>
          )}
          <FormLabel fontWeight={'500'}>{t(input.label as any)}</FormLabel>
        </Box>
        {input.description && <QuestionTip ml={2} label={t(input.description as any)} />}
        <Box flex={1} />
        {/* 有历史记录，说明是已经跑过了，不能再新增了 */}
        <Button
          isDisabled={histories.length !== 0}
          leftIcon={<MyIcon name={selectFileIcon as any} w={'16px'} />}
          variant={'whiteBase'}
          onClick={() => {
            onOpenSelectFile();
          }}
        >
          {t('chat:select')}
        </Button>
      </Flex>
      <FilePreview fileList={fileList} removeFiles={isDisabledInput ? undefined : removeFiles} />
      {fileList.length === 0 && <EmptyTip py={0} mt={3} text={t('chat:not_select_file')} />}

      <File onSelect={(files) => onSelectFile({ files })} />
    </>
  );
};

export default FileSelector;
