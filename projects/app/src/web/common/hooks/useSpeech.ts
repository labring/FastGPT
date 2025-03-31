import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { POST } from '../api/request';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useTranslation } from 'next-i18next';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';

export const useSpeech = (props?: OutLinkChatAuthProps & { appId?: string }) => {
  const { t } = useTranslation();
  const mediaRecorder = useRef<MediaRecorder>();
  const [mediaStream, setMediaStream] = useState<MediaStream>();
  const { toast } = useToast();
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isTransCription, setIsTransCription] = useState(false);
  const [audioSecond, setAudioSecond] = useState(0);
  const intervalRef = useRef<any>();
  const startTimestamp = useRef(0);
  const cancelWhisperSignal = useRef(false);
  const [needSpeak, setNeedspeak] = useState(false);
  const stopCalledRef = useRef(false);
  const [canvasColor, setCanvasColor] = useState('#3370FF');
  const [waveColor, setWaveColor] = useState({
    primary: '#3370FF',
    secondary: '#66A3FF'
  });

  const changeWaveColor = useCallback((isPrimary: boolean) => {
    setWaveColor(
      isPrimary
        ? { primary: '#3370FF', secondary: '#66A3FF' }
        : { primary: '#FF3333', secondary: '#FF6666' }
    );
  }, []);

  const speakingTimeString = useMemo(() => {
    const minutes: number = Math.floor(audioSecond / 60);
    const remainingSeconds: number = Math.floor(audioSecond % 60);
    const formattedMinutes: string = minutes.toString().padStart(2, '0');
    const formattedSeconds: string = remainingSeconds.toString().padStart(2, '0');
    return `${formattedMinutes}:${formattedSeconds}`;
  }, [audioSecond]);

  const renderAudioGraph = useCallback(
    (analyser: AnalyserNode, canvas: HTMLCanvasElement) => {
      const bufferLength = analyser.frequencyBinCount;
      const backgroundColor = 'white';
      const dataArray = new Uint8Array(bufferLength);
      analyser.getByteTimeDomainData(dataArray);
      const canvasCtx = canvas?.getContext('2d');

      const width = canvas.width;
      const height = canvas.height;

      if (!canvasCtx) return;
      canvasCtx.clearRect(0, 0, width, height);
      canvasCtx.fillStyle = backgroundColor;
      canvasCtx.fillRect(0, 0, width, height);

      const centerY = height / 2;
      const barWidth = (width / bufferLength) * 1.5;
      let x = width * 0.1;

      let sum = 0;
      let maxDiff = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
        maxDiff = Math.max(maxDiff, Math.abs(dataArray[i] - 128));
      }
      const average = sum / bufferLength;

      canvasCtx.beginPath();
      for (let i = 0; i < bufferLength; i += 2) {
        const value = dataArray[i];
        const normalizedValue = (value - average) / 128;
        const amplification = 2.5;
        const barHeight = normalizedValue * height * 0.4 * amplification;

        // 使用动态颜色
        const gradient = canvasCtx.createLinearGradient(
          x,
          centerY - barHeight,
          x,
          centerY + barHeight
        );
        gradient.addColorStop(0, waveColor.primary);
        gradient.addColorStop(0.5, waveColor.secondary);
        gradient.addColorStop(1, waveColor.primary);

        canvasCtx.fillStyle = gradient;

        canvasCtx.fillRect(x, centerY - Math.abs(barHeight), barWidth, Math.abs(barHeight));
        canvasCtx.fillRect(x, centerY, barWidth, Math.abs(barHeight));

        x += barWidth + 0.5;

        if (x > width * 0.9) break;
      }
    },
    [waveColor]
  );

  const prepareSpeak = useCallback(() => {
    setNeedspeak(true);
    return {
      needSpeak
    };
  }, [toast, t]);

  const startSpeak = useCallback(async (onFinish: (text: string) => void) => {
    if (!navigator?.mediaDevices?.getUserMedia) {
      return toast({
        status: 'warning',
        title: t('common:common.speech.not support')
      });
    }
    try {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      cancelWhisperSignal.current = false;
      stopCalledRef.current = false;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMediaStream(stream);

      // 检查是否需要取消
      if (stopCalledRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      mediaRecorder.current = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      setIsSpeaking(true);

      mediaRecorder.current.onstart = () => {
        startTimestamp.current = Date.now();
        setAudioSecond(0);
        intervalRef.current = setInterval(() => {
          const currentTimestamp = Date.now();
          const duration = (currentTimestamp - startTimestamp.current) / 1000;
          setAudioSecond(duration);
        }, 1000);
      };

      mediaRecorder.current.ondataavailable = (e) => {
        chunks.push(e.data);
      };

      mediaRecorder.current.onstop = async () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        if (!cancelWhisperSignal.current) {
          const formData = new FormData();
          const { options, filename } = (() => {
            if (MediaRecorder.isTypeSupported('video/webm; codecs=vp9')) {
              return {
                options: { mimeType: 'video/webm; codecs=vp9' },
                filename: 'recording.mp3'
              };
            }
            if (MediaRecorder.isTypeSupported('video/webm')) {
              return {
                options: { type: 'video/webm' },
                filename: 'recording.mp3'
              };
            }
            if (MediaRecorder.isTypeSupported('video/mp4')) {
              return {
                options: { mimeType: 'video/mp4', videoBitsPerSecond: 100000 },
                filename: 'recording.mp4'
              };
            }
            return {
              options: { type: 'video/webm' },
              filename: 'recording.mp3'
            };
          })();

          const blob = new Blob(chunks, options);
          const duration = Math.round((Date.now() - startTimestamp.current) / 1000);
          formData.append('file', blob, filename);
          formData.append(
            'data',
            JSON.stringify({
              ...props,
              duration
            })
          );

          setIsTransCription(true);
          try {
            const result = await POST<string>('/v1/audio/transcriptions', formData, {
              timeout: 60000,
              headers: {
                'Content-Type': 'multipart/form-data; charset=utf-8'
              }
            });
            onFinish(result);
          } catch (error) {
            toast({
              status: 'warning',
              title: getErrText(error, t('common:common.speech.error tip'))
            });
          }
        }

        // close media stream
        stream.getTracks().forEach((track) => track.stop());

        setIsTransCription(false);
        setIsSpeaking(false);
      };

      mediaRecorder.current.onerror = (e) => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        console.log('error', e);
        setIsSpeaking(false);
      };

      mediaRecorder.current.start();
    } catch (error) {
      toast({
        status: 'warning',
        title: getErrText(error, 'Whisper error')
      });
      console.log(error);
    }
  }, [toast, t, props, POST]);

  const stopSpeak = useCallback((cancel = false) => {
    cancelWhisperSignal.current = cancel;
    stopCalledRef.current = true;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
      mediaRecorder.current.stop();
    }
  }, []);

  const finishSpeak = useCallback(() => {
    setNeedspeak(false);
    stopSpeak(true);
    return {
      needSpeak
    };
  }, [stopSpeak]);

  useEffect(() => {
    return () => {
      clearInterval(intervalRef.current);
      if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
        mediaRecorder.current.stop();
      }
      if (mediaStream) {
        mediaStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // listen minuted. over 60 seconds, stop speak
  useEffect(() => {
    if (audioSecond >= 60) {
      stopSpeak();
    }
  }, [audioSecond, stopSpeak]);

  return {
    startSpeak,
    stopSpeak,
    prepareSpeak,
    finishSpeak,
    needSpeak,
    isSpeaking,
    isTransCription,
    renderAudioGraph,
    stream: mediaStream,
    speakingTimeString,
    changeWaveColor
  };
};
