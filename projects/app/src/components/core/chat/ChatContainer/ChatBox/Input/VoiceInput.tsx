import { useSpeech } from '@/web/common/hooks/useSpeech';
import { Box, Flex, Spinner, Text, Heading } from '@chakra-ui/react';
import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useTranslation } from 'next-i18next';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useFileUpload } from '../hooks/useFileUpload';
import { ChatBoxInputFormType } from '../type';

interface VoiceInputProps {
  onSendMessage: (params: { text: string; files?: any[]; autoTTSResponse?: boolean }) => void;
  resetInputVal: (val: { text: string }) => void;
  whisperConfig?: {
    open?: boolean;
    autoSend?: boolean;
  };
  autoTTSResponse?: boolean;
  isChatting: boolean;
  appId: string;
  chatId: string;
  fileSelectConfig: any;
  fileCtrl: any;
  outLinkAuthData: any;
  onStateChange?: (state: {
    isSpeaking: boolean;
    needSpeak: boolean;
    isTransCription: boolean;
    onWhisperRecord: () => void;
    prepareSpeak: () => void;
  }) => void;
}

interface TouchListenComponentProps {
  isSpeaking: boolean;
  needSpeak: boolean;
  isTransCription: boolean;
  onWhisperRecord: () => void;
  stopSpeak: (param: boolean) => void;
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  changeWaveColor: (isPrimary: boolean) => void;
}

const TouchListenComponent = React.memo(({
  isSpeaking,
  isTransCription,
  onWhisperRecord,
  stopSpeak,
  canvasRef,
  needSpeak,
  changeWaveColor
}: TouchListenComponentProps) => {
  const { t } = useTranslation();
  const startTimeRef = useRef(0);
  const elapsedTimeRef = useRef(0);
  const startYRef = useRef(0);
  const isCancle = useRef(false);
  const isPressing = useRef(false);
  const moveRef = useRef(false);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (isPressing.current) return;
      startTimeRef.current = Date.now();
      const touch = e.touches[0] as Touch;
      startYRef.current = touch.pageY;
      isCancle.current = false;
      isPressing.current = true;
      onWhisperRecord();
    },
    [onWhisperRecord]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      const touch = e.touches[0] as Touch;
      const currentY = touch.pageY;
      const deltaY = startYRef.current - currentY;

      if (deltaY > 90 && !isCancle.current) {
        isCancle.current = true;
        changeWaveColor(false);
      } else if (deltaY <= 90 && isCancle) {
        isCancle.current = false;
        changeWaveColor(true);
      }
    },
    [startYRef, changeWaveColor]
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (!isPressing.current) return;
      const endTime = Date.now();
      const timeDifference = endTime - startTimeRef.current;
      elapsedTimeRef.current = timeDifference;
      startTimeRef.current = endTime;
      isPressing.current = false;
      moveRef.current = false;
      changeWaveColor(true);
      if (isCancle.current) {
        stopSpeak(true);
      } else {
        if (timeDifference < 200) {
          stopSpeak(true);
        } else {
          stopSpeak(false);
        }
      }
    },
    [isCancle, stopSpeak, changeWaveColor]
  );


  return (
    <Box
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchStart={handleTouchStart}
      w="100%"
      h="100%"
      position="relative"
      justifyContent="center"
      alignItems="center"
    >
      <Flex
        justifyContent="center"
        alignItems="center"
        height="100%"
        visibility={needSpeak && !isTransCription ? 'visible' : 'hidden'}
        backgroundColor={moveRef.current ? 'red' : 'white'}
        position="absolute"
        left={0}
        right={0}
        top={0}
        bottom={0}
      >
        <Text position="absolute" margin={0} zIndex={100}>{t('common:core.chat.pressToSpeak')}</Text>
        <Box
          as="canvas"
          ref={canvasRef}
          h="100%"
          w="100%"
          zIndex={100}
          bg={'white'}
          visibility={isPressing.current ? 'visible' : 'hidden'}
        />
      </Flex>
      {isPressing.current && (
          <Flex
            justifyContent="center"
            alignItems="center"
            height="100%"
            visibility={needSpeak && !isTransCription ? 'visible' : 'hidden'}
            position="absolute"
            left={0}
            right={0}
            top={-100}
            bottom={0}
          >
            <Text fontSize="sm" fontWeight="medium" color="gray.700">
            {isCancle.current ? t('common:core.chat.releaseToCancel') : t('common:core.chat.releaseToSend')}
            </Text>
          </Flex>
      )}

    </Box>
  );
});

TouchListenComponent.displayName = 'TouchListenComponent';

const VoiceInput = ({
  onSendMessage,
  resetInputVal,
  whisperConfig,
  autoTTSResponse,
  isChatting,
  appId,
  chatId,
  fileSelectConfig,
  fileCtrl,
  outLinkAuthData,
  onStateChange
}: VoiceInputProps) => {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { isPc } = useSystem();

  const { fileList, replaceFiles } = useFileUpload({
    fileSelectConfig,
    fileCtrl,
    outLinkAuthData,
    appId,
    chatId
  });

  const {
    isSpeaking,
    isTransCription,
    stopSpeak,
    startSpeak,
    prepareSpeak,
    finishSpeak,
    needSpeak,
    speakingTimeString,
    renderAudioGraphPc,
    renderAudioGraphMobile,
    stream,
    changeWaveColor
  } = useSpeech({ appId, isPc, ...outLinkAuthData });


  const onWhisperRecord = useCallback(() => {
    const finishWhisperTranscription = (text: string) => {
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
    };
    if (isPc) {
      if (isSpeaking) {
        return stopSpeak();
      }
    }
    startSpeak(finishWhisperTranscription);
  }, [
    autoTTSResponse,
    fileList,
    isSpeaking,
    onSendMessage,
    replaceFiles,
    resetInputVal,
    startSpeak,
    stopSpeak,
    whisperConfig?.autoSend
  ]);

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
    let animationFrameId: number | null = null;
    const renderCurve = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      if (!stream.active) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (animationFrameId) {
          window.cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
        return;
      }
      if (isPc) {
        renderAudioGraphPc(analyser, canvas);
      } else {
        renderAudioGraphMobile(analyser, canvas);
      }
      animationFrameId = window.requestAnimationFrame(renderCurve);
    };

    renderCurve();
    return () => {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId);
      }
      audioContext.close();
      source.disconnect();
      analyser.disconnect();
    };
  }, [stream, canvasRef, renderAudioGraphPc, renderAudioGraphMobile, isPc]);

  useEffect(() => {
    onStateChange?.({
      isSpeaking,
      needSpeak,
      isTransCription,
      onWhisperRecord,
      prepareSpeak
    });
  }, [isSpeaking, needSpeak, isTransCription, onStateChange]);

  if (!whisperConfig?.open) return null;

  return (
    <>
      {/* Voice input overlay */}
      {(isSpeaking || needSpeak) && (
        <Box
          position="absolute"
          top={0}
          left={0}
          right={0}
          bottom={0}
          bg="white"
          borderRadius="lg"
          zIndex={10000}
          display="flex"
          flexDirection="column"
          height="100%"
          width="100%"
        >
          {isTransCription && (
            <Flex
              position={'absolute'}
              top={0}
              bottom={0}
              left={0}
              right={0}
              zIndex={10000}
              pl={5}
              alignItems={'center'}
              bg={'white'}
              color={'primary.500'}
              borderRadius="lg"
            >
              <Spinner size={'sm'} mr={4} />
              {t('common:core.chat.Converting to text')}
            </Flex>
          )}
          {isPc ? (
            <Flex
              position="absolute"
              top={0}
              right={0}
              bottom={0}
              left={0}
              justifyContent={'center'}
              alignItems={"center"}
              px={4}
              borderRadius="lg"
              backgroundColor={'white'}
              zIndex={1000}
            >
              {isSpeaking && !isTransCription && (
                <Flex 
                  alignItems="center" 
                  top={0} 
                  bottom={0} 
                  left={0} 
                  right={0} 
                  gap={2} 
                  bg="white" 
                  p={2} 
                  borderRadius="md" 
                  position="absolute"
                  justifyContent="space-between"
                >
                  <Heading size={'sm'} ml={2}>{t('common:core.chat.Speaking')}</Heading>
                  <Flex alignItems="center" gap={2}>
                    <canvas
                      ref={canvasRef}
                      style={{
                        height: '10px',
                        width: isSpeaking && !isTransCription ? '200px' : 0,
                        background: 'white',
                        zIndex: 2
                      }}
                    />
                    <Box color={'#5A646E'} whiteSpace={'nowrap'}>
                      {speakingTimeString}
                    </Box>
                    <MyTooltip label={t('common:core.chat.Cancel Speak')}>
                      <Flex
                        alignItems={'center'}
                        justifyContent={'center'}
                        flexShrink={0}
                        mr={2}
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
                    <MyTooltip label={t('common:core.chat.Finish Speak')}>
                      <Flex
                        alignItems={'center'}
                        justifyContent={'center'}
                        flexShrink={0}
                        mr={0}
                        h={['26px', '32px']}
                        w={['26px', '32px']}
                        borderRadius={'full'}
                        cursor={'pointer'}
                        bg={isSpeaking ? 'primary.50' : 'gray.50'}
                        _hover={{ bg: isSpeaking ? 'primary.100' : 'gray.100' }}
                        onClick={onWhisperRecord}
                      >
                        <MyIcon
                          name={'core/chat/finishSpeak'}
                          width={['20x', '22px']}
                          height={['20px', '22px']}
                          color={isSpeaking ? 'primary.500' : 'myGray.600'}
                        />
                      </Flex>
                    </MyTooltip>
                  </Flex>
                </Flex>
              )}
            </Flex>
          ) : (
            needSpeak && (
              <Flex>
                  <Flex
                    position="absolute"
                    bottom={0}
                    left={0}
                    right={0}
                    top={0}
                    alignItems="center"
                    justifyContent="center"
                    backgroundColor={'white'}
                    flexDirection={'row'}
                    zIndex={10}
                    borderRadius="lg"
                  >
                    <TouchListenComponent
                      isSpeaking={isSpeaking}
                      needSpeak={needSpeak}
                      isTransCription={isTransCription}
                      onWhisperRecord={onWhisperRecord}
                      stopSpeak={stopSpeak}
                      canvasRef={canvasRef}
                      changeWaveColor={changeWaveColor}
                    />
                  </Flex>
                  <Flex 
                    position="absolute" 
                    right={0} 
                    top={0}
                    bottom={0} 
                    mr={2}
                    alignItems="center" 
                    justifyContent="center"
                    zIndex={10}
                  >
                  {!isSpeaking && (
                    <MyTooltip label={t('common:core.chat.Back to Text')}>
                    <Flex
                      alignItems={'center'}
                      justifyContent={'center'}
                      h={['28px', '32px']}
                      w={['28px', '32px']}
                      borderRadius={'md'}
                      cursor={'pointer'}
                      _hover={{ bg: '#F5F5F8' }}
                      onClick={finishSpeak}
                      zIndex={10}
                    >
                      <MyIcon
                        name={'core/chat/backText'}
                        width={['26px', '32px']}
                        height={['26px', '32px']}
                        color="blue.600"
                      />
                    </Flex>
                  </MyTooltip>)
                  }
                  </Flex>                
              </Flex>
            )
          )}
        </Box>
      )}
    </>
  );
};

export default React.memo(VoiceInput);
