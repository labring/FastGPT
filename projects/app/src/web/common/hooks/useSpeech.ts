import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { POST } from '../api/request';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useTranslation } from 'next-i18next';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';

export const useSpeech = (props?: OutLinkChatAuthProps & { appId?: string }) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isTransCription, setIsTransCription] = useState(false);

  const mediaRecorder = useRef<MediaRecorder>();
  const [mediaStream, setMediaStream] = useState<MediaStream>();

  const timeIntervalRef = useRef<any>();
  const cancelWhisperSignal = useRef(false);
  const stopCalledRef = useRef(false);

  const startTimestamp = useRef(0);

  const [audioSecond, setAudioSecond] = useState(0);
  const speakingTimeString = useMemo(() => {
    const minutes: number = Math.floor(audioSecond / 60);
    const remainingSeconds: number = Math.floor(audioSecond % 60);
    const formattedMinutes: string = minutes.toString().padStart(2, '0');
    const formattedSeconds: string = remainingSeconds.toString().padStart(2, '0');
    return `${formattedMinutes}:${formattedSeconds}`;
  }, [audioSecond]);

  const renderAudioGraphPc = useCallback((analyser: AnalyserNode, canvas: HTMLCanvasElement) => {
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);
    const canvasCtx = canvas?.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    if (!canvasCtx) return;
    canvasCtx.clearRect(0, 0, width, height);
    canvasCtx.fillStyle = 'white';
    canvasCtx.fillRect(0, 0, width, height);
    const barWidth = (width / bufferLength) * 2.5;
    let x = 0;

    canvasCtx.moveTo(x, height / 2);
    for (let i = 0; i < bufferLength; i += 10) {
      const barHeight = (dataArray[i] / 256) * height - height * 0.15;
      canvasCtx.fillStyle = '#3370FF';
      const adjustedBarHeight = Math.max(0, barHeight);
      canvasCtx.fillRect(x, height - adjustedBarHeight, barWidth, adjustedBarHeight);
      x += barWidth + 1;
    }
  }, []);
  const renderAudioGraphMobile = useCallback(
    (analyser: AnalyserNode, canvas: HTMLCanvasElement) => {
      const canvasCtx = canvas?.getContext('2d');
      if (!canvasCtx) return;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyser.getByteTimeDomainData(dataArray);

      const width = canvas.width;
      const height = canvas.height;
      canvasCtx.clearRect(0, 0, width, height);

      // Set transparent background
      canvasCtx.fillStyle = 'rgba(255, 255, 255, 0)';
      canvasCtx.fillRect(0, 0, width, height);

      const centerY = height / 2;
      const barWidth = (width / bufferLength) * 15;
      const gap = 2; // 添加间隙
      let x = width * 0.1;

      let sum = 0;
      let maxDiff = 0;

      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
        maxDiff = Math.max(maxDiff, Math.abs(dataArray[i] - 128));
      }
      const average = sum / bufferLength;

      // draw initial rectangle waveform
      canvasCtx.beginPath();
      canvasCtx.fillStyle = '#FFFFFF';

      const initialHeight = height * 0.1;
      for (let i = 0; i < width * 0.8; i += barWidth + gap) {
        canvasCtx.fillRect(i + width * 0.1, centerY - initialHeight, barWidth, initialHeight);
        canvasCtx.fillRect(i + width * 0.1, centerY, barWidth, initialHeight);
      }

      // draw dynamic waveform
      canvasCtx.beginPath();
      for (let i = 0; i < bufferLength; i += 4) {
        const value = dataArray[i];
        const normalizedValue = (value - average) / 128;
        const amplification = 2.5;
        const barHeight = normalizedValue * height * 0.4 * amplification;

        canvasCtx.fillStyle = '#FFFFFF';

        canvasCtx.fillRect(x, centerY - Math.abs(barHeight), barWidth, Math.abs(barHeight));
        canvasCtx.fillRect(x, centerY, barWidth, Math.abs(barHeight));

        x += barWidth + gap; // 增加间隔

        if (x > width * 0.9) break;
      }
    },
    []
  );

  const startSpeak = useCallback(
    async (onFinish: (text: string) => void) => {
      if (!navigator?.mediaDevices?.getUserMedia) {
        return toast({
          status: 'warning',
          title: t('common:common.speech.not support')
        });
      }

      // Init status
      if (timeIntervalRef.current) {
        clearInterval(timeIntervalRef.current);
      }
      cancelWhisperSignal.current = false;
      stopCalledRef.current = false;

      setIsSpeaking(true);
      setAudioSecond(0);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setMediaStream(stream);

        mediaRecorder.current = new MediaRecorder(stream);
        const chunks: Blob[] = [];

        mediaRecorder.current.onstart = () => {
          startTimestamp.current = Date.now();
          timeIntervalRef.current = setInterval(() => {
            const currentTimestamp = Date.now();
            const duration = (currentTimestamp - startTimestamp.current) / 1000;
            setAudioSecond(duration);
          }, 1000);
        };
        mediaRecorder.current.ondataavailable = (e) => {
          chunks.push(e.data);
        };
        mediaRecorder.current.onstop = async () => {
          // close media stream
          stream.getTracks().forEach((track) => track.stop());
          setIsSpeaking(false);

          if (timeIntervalRef.current) {
            clearInterval(timeIntervalRef.current);
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
            setIsTransCription(false);
          }
        };
        mediaRecorder.current.onerror = (e) => {
          if (timeIntervalRef.current) {
            clearInterval(timeIntervalRef.current);
          }
          console.log('error', e);
          setIsSpeaking(false);
        };

        // If onclick stop, stop speak
        if (stopCalledRef.current) {
          mediaRecorder.current.stop();
        } else {
          mediaRecorder.current.start();
        }
      } catch (error) {
        toast({
          status: 'warning',
          title: getErrText(error, 'Whisper error')
        });
        console.log(error);
      }
    },
    [toast, t, props]
  );

  const stopSpeak = useCallback((cancel = false) => {
    cancelWhisperSignal.current = cancel;
    stopCalledRef.current = true;

    if (timeIntervalRef.current) {
      clearInterval(timeIntervalRef.current);
    }

    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
      mediaRecorder.current.stop();
    }
  }, []);

  // Leave page, stop speak
  useEffect(() => {
    return () => {
      clearInterval(timeIntervalRef.current);
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
    isSpeaking,
    isTransCription,
    renderAudioGraphPc,
    renderAudioGraphMobile,
    stream: mediaStream,
    speakingTimeString
  };
};
