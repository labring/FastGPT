import { useSpeech } from '@/web/common/hooks/useSpeech';
import { Box, Flex, Spinner } from '@chakra-ui/react';
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

const TouchListenComponent = ({
  isSpeaking,
  isTransCription,
  onWhisperRecord,
  stopSpeak,
  canvasRef,
  needSpeak,
  changeWaveColor
}: TouchListenComponentProps) => {
  const startTimeRef = useRef(0);
  const elapsedTimeRef = useRef(0);
  const startYRef = useRef(0);
  const isCancle = useRef(false);
  const isPressing = useRef(false);
  const [showshortPopup, setShowshortPopup] = useState(false);
  const [showmovePopup, setShowmovePopup] = useState(false);
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

      setShowmovePopup(true);
      if (deltaY > 90 && !isCancle.current) {
        isCancle.current = true;
        changeWaveColor(false);
      } else if (deltaY <= 90 && isCancle) {
        isCancle.current = false;
        changeWaveColor(true);
      }
    },
    [startYRef]
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
      setShowmovePopup(false);
      setShowshortPopup(false);
      changeWaveColor(true);
      if (isCancle.current) {
        stopSpeak(true);
      } else {
        if (timeDifference < 200) {
          stopSpeak(true);
          setShowshortPopup(true);
        } else {
          stopSpeak(false);
        }
      }
    },
    [isCancle, stopSpeak]
  );

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (showshortPopup || showmovePopup) {
      timer = setTimeout(() => {
        setShowshortPopup(false);
      }, 1000);
    }
    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [showshortPopup, showmovePopup]);

  return (
    <div
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchStart={handleTouchStart}
      style={{ width: '100%', height: '100%' }}
    >
      <Flex
        justifyContent="center"
        alignItems="center"
        height="30px"
        visibility={needSpeak && !isTransCription ? 'visible' : 'hidden'}
        backgroundColor={moveRef.current ? 'red' : 'white'}
      >
        <p style={{ position: 'absolute', margin: 0, zIndex: 0 }}>按住说话</p>
        <canvas
          ref={canvasRef}
          style={{
            marginLeft: '10px',
            height: '100%',
            width: '80%',
            zIndex: 1,
            touchAction: 'none',
            backgroundColor: moveRef.current ? 'red' : '',
            transition: 'background-color 0.2s ease'
          }}
        />
      </Flex>
      {showmovePopup && (
        <div
          style={{
            position: 'fixed',
            top: '77%',
            left: '50%',
            transform: 'translate(-50%, 50%)',
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '5px',
            boxShadow: '0 0 10px rgba(0, 0, 0, 0.3)',
            zIndex: 1000
          }}
        >
          <h2>上滑取消</h2>
        </div>
      )}
      {showshortPopup && (
        <div
          style={{
            position: 'fixed',
            top: '77%',
            left: '50%',
            transform: 'translate(-50%, 50%)',
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '5px',
            boxShadow: '0 0 10px rgba(0, 0, 0, 0.3)',
            zIndex: 1000
          }}
        >
          <h2>说话时间太短</h2>
        </div>
      )}
    </div>
  );
};

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
    renderAudioGraph,
    stream,
    changeWaveColor
  } = useSpeech({ appId, ...outLinkAuthData });


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
      renderAudioGraph(analyser, canvas);
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
  }, [stream, canvasRef, renderAudioGraph]);

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
      {/* 语音输入覆盖层 */}
      {(isSpeaking || needSpeak) && (
        <Box
          position="absolute"
          top={0}
          left={0}
          right={0}
          bottom={0}
          bg="white"
          borderRadius="md"
          zIndex={10}
          display="flex"
          flexDirection="column"
          backgroundColor={'white'}
        >
          {isPc ? (
            <Flex
              position="absolute"
              top={-2}
              left={0}
              height={'40px'}
              justifyContent={'center'}
              width={'100%'}
              px={4}
              backgroundColor={'white'}
            >
              {isSpeaking && (
                <Box color={'#5A646E'} ml={2} whiteSpace={'nowrap'}>
                  {speakingTimeString}
                </Box>
              )}
              <canvas
                ref={canvasRef}
                style={{
                  height: '40px',
                  width: isSpeaking && !isTransCription ? '200px' : 0,
                  background: 'white',
                  zIndex: 0
                }}
              />
              {isSpeaking && !isTransCription && (
                <Flex>
                  <MyTooltip label={t('common:core.chat.Cancel Speak')}>
                    <Flex
                      ml={60}
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
                  <MyTooltip label={'common:core.chat.Finish Speak'}>
                    <Flex
                      alignItems={'center'}
                      justifyContent={'center'}
                      flexShrink={0}
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
              )}
            </Flex>
          ) : (
            needSpeak && (
              <Flex
                position="absolute"
                height={'32px'}
                left={0}
                right={0}
                top={-1}
                alignItems="center"
                backgroundColor={'white'}
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
                <Flex ml="auto">
                  <MyTooltip label={t('common:core.chat.Back to Text')}>
                    <Flex
                      alignItems={'center'}
                      mr={2}
                      justifyContent={'center'}
                      h={['26px', '32px']}
                      w={['26px', '32px']}
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
