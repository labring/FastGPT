import { useEffect, useRef, useState } from 'react';
import { POST } from '../api/request';
import { useToast } from './useToast';
import { useTranslation } from 'react-i18next';
import { getErrText } from '@fastgpt/global/common/error/utils';

export const useSpeech = () => {
  const { t } = useTranslation();
  const mediaRecorder = useRef<MediaRecorder>();
  const { toast } = useToast();
  const [isSpeaking, setIsSpeaking] = useState(false);

  const startSpeak = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      mediaRecorder.current.ondataavailable = (e) => {
        chunks.push(e.data);
      };

      mediaRecorder.current.onstop = async () => {
        const formData = new FormData();
        const blob = new Blob(chunks, { type: 'audio/webm' });
        formData.append('files', blob, 'recording.webm');

        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'recording.webm';
        document.body.appendChild(link);
        link.click();
        link.remove();

        try {
          const result = await POST<string[]>('/v1/audio/transcriptions', formData, {
            timeout: 60000,
            headers: {
              'Content-Type': 'multipart/form-data; charset=utf-8'
            }
          });

          console.log(result, '===');
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
    }
  };

  return {
    startSpeak,
    stopSpeak,
    isSpeaking
  };
};
