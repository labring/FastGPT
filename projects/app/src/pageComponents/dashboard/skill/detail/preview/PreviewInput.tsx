import React, { useRef, useCallback } from 'react';
import { Box, Flex, Textarea, useBoolean } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useForm, useFieldArray } from 'react-hook-form';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { documentFileType } from '@fastgpt/global/common/file/constants';
import type { PreviewInputFormType, UserInputFileItemType } from './type';
import { textareaMinH } from './constants';
import { usePreviewFileUpload } from './usePreviewFileUpload';
import FilePreview from './FilePreview';

type PreviewInputProps = {
  appId: string;
  isChatting: boolean;
  onSend: (text: string, files: UserInputFileItemType[]) => void;
  onStop: () => void;
};

const fileTypeFilter = (file: File) =>
  file.type.includes('image') ||
  documentFileType.split(',').some((type) => file.name.endsWith(type.trim()));

const PreviewInput = ({ appId, isChatting, onSend, onStop }: PreviewInputProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const TextareaDom = useRef<HTMLTextAreaElement | null>(null);
  const [focusing, { on: onFocus, off: offFocus }] = useBoolean();

  const { setValue, watch, control } = useForm<PreviewInputFormType>({
    defaultValues: { input: '', files: [] }
  });
  const inputValue = watch('input');

  const fileCtrl = useFieldArray({ control, name: 'files' });

  const {
    File,
    onOpenSelectFile,
    fileList,
    onSelectFile,
    uploadFiles,
    removeFiles,
    replaceFiles,
    hasFileUploading,
    selectFileIcon,
    selectFileLabel
  } = usePreviewFileUpload({
    fileCtrl,
    appId,
    chatId: '' // TODO: 运行预览时生成或获取 chatId
  });

  const canSendMessage = (!!inputValue || fileList.length > 0) && !hasFileUploading;

  useRequest(uploadFiles, {
    manual: false,
    errorToast: t('common:upload_file_error'),
    refreshDeps: [fileList, appId]
  });

  const handleSend = useCallback(() => {
    if (!canSendMessage) return;
    const text = TextareaDom.current?.value || '';
    onSend(text.trim(), fileList);
    replaceFiles([]);
    setValue('input', '');
  }, [canSendMessage, fileList, onSend, replaceFiles, setValue]);

  const iconSize = { w: '20px', h: '20px' };
  const activeStyles = {
    boxShadow: '0px 5px 20px -4px rgba(19, 51, 107, 0.13)',
    border: '0.5px solid rgba(0, 0, 0, 0.24)'
  };

  return (
    <Box
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const files = Array.from(e.dataTransfer.files).filter(fileTypeFilter);
        if (files.length > 0) onSelectFile({ files });
        const invalid = Array.from(e.dataTransfer.files)
          .filter((f) => !fileTypeFilter(f))
          .map((f) => f.name)
          .join(', ');
        if (invalid) {
          toast({
            status: 'warning',
            title: t('chat:unsupported_file_type'),
            description: invalid
          });
        }
      }}
    >
      <Flex
        direction={'column'}
        minH={'96px'}
        pt={fileList.length > 0 ? '0' : 4}
        pb={3}
        borderRadius={'xxl'}
        bg={'white'}
        overflow={'hidden'}
        {...(focusing
          ? activeStyles
          : {
              _hover: activeStyles,
              border: '0.5px solid rgba(0, 0, 0, 0.18)',
              boxShadow: '0px 5px 16px -4px rgba(19, 51, 107, 0.08)'
            })}
        onClick={() => TextareaDom?.current?.focus()}
      >
        <Box flex={1}>
          {/* File preview */}
          <Box px={3}>
            <FilePreview fileList={fileList} removeFiles={removeFiles} />
          </Box>

          {/* Textarea */}
          <Flex w={'100%'} mt={fileList.length > 0 ? 1 : 0}>
            <Textarea
              ref={TextareaDom}
              py={0}
              mx={4}
              px={2}
              border={'none'}
              _focusVisible={{ border: 'none' }}
              placeholder={t('common:core.chat.Type a message')}
              resize={'none'}
              rows={1}
              height={6}
              lineHeight={6}
              maxHeight={32}
              minH={'50px'}
              mb={0}
              maxLength={-1}
              overflowY={'hidden'}
              overflowX={'hidden'}
              whiteSpace={'pre-wrap'}
              wordBreak={'break-word'}
              boxShadow={'none !important'}
              color={'myGray.900'}
              fontWeight={400}
              fontSize={'1rem'}
              letterSpacing={'0.5px'}
              w={'100%'}
              _placeholder={{ color: '#707070', fontSize: 'sm' }}
              value={inputValue}
              onChange={(e) => {
                const el = e.target;
                el.style.height = textareaMinH;
                const maxHeight = 128;
                el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
                el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
                setValue('input', el.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && TextareaDom.current && (e.ctrlKey || e.altKey)) {
                  const idx = TextareaDom.current.selectionStart;
                  const val = TextareaDom.current.value;
                  TextareaDom.current.value = `${val.slice(0, idx)}\n${val.slice(idx)}`;
                  TextareaDom.current.selectionStart = idx + 1;
                  TextareaDom.current.selectionEnd = idx + 1;
                  TextareaDom.current.style.height = textareaMinH;
                  TextareaDom.current.style.height = `${TextareaDom.current.scrollHeight}px`;
                  return;
                }
                // @ts-ignore
                e.key === 'a' && e.ctrlKey && e.target?.select();
                if (e.keyCode === 13 && !e.shiftKey) {
                  handleSend();
                  e.preventDefault();
                }
              }}
              onPaste={(e) => {
                const files = Array.from(e.clipboardData.items)
                  .map((item) => (item.kind === 'file' ? item.getAsFile() : undefined))
                  .filter((f): f is File => !!f && fileTypeFilter(f));
                if (files.length > 0) {
                  onSelectFile({ files });
                  e.preventDefault();
                  e.stopPropagation();
                }
              }}
              onFocus={onFocus}
              onBlur={offFocus}
            />
          </Flex>
        </Box>

        {/* Button group */}
        <Flex alignItems={'flex-start'} justifyContent={'flex-end'} w={'100%'} px={4} h={9} gap={1}>
          <Flex alignItems={'center'} gap={1}>
            {/* File selector */}
            <Flex
              alignItems={'center'}
              justifyContent={'center'}
              w={9}
              h={9}
              p={2}
              borderRadius={'sm'}
              cursor={'pointer'}
              _hover={{ bg: 'rgba(0, 0, 0, 0.04)' }}
              onClick={(e) => {
                e.stopPropagation();
                onOpenSelectFile();
              }}
            >
              <MyTooltip label={selectFileLabel}>
                <MyIcon name={selectFileIcon as any} {...iconSize} color={'#707070'} />
              </MyTooltip>
              <File onSelect={(files) => onSelectFile({ files })} />
            </Flex>

            {/* Divider */}
            <Flex alignItems={'center'} justifyContent={'center'} w={2} h={4} mr={2}>
              <Box w={'2px'} h={5} bg={'myGray.200'} />
            </Flex>

            {/* Send / Stop */}
            <Flex alignItems={'center'} w={9} h={9} borderRadius={'lg'}>
              <MyBox
                display={'flex'}
                alignItems={'center'}
                justifyContent={'center'}
                w={9}
                h={9}
                p={2}
                bg={
                  isChatting
                    ? 'primary.50'
                    : canSendMessage
                      ? 'primary.500'
                      : 'rgba(17, 24, 36, 0.1)'
                }
                borderRadius={'lg'}
                cursor={isChatting || canSendMessage ? 'pointer' : 'not-allowed'}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isChatting) return onStop();
                  return handleSend();
                }}
              >
                {isChatting ? (
                  <MyIcon {...iconSize} name={'stop'} color={'primary.600'} />
                ) : (
                  <MyTooltip label={t('common:core.chat.Send Message')}>
                    <MyIcon name={'core/chat/sendFill'} {...iconSize} color={'white'} />
                  </MyTooltip>
                )}
              </MyBox>
            </Flex>
          </Flex>
        </Flex>
      </Flex>
    </Box>
  );
};

export default React.memo(PreviewInput);
