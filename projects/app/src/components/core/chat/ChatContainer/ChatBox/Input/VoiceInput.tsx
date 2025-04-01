import { useSpeech } from '@/web/common/hooks/useSpeech';
import { Box, Flex, Spinner, Text, Heading } from '@chakra-ui/react';
import React, {
  useRef,
  useEffect,
  useCallback,
  useState,
  forwardRef,
  useImperativeHandle
} from 'react';
import { useTranslation } from 'next-i18next';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useFileUpload } from '../hooks/useFileUpload';
import { ChatBoxInputFormType } from '../type';
import { useToast } from '@fastgpt/web/hooks/useToast';

export interface VoiceInputComponentRef {
  onSpeak: () => void;
}

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

const TouchListenComponent = React.memo(
  ({
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
        userSelect="none"
      >
        <Flex
          justifyContent="center"
          alignItems="center"
          height="100%"
          backgroundColor={moveRef.current ? 'red' : 'white'}
          position="absolute"
          left={0}
          right={0}
          top={0}
          bottom={0}
        >
          <Text position="absolute" margin={0} zIndex={5}>
            {t('common:core.chat.pressToSpeak')}
          </Text>
          <Box
            as="canvas"
            ref={canvasRef}
            h="100%"
            w="100%"
            zIndex={5}
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
            top={-50}
            bottom={0}
            _after={{
              content: '""',
              position: 'absolute',
              inset: 0,
              bgGradient: 'linear(to-b, white 0%, rgba(255, 255, 255, 0.93) 100%)',
              pointerEvents: 'none',
              zIndex: 4
            }}
          >
            <Text fontSize="sm" fontWeight="medium" color="gray.700" position="relative">
              {isCancle.current
                ? t('common:core.chat.releaseToCancel')
                : t('common:core.chat.releaseToSend')}
            </Text>
          </Flex>
        )}
      </Box>
    );
  }
);

TouchListenComponent.displayName = 'TouchListenComponent';

// PC voice input
const PCVoiceInput = React.memo(
  ({
    isSpeaking,
    isTransCription,
    speakingTimeString,
    onWhisperRecord,
    stopSpeak,
    canvasRef
  }: {
    isSpeaking: boolean;
    isTransCription: boolean;
    speakingTimeString: string;
    onWhisperRecord: () => void;
    stopSpeak: (param: boolean) => void;
    canvasRef: React.RefObject<HTMLCanvasElement>;
  }) => {
    const { t } = useTranslation();

    return (
      <Flex
        position="absolute"
        top={0}
        right={0}
        bottom={0}
        left={0}
        justifyContent={'center'}
        alignItems={'center'}
        px={4}
        borderRadius="lg"
        backgroundColor={'white'}
        zIndex={5}
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
            zIndex={5}
          >
            <Text fontSize="sm" fontWeight="medium" color="gray.600" ml={1}>
              {t('common:core.chat.Speaking')}
            </Text>
            <Flex alignItems="center" gap={2}>
              <canvas
                ref={canvasRef}
                style={{
                  height: '10px',
                  width: isSpeaking && !isTransCription ? '200px' : 0,
                  background: 'white'
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
    );
  }
);

// mobile voice input
const MobileVoiceInput = React.memo(
  ({
    isSpeaking,
    needSpeak,
    isTransCription,
    onWhisperRecord,
    stopSpeak,
    canvasRef,
    changeWaveColor,
    finishSpeak
  }: {
    isSpeaking: boolean;
    needSpeak: boolean;
    isTransCription: boolean;
    onWhisperRecord: () => void;
    stopSpeak: (param: boolean) => void;
    canvasRef: React.RefObject<HTMLCanvasElement>;
    changeWaveColor: (isPrimary: boolean) => void;
    finishSpeak: () => void;
  }) => {
    const { t } = useTranslation();

    return (
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
          zIndex={5}
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
          zIndex={5}
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
              >
                <MyIcon
                  name={'core/chat/backText'}
                  width={['26px', '32px']}
                  height={['26px', '32px']}
                  color="blue.600"
                />
              </Flex>
            </MyTooltip>
          )}
        </Flex>
      </Flex>
    );
  }
);

const VoiceInput = forwardRef<VoiceInputComponentRef, VoiceInputProps>((props, ref) => {
  const {
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
  } = props;
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { isPc } = useSystem();
  const { toast } = useToast();

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
    speakingTimeString,
    renderAudioGraphPc,
    renderAudioGraphMobile,
    stream,
    changeWaveColor
  } = useSpeech({ appId, isPc, ...outLinkAuthData });

  useImperativeHandle(ref, () => ({
    onSpeak: isPc ? onWhisperRecord : prepareSpeak
  }));

  const [needSpeak, setNeedspeak] = useState(false);
  const prepareSpeak = useCallback(() => {
    setNeedspeak(true);
    return {
      needSpeak
    };
  }, [toast, t]);

  const finishSpeak = useCallback(() => {
    setNeedspeak(false);
    stopSpeak(true);
    return {
      needSpeak
    };
  }, [stopSpeak]);

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

  const renderVoiceInput = () => {
    if (!whisperConfig?.open) return null;
    if (!(isSpeaking || needSpeak)) return null;

    return (
      <Box
        position="absolute"
        top={0}
        left={0}
        right={0}
        bottom={0}
        bg="white"
        borderRadius="lg"
        zIndex={4}
        display="flex"
      >
        {isTransCription && (
          <Flex
            position={'absolute'}
            top={0}
            bottom={0}
            left={0}
            right={0}
            zIndex={6}
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
          <PCVoiceInput
            isSpeaking={isSpeaking}
            isTransCription={isTransCription}
            speakingTimeString={speakingTimeString}
            onWhisperRecord={onWhisperRecord}
            stopSpeak={stopSpeak}
            canvasRef={canvasRef}
          />
        ) : (
          <MobileVoiceInput
            isSpeaking={isSpeaking}
            needSpeak={needSpeak}
            isTransCription={isTransCription}
            onWhisperRecord={onWhisperRecord}
            stopSpeak={stopSpeak}
            canvasRef={canvasRef}
            changeWaveColor={changeWaveColor}
            finishSpeak={finishSpeak}
          />
        )}
      </Box>
    );
  };

  useImperativeHandle(ref, () => ({
    onSpeak: isPc ? onWhisperRecord : prepareSpeak
  }));

  return renderVoiceInput();
});
VoiceInput.displayName = 'VoiceInput';

export default VoiceInput;
