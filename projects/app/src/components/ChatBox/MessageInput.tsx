import { useSpeech } from '@/web/common/hooks/useSpeech';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { Box, Flex, Spinner, Textarea } from '@chakra-ui/react';
import React, { useMemo, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import MyTooltip from '../MyTooltip';
import MyIcon from '../Icon';
import styles from './index.module.scss';

const MessageInput = (props: {
  setRefresh: React.Dispatch<React.SetStateAction<boolean>>;
  variables: Record<string, any>;
  sendPrompt: (data: Record<string, any>, value: string) => void;
  isChatting: boolean;
  chatController: React.MutableRefObject<AbortController | null>;
  TextareaDom: React.MutableRefObject<HTMLTextAreaElement | null>;
}) => {
  const { setRefresh, variables, sendPrompt, isChatting, chatController, TextareaDom } = props;
  const {
    isSpeaking,
    isTransCription,
    stopSpeak,
    startSpeak,
    audioLength,
    renderAudioGraph,
    stream
  } = useSpeech();
  const { isPc } = useSystemStore();
  const canvasRef = useRef<HTMLCanvasElement>();
  const { t } = useTranslation();
  const textareaMinH = '22px';
  const { handleSubmit } = useForm<Record<string, any>>({
    defaultValues: variables
  });
  const audioTime = useMemo(() => {
    const minutes: number = Math.floor(audioLength / 60);
    const remainingSeconds: number = Math.floor(audioLength % 60);
    const formattedMinutes: string = minutes.toString().padStart(2, '0');
    const formattedSeconds: string = remainingSeconds.toString().padStart(2, '0');
    return `${formattedMinutes}:${formattedSeconds}`;
  }, [audioLength]);

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
          <canvas
            ref={canvasRef as any}
            style={{
              height: '32px',
              width: '32px',
              position: 'absolute',
              top: 4,
              right: 108,
              zIndex: 10,
              visibility: isSpeaking && !isTransCription ? 'visible' : 'hidden',
              background: 'white'
            }}
          />
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
          {/* 输入框 */}
          <Textarea
            ref={TextareaDom}
            py={0}
            pr={['45px', '55px']}
            border={'none'}
            _focusVisible={{
              border: 'none'
            }}
            placeholder="提问"
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
              setRefresh((state) => !state);
            }}
            onKeyDown={(e) => {
              // enter send.(pc or iframe && enter and unPress shift)
              if ((isPc || window !== parent) && e.keyCode === 13 && !e.shiftKey) {
                handleSubmit((data) => sendPrompt(data, TextareaDom.current?.value || ''))();
                e.preventDefault();
              }
              // 全选内容
              // @ts-ignore
              e.key === 'a' && e.ctrlKey && e.target?.select();
            }}
          />
          {/* voice-input */}
          {!TextareaDom.current?.value && (
            <Flex
              alignItems={'center'}
              justifyContent={'center'}
              h={['26px', '32px']}
              w={['26px', '32px']}
              position={'absolute'}
              right={['50px', '62px']}
              bottom={['15px', '13px']}
              borderRadius={'md'}
              bg={isSpeaking ? '#F5F5F8' : ''}
              cursor={'pointer'}
              lineHeight={1}
              _hover={{ bg: '#F5F5F8' }}
              onClick={() => {
                if (isSpeaking) {
                  return stopSpeak();
                }
                startSpeak(TextareaDom);
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
          )}

          {/* 发送和等待按键 */}
          <Flex
            alignItems={'center'}
            justifyContent={'center'}
            h={['26px', '32px']}
            w={['26px', '32px']}
            position={'absolute'}
            right={['12px', '14px']}
            bottom={['15px', '13px']}
            borderRadius={'md'}
            bg={
              isSpeaking ? '' : isChatting || !TextareaDom.current?.value ? '#E5E5E5' : 'myBlue.600'
            }
            cursor={TextareaDom.current?.value ? 'pointer' : 'not-allowed'}
            lineHeight={1}
            onClick={() => {
              if (isChatting) {
                return chatController.current?.abort('stop');
              }
              if (TextareaDom.current?.value) {
                return handleSubmit((data) => sendPrompt(data, TextareaDom.current?.value || ''))();
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
            ) : !isSpeaking ? (
              <MyTooltip label={t('core.chat.Send Message')}>
                <MyIcon
                  name={'core/chat/sendFill'}
                  width={'20px'}
                  height={'20px'}
                  color={'white'}
                />
              </MyTooltip>
            ) : (
              <Box color={'#5A646E'}>{audioTime}</Box>
            )}
          </Flex>
        </Box>
      </Box>
    </>
  );
};

export default MessageInput;
