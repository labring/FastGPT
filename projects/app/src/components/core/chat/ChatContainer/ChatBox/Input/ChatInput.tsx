import { useSpeech } from '@/web/common/hooks/useSpeech';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import {
  Box,
  CircularProgress,
  CircularProgressLabel,
  Flex,
  HStack,
  Image,
  Spinner,
  Textarea
} from '@chakra-ui/react';
import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { uploadFile2DB } from '@/web/common/file/controller';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import {
  ChatBoxInputFormType,
  ChatBoxInputType,
  SendPromptFnType,
  UserInputFileItemType
} from '../type';
import { textareaMinH } from '../constants';
import { UseFormReturn, useFieldArray } from 'react-hook-form';
import { ChatBoxContext } from '../Provider';
import dynamic from 'next/dynamic';
import { useContextSelector } from 'use-context-selector';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { documentFileType } from '@fastgpt/global/common/file/constants';
import { getFileIcon } from '@fastgpt/global/common/file/icon';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { clone } from 'lodash';
import { formatFileSize } from '@fastgpt/global/common/file/tools';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { getErrText } from '@fastgpt/global/common/error/utils';

const InputGuideBox = dynamic(() => import('./InputGuideBox'));

const fileTypeFilter = (file: File) => {
  return (
    file.type.includes('image') ||
    documentFileType.split(',').some((type) => file.name.endsWith(type.trim()))
  );
};

const ChatInput = ({
  onSendMessage,
  onStop,
  TextareaDom,
  resetInputVal,
  chatForm,
  appId
}: {
  onSendMessage: SendPromptFnType;
  onStop: () => void;
  TextareaDom: React.MutableRefObject<HTMLTextAreaElement | null>;
  resetInputVal: (val: ChatBoxInputType) => void;
  chatForm: UseFormReturn<ChatBoxInputFormType>;
  appId: string;
}) => {
  const { isPc } = useSystem();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();

  const { setValue, watch, control } = chatForm;
  const inputValue = watch('input');
  const {
    update: updateFiles,
    remove: removeFiles,
    fields: fileList,
    replace: replaceFiles
  } = useFieldArray({
    control,
    name: 'files'
  });

  const {
    chatId,
    isChatting,
    whisperConfig,
    autoTTSResponse,
    chatInputGuide,
    outLinkAuthData,
    fileSelectConfig
  } = useContextSelector(ChatBoxContext, (v) => v);

  const havInput = !!inputValue || fileList.length > 0;
  const hasFileUploading = fileList.some((item) => !item.url);
  const canSendMessage = havInput && !hasFileUploading;

  const showSelectFile = fileSelectConfig.canSelectFile;
  const showSelectImg = fileSelectConfig.canSelectImg;
  const maxSelectFiles = fileSelectConfig.maxFiles ?? 10;
  const maxSize = (feConfigs?.uploadFileMaxSize || 1024) * 1024 * 1024; // nkb
  const { icon: selectFileIcon, tooltip: selectFileTip } = useMemo(() => {
    if (showSelectFile) {
      return {
        icon: 'core/chat/fileSelect',
        tooltip: t('chat:select_file')
      };
    } else if (showSelectImg) {
      return {
        icon: 'core/chat/fileSelect',
        tooltip: t('chat:select_img')
      };
    }
    return {};
  }, [showSelectFile, showSelectImg, t]);

  /* file selector and upload */
  const { File, onOpen: onOpenSelectFile } = useSelectFile({
    fileType: `${showSelectImg ? 'image/*,' : ''} ${showSelectFile ? documentFileType : ''}`,
    multiple: true,
    maxCount: maxSelectFiles
  });
  // Upload files
  useRequest2(
    async () => {
      const filterFiles = fileList.filter((item) => item.status === 0);

      if (filterFiles.length === 0) return;

      replaceFiles(fileList.map((item) => ({ ...item, status: 1 })));
      let errorFileIndex: number[] = [];

      await Promise.allSettled(
        filterFiles.map(async (file) => {
          const copyFile = clone(file);
          copyFile.status = 1;
          if (!copyFile.rawFile) return;

          try {
            const fileIndex = fileList.findIndex((item) => item.id === file.id)!;

            // Start upload and update process
            const { previewUrl } = await uploadFile2DB({
              file: copyFile.rawFile,
              bucketName: 'chat',
              outLinkAuthData,
              metadata: {
                chatId
              },
              percentListen(e) {
                copyFile.process = e;
                if (!copyFile.url) {
                  updateFiles(fileIndex, copyFile);
                }
              }
            });

            // Update file url
            copyFile.url = `${location.origin}${previewUrl}`;
            updateFiles(fileIndex, copyFile);
          } catch (error) {
            errorFileIndex.push(fileList.findIndex((item) => item.id === file.id)!);
            toast({
              status: 'warning',
              title: t(
                getErrText(error, t('common:error.upload_file_error_filename', { name: file.name }))
              )
            });
          }
        })
      );

      removeFiles(errorFileIndex);
    },
    {
      manual: false,
      errorToast: t('common:upload_file_error'),
      refreshDeps: [fileList, outLinkAuthData, chatId]
    }
  );
  const onSelectFile = useCallback(
    async (files: File[]) => {
      if (!files || files.length === 0) {
        return;
      }
      // filter max files
      if (fileList.length + files.length > maxSelectFiles) {
        files = files.slice(0, maxSelectFiles - fileList.length);
        toast({
          status: 'warning',
          title: t('chat:file_amount_over', { max: maxSelectFiles })
        });
      }

      const filterFilesByMaxSize = files.filter((file) => file.size <= maxSize);
      if (filterFilesByMaxSize.length < files.length) {
        toast({
          status: 'warning',
          title: t('file:some_file_size_exceeds_limit', { maxSize: formatFileSize(maxSize) })
        });
      }

      const loadFiles = await Promise.all(
        filterFilesByMaxSize.map(
          (file) =>
            new Promise<UserInputFileItemType>((resolve, reject) => {
              if (file.type.includes('image')) {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = () => {
                  const item: UserInputFileItemType = {
                    id: getNanoid(6),
                    rawFile: file,
                    type: ChatFileTypeEnum.image,
                    name: file.name,
                    icon: reader.result as string,
                    status: 0
                  };
                  resolve(item);
                };
                reader.onerror = () => {
                  reject(reader.error);
                };
              } else {
                resolve({
                  id: getNanoid(6),
                  rawFile: file,
                  type: ChatFileTypeEnum.file,
                  name: file.name,
                  icon: getFileIcon(file.name),
                  status: 0
                });
              }
            })
        )
      );

      // Document, image
      const concatFileList = clone(
        fileList.concat(loadFiles).sort((a, b) => {
          if (a.type === ChatFileTypeEnum.image && b.type === ChatFileTypeEnum.file) {
            return 1;
          } else if (a.type === ChatFileTypeEnum.file && b.type === ChatFileTypeEnum.image) {
            return -1;
          }
          return 0;
        })
      );
      replaceFiles(concatFileList);
    },
    [fileList, maxSelectFiles, replaceFiles, toast, t, maxSize]
  );

  /* on send */
  const handleSend = useCallback(
    async (val?: string) => {
      if (!canSendMessage) return;
      const textareaValue = val || TextareaDom.current?.value || '';

      onSendMessage({
        text: textareaValue.trim(),
        files: fileList
      });
      replaceFiles([]);
    },
    [TextareaDom, canSendMessage, fileList, onSendMessage, replaceFiles]
  );

  /* whisper init */
  const { whisperModel } = useSystemStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const {
    isSpeaking,
    isTransCription,
    stopSpeak,
    startSpeak,
    speakingTimeString,
    renderAudioGraph,
    stream
  } = useSpeech({ appId, ...outLinkAuthData });
  useEffect(() => {
    if (!stream) {
      return;
    }
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 1;
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    const renderCurve = () => {
      if (!canvasRef.current) return;
      renderAudioGraph(analyser, canvasRef.current);
      window.requestAnimationFrame(renderCurve);
    };
    renderCurve();
  }, [renderAudioGraph, stream]);
  const finishWhisperTranscription = useCallback(
    (text: string) => {
      if (!text) return;
      if (whisperConfig?.autoSend) {
        onSendMessage({
          text,
          files: fileList,
          autoTTSResponse
        });
        replaceFiles([]);
      } else {
        resetInputVal({ text });
      }
    },
    [autoTTSResponse, fileList, onSendMessage, replaceFiles, resetInputVal, whisperConfig?.autoSend]
  );
  const onWhisperRecord = useCallback(() => {
    if (isSpeaking) {
      return stopSpeak();
    }
    startSpeak(finishWhisperTranscription);
  }, [finishWhisperTranscription, isSpeaking, startSpeak, stopSpeak]);

  const RenderTranslateLoading = useMemo(
    () => (
      <Flex
        position={'absolute'}
        top={0}
        bottom={0}
        left={0}
        right={0}
        zIndex={10}
        pl={5}
        alignItems={'center'}
        bg={'white'}
        color={'primary.500'}
        visibility={isSpeaking && isTransCription ? 'visible' : 'hidden'}
      >
        <Spinner size={'sm'} mr={4} />
        {t('common:core.chat.Converting to text')}
      </Flex>
    ),
    [isSpeaking, isTransCription, t]
  );
  const RenderFilePreview = useMemo(
    () =>
      fileList.length > 0 ? (
        <Flex
          maxH={'250px'}
          overflowY={'auto'}
          wrap={'wrap'}
          px={[2, 4]}
          pt={3}
          userSelect={'none'}
          gap={2}
          mb={fileList.length > 0 ? 2 : 0}
        >
          {fileList.map((item, index) => (
            <MyBox
              key={index}
              border={'sm'}
              boxShadow={
                '0px 2.571px 6.429px 0px rgba(19, 51, 107, 0.08), 0px 0px 0.643px 0px rgba(19, 51, 107, 0.08)'
              }
              rounded={'md'}
              position={'relative'}
              _hover={{
                '.close-icon': { display: 'block' }
              }}
            >
              <MyIcon
                name={'closeSolid'}
                w={'16px'}
                h={'16px'}
                color={'myGray.700'}
                cursor={'pointer'}
                _hover={{ color: 'red.500' }}
                position={'absolute'}
                bg={'white'}
                right={'-8px'}
                top={'-8px'}
                onClick={() => removeFiles(index)}
                className="close-icon"
                display={['', 'none']}
                zIndex={10}
              />
              {item.type === ChatFileTypeEnum.image && (
                <Image
                  alt={'img'}
                  src={item.icon}
                  w={['2rem', '3rem']}
                  h={['2rem', '3rem']}
                  borderRadius={'md'}
                  objectFit={'contain'}
                />
              )}
              {item.type === ChatFileTypeEnum.file && (
                <HStack minW={['100px', '150px']} maxW={'250px'} p={2}>
                  <MyIcon name={item.icon as any} w={['1.5rem', '2rem']} h={['1.5rem', '2rem']} />
                  <Box flex={'1 0 0'} className="textEllipsis" fontSize={'xs'}>
                    {item.name}
                  </Box>
                </HStack>
              )}
              {/* Process */}
              {!item.url && (
                <Flex
                  position={'absolute'}
                  inset="0"
                  bg="rgba(255,255,255,0.4)"
                  alignItems="center"
                  justifyContent="center"
                >
                  <CircularProgress
                    value={item.process}
                    color="primary.600"
                    bg={'white'}
                    size={isPc ? '30px' : '35px'}
                  >
                    {/* <CircularProgressLabel>{item.process ?? 0}%</CircularProgressLabel> */}
                  </CircularProgress>
                </Flex>
              )}
            </MyBox>
          ))}
        </Flex>
      ) : null,
    [fileList, isPc, removeFiles]
  );
  const RenderTextarea = useMemo(
    () => (
      <Flex alignItems={'flex-end'} mt={fileList.length > 0 ? 1 : 0} pl={[2, 4]}>
        {/* file selector */}
        {(showSelectFile || showSelectImg) && (
          <Flex
            h={'22px'}
            alignItems={'center'}
            justifyContent={'center'}
            cursor={'pointer'}
            transform={'translateY(1px)'}
            onClick={() => {
              if (isSpeaking) return;
              onOpenSelectFile();
            }}
          >
            <MyTooltip label={selectFileTip}>
              <MyIcon name={selectFileIcon as any} w={'18px'} color={'myGray.600'} />
            </MyTooltip>
            <File onSelect={onSelectFile} />
          </Flex>
        )}

        {/* input area */}
        <Textarea
          ref={TextareaDom}
          py={0}
          pl={2}
          pr={['30px', '48px']}
          border={'none'}
          _focusVisible={{
            border: 'none'
          }}
          placeholder={
            isSpeaking ? t('common:core.chat.Speaking') : t('common:core.chat.Type a message')
          }
          resize={'none'}
          rows={1}
          height={'22px'}
          lineHeight={'22px'}
          maxHeight={'50vh'}
          maxLength={-1}
          overflowY={'auto'}
          whiteSpace={'pre-wrap'}
          wordBreak={'break-all'}
          boxShadow={'none !important'}
          color={'myGray.900'}
          isDisabled={isSpeaking}
          value={inputValue}
          fontSize={['md', 'sm']}
          onChange={(e) => {
            const textarea = e.target;
            textarea.style.height = textareaMinH;
            textarea.style.height = `${textarea.scrollHeight}px`;
            setValue('input', textarea.value);
          }}
          onKeyDown={(e) => {
            // enter send.(pc or iframe && enter and unPress shift)
            const isEnter = e.keyCode === 13;
            if (isEnter && TextareaDom.current && (e.ctrlKey || e.altKey)) {
              // Add a new line
              const index = TextareaDom.current.selectionStart;
              const val = TextareaDom.current.value;
              TextareaDom.current.value = `${val.slice(0, index)}\n${val.slice(index)}`;
              TextareaDom.current.selectionStart = index + 1;
              TextareaDom.current.selectionEnd = index + 1;

              TextareaDom.current.style.height = textareaMinH;
              TextareaDom.current.style.height = `${TextareaDom.current.scrollHeight}px`;

              return;
            }

            // 全选内容
            // @ts-ignore
            e.key === 'a' && e.ctrlKey && e.target?.select();

            if ((isPc || window !== parent) && e.keyCode === 13 && !e.shiftKey) {
              handleSend();
              e.preventDefault();
            }
          }}
          onPaste={(e) => {
            const clipboardData = e.clipboardData;
            if (clipboardData && (showSelectFile || showSelectImg)) {
              const items = clipboardData.items;
              const files = Array.from(items)
                .map((item) => (item.kind === 'file' ? item.getAsFile() : undefined))
                .filter((file) => {
                  console.log(file);
                  return file && fileTypeFilter(file);
                }) as File[];
              onSelectFile(files);

              if (files.length > 0) {
                e.stopPropagation();
              }
            }
          }}
        />
        <Flex alignItems={'center'} position={'absolute'} right={[2, 4]} bottom={['10px', '12px']}>
          {/* voice-input */}
          {whisperConfig.open && !havInput && !isChatting && !!whisperModel && (
            <>
              <canvas
                ref={canvasRef}
                style={{
                  height: '30px',
                  width: isSpeaking && !isTransCription ? '100px' : 0,
                  background: 'white',
                  zIndex: 0
                }}
              />
              {isSpeaking && (
                <MyTooltip label={t('common:core.chat.Cancel Speak')}>
                  <Flex
                    mr={2}
                    alignItems={'center'}
                    justifyContent={'center'}
                    flexShrink={0}
                    h={['26px', '32px']}
                    w={['26px', '32px']}
                    borderRadius={'md'}
                    cursor={'pointer'}
                    _hover={{ bg: '#F5F5F8' }}
                    onClick={() => stopSpeak(true)}
                  >
                    <MyIcon
                      name={'core/chat/cancelSpeak'}
                      width={['20px', '22px']}
                      height={['20px', '22px']}
                    />
                  </Flex>
                </MyTooltip>
              )}
              <MyTooltip
                label={
                  isSpeaking ? t('common:core.chat.Finish Speak') : t('common:core.chat.Record')
                }
              >
                <Flex
                  mr={2}
                  alignItems={'center'}
                  justifyContent={'center'}
                  flexShrink={0}
                  h={['26px', '32px']}
                  w={['26px', '32px']}
                  borderRadius={'md'}
                  cursor={'pointer'}
                  _hover={{ bg: '#F5F5F8' }}
                  onClick={onWhisperRecord}
                >
                  <MyIcon
                    name={isSpeaking ? 'core/chat/finishSpeak' : 'core/chat/recordFill'}
                    width={['20px', '22px']}
                    height={['20px', '22px']}
                    color={isSpeaking ? 'primary.500' : 'myGray.600'}
                  />
                </Flex>
              </MyTooltip>
            </>
          )}
          {/* send and stop icon */}
          {isSpeaking ? (
            <Box color={'#5A646E'} w={'36px'} textAlign={'right'} whiteSpace={'nowrap'}>
              {speakingTimeString}
            </Box>
          ) : (
            <Flex
              alignItems={'center'}
              justifyContent={'center'}
              flexShrink={0}
              h={['28px', '32px']}
              w={['28px', '32px']}
              borderRadius={'md'}
              bg={
                isSpeaking || isChatting
                  ? ''
                  : !havInput || hasFileUploading
                    ? '#E5E5E5'
                    : 'primary.500'
              }
              cursor={havInput ? 'pointer' : 'not-allowed'}
              lineHeight={1}
              onClick={() => {
                if (isChatting) {
                  return onStop();
                }
                return handleSend();
              }}
            >
              {isChatting ? (
                <MyIcon
                  animation={'zoomStopIcon 0.4s infinite alternate'}
                  width={['22px', '25px']}
                  height={['22px', '25px']}
                  cursor={'pointer'}
                  name={'stop'}
                  color={'gray.500'}
                />
              ) : (
                <MyTooltip label={t('common:core.chat.Send Message')}>
                  <MyIcon
                    name={'core/chat/sendFill'}
                    width={['18px', '20px']}
                    height={['18px', '20px']}
                    color={'white'}
                  />
                </MyTooltip>
              )}
            </Flex>
          )}
        </Flex>
      </Flex>
    ),
    [
      File,
      TextareaDom,
      fileList.length,
      handleSend,
      hasFileUploading,
      havInput,
      inputValue,
      isChatting,
      isPc,
      isSpeaking,
      isTransCription,
      onOpenSelectFile,
      onSelectFile,
      onStop,
      onWhisperRecord,
      selectFileIcon,
      selectFileTip,
      setValue,
      showSelectFile,
      showSelectImg,
      speakingTimeString,
      stopSpeak,
      t,
      whisperConfig.open,
      whisperModel
    ]
  );

  return (
    <Box m={['0 auto', '10px auto']} w={'100%'} maxW={['auto', 'min(800px, 100%)']} px={[0, 5]}>
      <Box
        pt={fileList.length > 0 ? '0' : ['14px', '18px']}
        pb={['14px', '18px']}
        position={'relative'}
        boxShadow={isSpeaking ? `0 0 10px rgba(54,111,255,0.4)` : `0 0 10px rgba(0,0,0,0.2)`}
        borderRadius={['none', 'md']}
        bg={'white'}
        overflow={'display'}
        {...(isPc
          ? {
              border: '1px solid',
              borderColor: 'rgba(0,0,0,0.12)'
            }
          : {
              borderTop: '1px solid',
              borderTopColor: 'rgba(0,0,0,0.15)'
            })}
      >
        {/* Chat input guide box */}
        {chatInputGuide.open && (
          <InputGuideBox
            appId={appId}
            text={inputValue}
            onSelect={(e) => {
              setValue('input', e);
            }}
            onSend={(e) => {
              handleSend(e);
            }}
          />
        )}

        {/* translate loading */}
        {RenderTranslateLoading}

        {/* file preview */}
        {RenderFilePreview}

        {RenderTextarea}
      </Box>
    </Box>
  );
};

export default React.memo(ChatInput);
