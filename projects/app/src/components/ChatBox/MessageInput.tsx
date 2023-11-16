import { useSpeech } from '@/web/common/hooks/useSpeech';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { Box, Flex, Spinner, Textarea } from '@chakra-ui/react';
import React, { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import MyTooltip from '../MyTooltip';
import MyIcon from '../Icon';
import styles from './index.module.scss';
import { useRouter } from 'next/router';

const MessageInput = ({
  onChange,
  onSendMessage,
  onStop,
  isChatting,
  TextareaDom,
  resetInputVal
}: {
  onChange: (e: string) => void;
  onSendMessage: (e: string) => void;
  onStop: () => void;
  isChatting: boolean;
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
  const canvasRef = useRef<HTMLCanvasElement>();
  const { t } = useTranslation();
  const textareaMinH = '22px';
  const havInput = !!TextareaDom.current?.value;

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
      renderAudioGraph(analyser, canvasRef.current as HTMLCanvasElement);
      window.requestAnimationFrame(renderCurve);
    };
    renderCurve();
  }, [renderAudioGraph, stream]);

  return (
    <>
      <Box m={['0 auto', '10px auto']} w={'100%'} maxW={['auto', 'min(800px, 100%)']} px={[0, 5]}>
        <Box
          py={'18px'}
          position={'relative'}
          boxShadow={isSpeaking ? `0 0 10px rgba(54,111,255,0.4)` : `0 0 10px rgba(0,0,0,0.2)`}
          {...(isPc
            ? {
                border: '1px solid',
                borderColor: 'rgba(0,0,0,0.12)'
              }
            : {
                borderTop: '1px solid',
                borderTopColor: 'rgba(0,0,0,0.15)'
              })}
          borderRadius={['none', 'md']}
          backgroundColor={'white'}
        >
          {/* translate loading */}
          <Box
            position={'absolute'}
            top={0}
            bottom={0}
            left={4}
            right={['8px', '4px']}
            zIndex={10}
            display={'flex'}
            alignItems={'center'}
            bg={'white'}
            pl={['5px', '10px']}
            color="rgba(54,111,255,0.6)"
            visibility={isSpeaking && isTransCription ? 'visible' : 'hidden'}
          >
            <Spinner size={'sm'} mr={4} />
            {t('chat.Converting to text')}
          </Box>
          {/* input area */}
          <Textarea
            ref={TextareaDom}
            py={0}
            pr={['45px', '55px']}
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
                onSendMessage(TextareaDom.current?.value || '');
                e.preventDefault();
              }
              // 全选内容
              // @ts-ignore
              e.key === 'a' && e.ctrlKey && e.target?.select();
            }}
          />
          <Flex
            position={'absolute'}
            alignItems={'center'}
            right={['12px', '14px']}
            bottom={['15px', '13px']}
          >
            {/* voice-input */}
            {!shareId && !havInput && !isChatting && (
              <>
                <canvas
                  ref={canvasRef as any}
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
                      color={'myBlue.600'}
                    />
                  </MyTooltip>
                </Flex>
              </>
            )}
            {/* send and stop icon */}
            {isSpeaking ? (
              <Box color={'#5A646E'}>{speakingTimeString}</Box>
            ) : (
              <Flex
                alignItems={'center'}
                justifyContent={'center'}
                h={['28px', '32px']}
                w={['28px', '32px']}
                borderRadius={'md'}
                bg={isSpeaking || isChatting ? '' : !havInput ? '#E5E5E5' : 'myBlue.600'}
                cursor={havInput ? 'pointer' : 'not-allowed'}
                lineHeight={1}
                onClick={() => {
                  if (isChatting) {
                    return onStop();
                  }
                  if (havInput) {
                    onSendMessage(TextareaDom.current?.value || '');
                  }
                }}
              >
                {isChatting ? (
                  <MyIcon
                    className={styles.stopIcon}
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
        </Box>
      </Box>
    </>
  );
};

export default React.memo(MessageInput);
