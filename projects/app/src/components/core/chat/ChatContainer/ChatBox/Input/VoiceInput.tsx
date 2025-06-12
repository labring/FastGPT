import { useSpeech } from '@/web/common/hooks/useSpeech';
import { Box, Flex, HStack, Spinner } from '@chakra-ui/react';
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
import { useContextSelector } from 'use-context-selector';
import { ChatBoxContext } from '../Provider';
import MyIconButton from '@/pageComponents/account/team/OrgManage/IconButton';
import { isMobile } from '@fastgpt/web/common/system/utils';

export interface VoiceInputComponentRef {
  onSpeak: () => void;
  getVoiceInputState: () => { isSpeaking: boolean; isTransCription: boolean };
}

type VoiceInputProps = {
  handleSend: (val: string) => void;
  resetInputVal: (val: string) => void;
  mobilePreSpeak: boolean;
  setMobilePreSpeak: React.Dispatch<React.SetStateAction<boolean>>;
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
    <Box
      position="absolute"
      top={0}
      left={0}
      right={0}
      bottom={0}
      bg="rgba(255, 255, 255, 0.3)"
      backdropFilter="blur(8px)"
      borderRadius="xxl"
      zIndex={10}
      display="flex"
      alignItems="center"
      justifyContent="center"
      flexDirection="column"
    >
      {/* Center Waveform Area */}
      <Flex
        position="absolute"
        top="50%"
        left="0"
        right="0"
        transform="translateY(-80%)"
        alignItems="center"
        justifyContent="center"
        direction="column"
        gap={1}
        w="100%"
      >
        <Box fontSize="sm" color="myGray.600" fontWeight="500">
          {t('common:core.chat.Speaking')}
        </Box>
        <canvas
          ref={canvasRef}
          style={{
            height: '32px',
            width: '90%',
            background: 'transparent'
          }}
        />
      </Flex>

      {/* Action Buttons - Bottom */}
      <Flex position="absolute" right={4} bottom={3.5} alignItems="center" gap={2} h={9}>
        {/* Time Display */}
        <Box
          fontSize="sm"
          color="myGray.600"
          mr={2}
          bg="rgba(255, 255, 255, 0.9)"
          px={2}
          py={1}
          borderRadius="md"
          fontWeight="500"
        >
          {speakingTimeString}
        </Box>

        {/* Cancel Button */}
        <MyTooltip label={t('common:core.chat.Cancel Speak')}>
          <Flex
            w={9}
            h={9}
            alignItems="center"
            justifyContent="center"
            border="sm"
            borderRadius="lg"
            cursor="pointer"
            bg="rgba(255, 255, 255, 0.95)"
            boxShadow="0 2px 8px rgba(0, 0, 0, 0.1)"
            _hover={{ bg: 'white', transform: 'scale(1.05)' }}
            transition="all 0.2s"
            onClick={() => stopSpeak(true)}
          >
            <MyIcon name={'close'} w={5} h={5} color={'myGray.500'} />
          </Flex>
        </MyTooltip>

        {/* Confirm Button */}
        <MyTooltip label={t('common:core.chat.Finish Speak')}>
          <Flex
            w={9}
            h={9}
            alignItems="center"
            justifyContent="center"
            border="sm"
            borderRadius="lg"
            cursor="pointer"
            bg="rgba(255, 255, 255, 0.95)"
            boxShadow="0 2px 8px rgba(0, 0, 0, 0.1)"
            _hover={{ bg: 'white', transform: 'scale(1.05)' }}
            transition="all 0.2s"
            onClick={() => stopSpeak(false)}
          >
            <MyIcon name={'check'} w={5} h={5} color={'myGray.500'} />
          </Flex>
        </MyTooltip>
      </Flex>
    </Box>
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

      if (deltaY > 60) {
        setIsCancel(true);
      } else if (deltaY <= 60) {
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
            h={6}
            w={6}
            onClick={onCloseSpeak}
          />
        </MyTooltip>
      )}
      <Flex
        alignItems={'center'}
        justifyContent={'center'}
        flex="1 0 0"
        bg={isSpeaking ? (isCancel ? 'red.500' : 'primary.500') : 'rgba(255, 255, 255, 0.95)'}
        backdropFilter={!isSpeaking ? 'blur(4px)' : 'none'}
        borderRadius="xxl"
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
          h={'48px'}
          bg="linear-gradient(to top, white, rgba(255, 255, 255, 0.7), rgba(255, 255, 255, 0))"
        >
          <Box fontSize="sm" color="myGray.500" position="absolute" bottom={2.5}>
            {isCancel ? t('chat:release_cancel') : t('chat:release_send')}
          </Box>
        </Flex>
      )}
    </Flex>
  );
};

const VoiceInput = forwardRef<VoiceInputComponentRef, VoiceInputProps>(
  ({ handleSend, resetInputVal, mobilePreSpeak, setMobilePreSpeak }, ref) => {
    const { t } = useTranslation();
    const isMobileDevice = isMobile();
    const { isPc } = useSystem();

    const outLinkAuthData = useContextSelector(ChatBoxContext, (v) => v.outLinkAuthData);
    const appId = useContextSelector(ChatBoxContext, (v) => v.appId);
    const whisperConfig = useContextSelector(ChatBoxContext, (v) => v.whisperConfig);
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

        if (isMobileDevice) {
          renderAudioGraphMobile(analyser, canvas);
        } else {
          renderAudioGraphPc(analyser, canvas);
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
    }, [stream, canvasRef, renderAudioGraphPc, renderAudioGraphMobile, isMobileDevice]);

    const onStartSpeak = useCallback(() => {
      const finishWhisperTranscription = (text: string) => {
        if (!text) return;
        if (whisperConfig?.autoSend) {
          handleSend(text);
        } else {
          resetInputVal(text);
        }
      };
      startSpeak(finishWhisperTranscription);
    }, [handleSend, resetInputVal, startSpeak, whisperConfig?.autoSend]);

    const onSpeach = useCallback(() => {
      if (isMobileDevice) {
        setMobilePreSpeak(true);
      } else {
        onStartSpeak();
      }
    }, [isMobileDevice, onStartSpeak, setMobilePreSpeak]);
    useImperativeHandle(ref, () => ({
      onSpeak: onSpeach,
      getVoiceInputState: () => ({ isSpeaking: isSpeaking || mobilePreSpeak, isTransCription })
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
        bg="transparent"
        zIndex={5}
        borderRadius={isPc ? 'md' : ''}
        onContextMenu={(e) => e.preventDefault()}
      >
        {isMobileDevice ? (
          <MobileVoiceInput
            isSpeaking={isSpeaking}
            onStartSpeak={onStartSpeak}
            onCloseSpeak={() => setMobilePreSpeak(false)}
            stopSpeak={stopSpeak}
            canvasRef={canvasRef}
          />
        ) : (
          <PCVoiceInput
            speakingTimeString={speakingTimeString}
            stopSpeak={stopSpeak}
            canvasRef={canvasRef}
          />
        )}

        {isTransCription && (
          <Flex
            position={'absolute'}
            borderRadius="xxl"
            top={0}
            bottom={0}
            left={0}
            right={0}
            pl={5}
            alignItems={'center'}
            bg={'rgba(255, 255, 255, 0.95)'}
            backdropFilter="blur(4px)"
            color={'primary.500'}
            zIndex={15}
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
