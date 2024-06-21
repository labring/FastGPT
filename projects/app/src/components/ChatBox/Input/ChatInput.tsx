import { useSpeech } from '@/web/common/hooks/useSpeech';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { Box, Flex, Image, Spinner, Textarea } from '@chakra-ui/react';
import React, { useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { compressImgFileAndUpload } from '@/web/common/file/controller';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import { addDays } from 'date-fns';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { MongoImageTypeEnum } from '@fastgpt/global/common/file/image/constants';
import { ChatBoxInputFormType, ChatBoxInputType, UserInputFileItemType } from '../type';
import { textareaMinH } from '../constants';
import { UseFormReturn, useFieldArray } from 'react-hook-form';
import { ChatBoxContext } from '../Provider';
import dynamic from 'next/dynamic';
import { useContextSelector } from 'use-context-selector';
import { getNanoid } from '@fastgpt/global/common/string/tools';

const InputGuideBox = dynamic(() => import('./InputGuideBox'));

const ChatInput = ({
  onSendMessage,
  onStop,
  TextareaDom,
  showFileSelector = false,
  resetInputVal,
  chatForm,
  appId
}: {
  onSendMessage: (val: ChatBoxInputType & { autoTTSResponse?: boolean }) => void;
  onStop: () => void;
  showFileSelector?: boolean;
  TextareaDom: React.MutableRefObject<HTMLTextAreaElement | null>;
  resetInputVal: (val: ChatBoxInputType) => void;
  chatForm: UseFormReturn<ChatBoxInputFormType>;
  appId: string;
}) => {
  const { setValue, watch, control } = chatForm;
  const inputValue = watch('input');
  const {
    update: updateFile,
    remove: removeFile,
    fields: fileList,
    append: appendFile,
    replace: replaceFile
  } = useFieldArray({
    control,
    name: 'files'
  });

  const { isChatting, whisperConfig, autoTTSResponse, chatInputGuide, outLinkAuthData } =
    useContextSelector(ChatBoxContext, (v) => v);
  const { isPc, whisperModel } = useSystemStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { t } = useTranslation();

  const havInput = !!inputValue || fileList.length > 0;
  const hasFileUploading = fileList.some((item) => !item.url);
  const canSendMessage = havInput && !hasFileUploading;

  /* file selector and upload */
  const { File, onOpen: onOpenSelectFile } = useSelectFile({
    fileType: 'image/*',
    multiple: true,
    maxCount: 10
  });
  const { mutate: uploadFile } = useRequest({
    mutationFn: async ({ file, fileIndex }: { file: UserInputFileItemType; fileIndex: number }) => {
      if (file.type === ChatFileTypeEnum.image && file.rawFile) {
        try {
          const url = await compressImgFileAndUpload({
            type: MongoImageTypeEnum.chatImage,
            file: file.rawFile,
            maxW: 4320,
            maxH: 4320,
            maxSize: 1024 * 1024 * 16,
            // 7 day expired.
            expiredTime: addDays(new Date(), 7),
            ...outLinkAuthData
          });
          updateFile(fileIndex, {
            ...file,
            url: `${location.origin}${url}`
          });
        } catch (error) {
          removeFile(fileIndex);
          console.log(error);
          return Promise.reject(error);
        }
      }
    },
    errorToast: t('common.Upload File Failed')
  });
  const onSelectFile = useCallback(
    async (files: File[]) => {
      if (!files || files.length === 0) {
        return;
      }
      const loadFiles = await Promise.all(
        files.map(
          (file) =>
            new Promise<UserInputFileItemType>((resolve, reject) => {
              if (file.type.includes('image')) {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = () => {
                  const item = {
                    id: getNanoid(6),
                    rawFile: file,
                    type: ChatFileTypeEnum.image,
                    name: file.name,
                    icon: reader.result as string
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
                  icon: 'file/pdf'
                });
              }
            })
        )
      );
      appendFile(loadFiles);

      loadFiles.forEach((file, i) =>
        uploadFile({
          file,
          fileIndex: i + fileList.length
        })
      );
    },
    [appendFile, fileList.length, uploadFile]
  );

  /* on send */
  const handleSend = async (val?: string) => {
    if (!canSendMessage) return;
    const textareaValue = val || TextareaDom.current?.value || '';

    onSendMessage({
      text: textareaValue.trim(),
      files: fileList
    });
    replaceFile([]);
  };

  /* whisper init */
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
        replaceFile([]);
      } else {
        resetInputVal({ text });
      }
    },
    [autoTTSResponse, fileList, onSendMessage, replaceFile, resetInputVal, whisperConfig?.autoSend]
  );
  const onWhisperRecord = useCallback(() => {
    if (isSpeaking) {
      return stopSpeak();
    }
    startSpeak(finishWhisperTranscription);
  }, [finishWhisperTranscription, isSpeaking, startSpeak, stopSpeak]);

  return (
    <Box m={['0 auto', '10px auto']} w={'100%'} maxW={['auto', 'min(800px, 100%)']} px={[0, 5]}>
      <Box
        pt={fileList.length > 0 ? '10px' : ['14px', '18px']}
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
          {t('core.chat.Converting to text')}
        </Flex>

        {/* file preview */}
        <Flex wrap={'wrap'} px={[2, 4]} userSelect={'none'}>
          {fileList.map((item, index) => (
            <Box
              key={item.id}
              border={'1px solid rgba(0,0,0,0.12)'}
              mr={2}
              mb={2}
              rounded={'md'}
              position={'relative'}
              _hover={{
                '.close-icon': { display: item.url ? 'block' : 'none' }
              }}
            >
              {/* uploading */}
              {!item.url && (
                <Flex
                  position={'absolute'}
                  alignItems={'center'}
                  justifyContent={'center'}
                  rounded={'md'}
                  color={'primary.500'}
                  top={0}
                  left={0}
                  bottom={0}
                  right={0}
                  bg={'rgba(255,255,255,0.8)'}
                >
                  <Spinner />
                </Flex>
              )}
              <MyIcon
                name={'closeSolid'}
                w={'16px'}
                h={'16px'}
                color={'myGray.700'}
                cursor={'pointer'}
                _hover={{ color: 'primary.500' }}
                position={'absolute'}
                bg={'white'}
                right={'-8px'}
                top={'-8px'}
                onClick={() => {
                  removeFile(index);
                }}
                className="close-icon"
                display={['', 'none']}
              />
              {item.type === ChatFileTypeEnum.image && (
                <Image
                  alt={'img'}
                  src={item.icon}
                  w={['50px', '70px']}
                  h={['50px', '70px']}
                  borderRadius={'md'}
                  objectFit={'contain'}
                />
              )}
            </Box>
          ))}
        </Flex>

        <Flex alignItems={'flex-end'} mt={fileList.length > 0 ? 1 : 0} pl={[2, 4]}>
          {/* file selector */}
          {showFileSelector && (
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
              <MyTooltip label={t('core.chat.Select Image')}>
                <MyIcon name={'core/chat/fileSelect'} w={'18px'} color={'myGray.600'} />
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
            placeholder={isSpeaking ? t('core.chat.Speaking') : t('core.chat.Type a message')}
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
              if (clipboardData && showFileSelector) {
                const items = clipboardData.items;
                const files = Array.from(items)
                  .map((item) => (item.kind === 'file' ? item.getAsFile() : undefined))
                  .filter(Boolean) as File[];
                onSelectFile(files);
              }
            }}
          />
          <Flex
            alignItems={'center'}
            position={'absolute'}
            right={[2, 4]}
            bottom={['10px', '12px']}
          >
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
                  <MyTooltip label={t('core.chat.Cancel Speak')}>
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
                <MyTooltip label={isSpeaking ? t('core.chat.Finish Speak') : t('core.chat.Record')}>
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
                  <MyTooltip label={t('core.chat.Send Message')}>
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
      </Box>
    </Box>
  );
};

export default React.memo(ChatInput);
