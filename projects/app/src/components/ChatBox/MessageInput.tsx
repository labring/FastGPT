import { useSpeech } from '@/web/common/hooks/useSpeech';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { Box, Flex, Image, Spinner, Textarea } from '@chakra-ui/react';
import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useTranslation } from 'next-i18next';
import MyTooltip from '../MyTooltip';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRouter } from 'next/router';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { compressImgFileAndUpload } from '@/web/common/file/controller';
import { customAlphabet } from 'nanoid';
import { IMG_BLOCK_KEY } from '@fastgpt/global/core/chat/constants';
import { addDays } from 'date-fns';
import { useRequest } from '@/web/common/hooks/useRequest';
import { MongoImageTypeEnum } from '@fastgpt/global/common/file/image/constants';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 6);

enum FileTypeEnum {
  image = 'image',
  file = 'file'
}
type FileItemType = {
  id: string;
  rawFile: File;
  type: `${FileTypeEnum}`;
  name: string;
  icon: string; // img is base64
  src?: string;
};

const MessageInput = ({
  onChange,
  onSendMessage,
  onStop,
  isChatting,
  TextareaDom,
  showFileSelector = false,
  resetInputVal
}: {
  onChange: (e: string) => void;
  onSendMessage: (e: string) => void;
  onStop: () => void;
  isChatting: boolean;
  showFileSelector?: boolean;
  TextareaDom: React.MutableRefObject<HTMLTextAreaElement | null>;
  resetInputVal: (val: string) => void;
}) => {
  const { shareId } = useRouter().query as { shareId?: string };
  const {
    isSpeaking,
    isTransCription,
    stopSpeak,
    startSpeak,
    speakingTimeString,
    renderAudioGraph,
    stream
  } = useSpeech({ shareId });
  const { isPc } = useSystemStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { t } = useTranslation();
  const textareaMinH = '22px';
  const [fileList, setFileList] = useState<FileItemType[]>([]);
  const havInput = !!TextareaDom.current?.value || fileList.length > 0;

  const { File, onOpen: onOpenSelectFile } = useSelectFile({
    fileType: 'image/*',
    multiple: true,
    maxCount: 10
  });

  const { mutate: uploadFile } = useRequest({
    mutationFn: async (file: FileItemType) => {
      if (file.type === FileTypeEnum.image) {
        try {
          const src = await compressImgFileAndUpload({
            type: MongoImageTypeEnum.chatImage,
            file: file.rawFile,
            maxW: 4329,
            maxH: 4329,
            maxSize: 1024 * 1024 * 5,
            // 30 day expired.
            expiredTime: addDays(new Date(), 7),
            shareId
          });
          setFileList((state) =>
            state.map((item) =>
              item.id === file.id
                ? {
                    ...item,
                    src: `${location.origin}${src}`
                  }
                : item
            )
          );
        } catch (error) {
          setFileList((state) => state.filter((item) => item.id !== file.id));
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
            new Promise<FileItemType>((resolve, reject) => {
              if (file.type.includes('image')) {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = () => {
                  const item = {
                    id: nanoid(),
                    rawFile: file,
                    type: FileTypeEnum.image,
                    name: file.name,
                    icon: reader.result as string
                  };
                  uploadFile(item);
                  resolve(item);
                };
                reader.onerror = () => {
                  reject(reader.error);
                };
              } else {
                resolve({
                  id: nanoid(),
                  rawFile: file,
                  type: FileTypeEnum.file,
                  name: file.name,
                  icon: 'file/pdf'
                });
              }
            })
        )
      );

      setFileList((state) => [...state, ...loadFiles]);
    },
    [uploadFile]
  );

  const handleSend = useCallback(async () => {
    const textareaValue = TextareaDom.current?.value || '';

    const images = fileList.filter((item) => item.type === FileTypeEnum.image);
    const imagesText =
      images.length === 0
        ? ''
        : `\`\`\`${IMG_BLOCK_KEY}
${images.map((img) => JSON.stringify({ src: img.src })).join('\n')}
\`\`\`
`;

    const inputMessage = `${imagesText}${textareaValue}`;

    onSendMessage(inputMessage);
    setFileList([]);
  }, [TextareaDom, fileList, onSendMessage]);

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

  return (
    <Box m={['0 auto', '10px auto']} w={'100%'} maxW={['auto', 'min(800px, 100%)']} px={[0, 5]}>
      <Box
        pt={fileList.length > 0 ? '10px' : ['14px', '18px']}
        pb={['14px', '18px']}
        position={'relative'}
        boxShadow={isSpeaking ? `0 0 10px rgba(54,111,255,0.4)` : `0 0 10px rgba(0,0,0,0.2)`}
        borderRadius={['none', 'md']}
        bg={'white'}
        overflow={'hidden'}
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
          {fileList.map((item) => (
            <Box
              key={item.id}
              border={'1px solid rgba(0,0,0,0.12)'}
              mr={2}
              mb={2}
              rounded={'md'}
              position={'relative'}
              _hover={{
                '.close-icon': { display: item.src ? 'block' : 'none' }
              }}
            >
              {/* uploading */}
              {!item.src && (
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
                  setFileList((state) => state.filter((file) => file.id !== item.id));
                }}
                className="close-icon"
                display={['', 'none']}
              />
              {item.type === FileTypeEnum.image && (
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
            maxHeight={'150px'}
            maxLength={-1}
            overflowY={'auto'}
            whiteSpace={'pre-wrap'}
            wordBreak={'break-all'}
            boxShadow={'none !important'}
            color={'myGray.900'}
            isDisabled={isSpeaking}
            onChange={(e) => {
              const textarea = e.target;
              textarea.style.height = textareaMinH;
              textarea.style.height = `${textarea.scrollHeight}px`;
              onChange(textarea.value);
            }}
            onKeyDown={(e) => {
              // enter send.(pc or iframe && enter and unPress shift)
              if ((isPc || window !== parent) && e.keyCode === 13 && !e.shiftKey) {
                handleSend();
                e.preventDefault();
              }
              // 全选内容
              // @ts-ignore
              e.key === 'a' && e.ctrlKey && e.target?.select();
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
            {!shareId && !havInput && !isChatting && (
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
                  onClick={() => {
                    if (isSpeaking) {
                      return stopSpeak();
                    }
                    startSpeak(resetInputVal);
                  }}
                >
                  <MyTooltip label={isSpeaking ? t('core.chat.Stop Speak') : t('core.chat.Record')}>
                    <MyIcon
                      name={isSpeaking ? 'core/chat/stopSpeechFill' : 'core/chat/recordFill'}
                      width={['20px', '22px']}
                      height={['20px', '22px']}
                      color={'primary.500'}
                    />
                  </MyTooltip>
                </Flex>
              </>
            )}
            {/* send and stop icon */}
            {isSpeaking ? (
              <Box color={'#5A646E'} w={'36px'} textAlign={'right'}>
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
                bg={isSpeaking || isChatting ? '' : !havInput ? '#E5E5E5' : 'primary.500'}
                cursor={havInput ? 'pointer' : 'not-allowed'}
                lineHeight={1}
                onClick={() => {
                  if (isChatting) {
                    return onStop();
                  }
                  if (havInput) {
                    return handleSend();
                  }
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

export default React.memo(MessageInput);
