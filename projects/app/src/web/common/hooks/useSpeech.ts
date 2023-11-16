import { useEffect, useMemo, useRef, useState } from 'react';
import { POST } from '../api/request';
import { useToast } from './useToast';
import { useTranslation } from 'react-i18next';
import { getErrText } from '@fastgpt/global/common/error/utils';

export const useSpeech = () => {
  const { t } = useTranslation();
  const mediaRecorder = useRef<MediaRecorder>();
  const mediaStream = useRef<MediaStream>();
  const { toast } = useToast();
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isTransCription, setIsTransCription] = useState(false);
  const [audioLength, setAudioLength] = useState(0);
  const intervalRef = useRef<any>();
  const startTimestamp = useRef(0);

  const renderAudioGraph = (analyser: AnalyserNode, canvas: HTMLCanvasElement) => {
    const bufferLength = analyser.frequencyBinCount;
    const backgroundColor = 'white';
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);
    const canvasCtx = canvas?.getContext('2d');
    const width = 300;
    const height = 200;
    if (!canvasCtx) return;
    canvasCtx.clearRect(0, 0, width, height);
    canvasCtx.fillStyle = backgroundColor;
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
  };

  const startSpeak = async (ref: any) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStream.current = stream;
      mediaRecorder.current = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      mediaRecorder.current.onstart = () => {
        startTimestamp.current = Date.now();
        setAudioLength(0);
        intervalRef.current = setInterval(() => {
          const currentTimestamp = Date.now();
          const duration = (currentTimestamp - startTimestamp.current) / 1000;
          setAudioLength(duration);
        }, 1000);
      };

      mediaRecorder.current.ondataavailable = (e) => {
        chunks.push(e.data);
      };

      mediaRecorder.current.onstop = async () => {
        const formData = new FormData();
        const blob = new Blob(chunks, { type: 'audio/webm' });
        formData.append('files', blob, 'recording.webm');

        try {
          const result = await POST<string[]>('/v1/audio/transcriptions', formData, {
            timeout: 60000,
            headers: {
              'Content-Type': 'multipart/form-data; charset=utf-8'
            }
          });
          ref.current.value = result;
          setIsTransCription(false);
        } catch (error) {
          toast({
            status: 'warning',
            title: getErrText(error, t('common.speech.error tip'))
          });
        }
        setIsSpeaking(false);
      };

      mediaRecorder.current.start();

      setIsSpeaking(true);
    } catch (error) {}
  };

  const stopSpeak = () => {
    if (mediaRecorder.current) {
      mediaRecorder.current?.stop();
      setIsTransCription(true);
      clearInterval(intervalRef.current);
    }
  };

  useEffect(() => {
    return () => {
      clearInterval(intervalRef.current);
      if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
        mediaRecorder.current.stop();
      }
      if (mediaStream.current) {
        mediaStream.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return {
    startSpeak,
    stopSpeak,
    isSpeaking,
    isTransCription,
    renderAudioGraph,
    stream: mediaStream.current,
    audioLength
  };
};
