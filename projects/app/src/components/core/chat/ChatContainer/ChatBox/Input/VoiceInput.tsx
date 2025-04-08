import { useSpeech } from '@/web/common/hooks/useSpeech';
import { Box, Flex, HStack, Spinner } from '@chakra-ui/react';
import React, {
  useRef,
  useEffect,
  useCallback,
  useState,
  forwardRef,
  useImperativeHandle,
  useMemo
} from 'react';
import { useTranslation } from 'next-i18next';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useContextSelector } from 'use-context-selector';
import { ChatBoxContext } from '../Provider';
import MyIconButton from '@/pageComponents/account/team/OrgManage/IconButton';

export interface VoiceInputComponentRef {
  onSpeak: () => void;
}

type VoiceInputProps = {
  onSendMessage: (params: { text: string; files?: any[]; autoTTSResponse?: boolean }) => void;
  resetInputVal: (val: { text: string }) => void;
};

// PC voice input
const PCVoiceInput = ({
  speakingTimeString,
  stopSpeak,
  canvasRef
}: {
  speakingTimeString: string;
  stopSpeak: (param: boolean) => void;
  canvasRef: React.RefObject<HTMLCanvasElement>;
}) => {
  const { t } = useTranslation();

  return (
    <HStack h={'100%'} px={4}>
      <Box fontSize="sm" color="myGray.500" flex={'1 0 0'}>
        {t('common:core.chat.Speaking')}
      </Box>
      <canvas
        ref={canvasRef}
        style={{
          height: '10px',
          width: '100px',
          background: 'white'
        }}
      />
      <Box fontSize="sm" color="myGray.500" whiteSpace={'nowrap'}>
        {speakingTimeString}
      </Box>
      <MyTooltip label={t('common:core.chat.Cancel Speak')}>
        <MyIconButton
          name={'core/chat/cancelSpeak'}
          h={'22px'}
          w={'22px'}
          onClick={() => stopSpeak(true)}
        />
      </MyTooltip>
      <MyTooltip label={t('common:core.chat.Finish Speak')}>
        <MyIconButton
          name={'core/chat/finishSpeak'}
          h={'22px'}
          w={'22px'}
          onClick={() => stopSpeak(false)}
        />
      </MyTooltip>
    </HStack>
  );
};

// mobile voice input
const MobileVoiceInput = ({
  isSpeaking,
  onStartSpeak,
  onCloseSpeak,
  stopSpeak,
  canvasRef
}: {
  isSpeaking: boolean;
  onStartSpeak: () => void;
  onCloseSpeak: () => any;
  stopSpeak: (param: boolean) => void;
  canvasRef: React.RefObject<HTMLCanvasElement>;
}) => {
  const { t } = useTranslation();

  const isPressing = useRef(false);
  const startTimeRef = useRef(0); // 防抖

  const startYRef = useRef(0);

  const [isCancel, setIsCancel] = useState(false);
  const canvasPosition = canvasRef.current?.getBoundingClientRect();
  const maskBottom = canvasPosition ? `${window.innerHeight - canvasPosition.top}px` : '50px';

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      isPressing.current = true;
      setIsCancel(false);

      startTimeRef.current = Date.now();
      const touch = e.touches[0];
      startYRef.current = touch.pageY;

      onStartSpeak();
    },
    [onStartSpeak]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      const touch = e.touches[0] as Touch;
      const currentY = touch.pageY;
      const deltaY = startYRef.current - currentY;

      if (deltaY > 90) {
        setIsCancel(true);
      } else if (deltaY <= 90) {
        setIsCancel(false);
      }
    },
    [startYRef]
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (!isPressing.current) return;

      const endTime = Date.now();
      const timeDifference = endTime - startTimeRef.current;

      if (isCancel || timeDifference < 200) {
        stopSpeak(true);
      } else {
        stopSpeak(false);
      }
    },
    [isCancel, stopSpeak]
  );

  return (
    <Flex position="relative" h="100%">
      {/* Back Icon */}
      {!isSpeaking && (
        <MyTooltip label={t('chat:back_to_text')}>
          <MyIconButton
            position="absolute"
            right={2}
            top={'50%'}
            transform={'translateY(-50%)'}
            zIndex={5}
            name={'core/chat/backText'}
            h={'22px'}
            w={'22px'}
            onClick={onCloseSpeak}
          />
        </MyTooltip>
      )}
      <Flex
        alignItems={'center'}
        justifyContent={'center'}
        h="100%"
        flex="1 0 0"
        bg={isSpeaking ? (isCancel ? 'red.500' : 'primary.500') : 'white'}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchStart={handleTouchStart}
        onTouchCancel={() => {
          stopSpeak(true);
        }}
        zIndex={4}
      >
        <Box visibility={isSpeaking ? 'hidden' : 'visible'}>{t('chat:press_to_speak')}</Box>
        <Box
          position="absolute"
          h={'100%'}
          w={'100%'}
          as="canvas"
          ref={canvasRef}
          flex="0 0 80%"
          visibility={isSpeaking ? 'visible' : 'hidden'}
        />
      </Flex>

      {/* Mask */}
      {isSpeaking && (
        <Flex
          justifyContent="center"
          alignItems="center"
          height="100%"
          position="fixed"
          left={0}
          right={0}
          bottom={maskBottom}
          h={'200px'}
          bg="linear-gradient(to top, white, rgba(255, 255, 255, 0.7), rgba(255, 255, 255, 0))"
        >
          <Box fontSize="sm" color="myGray.500" position="absolute" bottom={'10px'}>
            {isCancel ? t('chat:release_cancel') : t('chat:release_send')}
          </Box>
        </Flex>
      )}
    </Flex>
  );
};

const VoiceInput = forwardRef<VoiceInputComponentRef, VoiceInputProps>(
  ({ onSendMessage, resetInputVal }, ref) => {
    const { t } = useTranslation();
    const { isPc } = useSystem();

    const outLinkAuthData = useContextSelector(ChatBoxContext, (v) => v.outLinkAuthData);
    const appId = useContextSelector(ChatBoxContext, (v) => v.appId);
    const whisperConfig = useContextSelector(ChatBoxContext, (v) => v.whisperConfig);
    const autoTTSResponse = useContextSelector(ChatBoxContext, (v) => v.autoTTSResponse);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const {
      isSpeaking,
      isTransCription,
      stopSpeak,
      startSpeak,
      speakingTimeString,
      renderAudioGraphPc,
      renderAudioGraphMobile,
      stream
    } = useSpeech({ appId, ...outLinkAuthData });

    const [mobilePreSpeak, setMobilePreSpeak] = useState(false);

    // Canvas render
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

    const onStartSpeak = useCallback(() => {
      const finishWhisperTranscription = (text: string) => {
        if (!text) return;
        if (whisperConfig?.autoSend) {
          onSendMessage({
            text,
            autoTTSResponse
          });
        } else {
          resetInputVal({ text });
        }
      };
      startSpeak(finishWhisperTranscription);
    }, [autoTTSResponse, onSendMessage, resetInputVal, startSpeak, whisperConfig?.autoSend]);

    const onSpeach = useCallback(() => {
      if (isPc) {
        onStartSpeak();
      } else {
        setMobilePreSpeak(true);
      }
    }, [isPc, onStartSpeak]);
    useImperativeHandle(ref, () => ({
      onSpeak: onSpeach
    }));

    if (!whisperConfig?.open) return null;
    if (!mobilePreSpeak && !isSpeaking && !isTransCription) return null;

    return (
      <Box
        position="absolute"
        overflow={'hidden'}
        userSelect={'none'}
        top={0}
        left={0}
        right={0}
        bottom={0}
        bg="white"
        zIndex={5}
        borderRadius={isPc ? 'md' : ''}
        onContextMenu={(e) => e.preventDefault()}
      >
        {isPc ? (
          <PCVoiceInput
            speakingTimeString={speakingTimeString}
            stopSpeak={stopSpeak}
            canvasRef={canvasRef}
          />
        ) : (
          <MobileVoiceInput
            isSpeaking={isSpeaking}
            onStartSpeak={onStartSpeak}
            onCloseSpeak={() => setMobilePreSpeak(false)}
            stopSpeak={stopSpeak}
            canvasRef={canvasRef}
          />
        )}

        {isTransCription && (
          <Flex
            position={'absolute'}
            top={0}
            bottom={0}
            left={0}
            right={0}
            pl={5}
            alignItems={'center'}
            bg={'white'}
            color={'primary.500'}
            zIndex={6}
          >
            <Spinner size={'sm'} mr={4} />
            {t('common:core.chat.Converting to text')}
          </Flex>
        )}
      </Box>
    );
  }
);
VoiceInput.displayName = 'VoiceInput';

export default VoiceInput;
