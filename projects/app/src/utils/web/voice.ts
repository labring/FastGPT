import { useState, useCallback, useEffect, useMemo } from 'react';
import { useToast } from '@/hooks/useToast';
import { getErrText } from '../tools';

export const useAudioPlay = (props?: { ttsUrl?: string }) => {
  const { ttsUrl } = props || {};
  const { toast } = useToast();
  const [audio, setAudio] = useState<HTMLAudioElement>();
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);

  const hasAudio = useMemo(() => {
    if (ttsUrl) return true;
    const voices = window.speechSynthesis?.getVoices?.() || []; // 获取语言包
    const voice = voices.find((item) => {
      return item.lang === 'zh-CN';
    });
    return !!voice;
  }, [ttsUrl]);

  const playAudio = useCallback(
    async (text: string) => {
      text = text.replace(/\\n/g, '\n');
      try {
        if (audio && ttsUrl) {
          setAudioLoading(true);
          const response = await fetch(ttsUrl, {
            method: 'POST',
            headers: {
              'content-type': 'application/json'
            },
            body: JSON.stringify({
              text
            })
          }).then((res) => res.blob());

          const audioUrl = URL.createObjectURL(response);
          audio.src = audioUrl;
          audio.play();
        } else {
          // window speech
          window.speechSynthesis?.cancel();
          const msg = new SpeechSynthesisUtterance(text);
          const voices = window.speechSynthesis?.getVoices?.() || []; // 获取语言包
          const voice = voices.find((item) => {
            return item.lang === 'zh-CN';
          });
          if (voice) {
            msg.onstart = () => {
              setAudioPlaying(true);
            };
            msg.onend = () => {
              setAudioPlaying(false);
              msg.onstart = null;
              msg.onend = null;
            };
            msg.voice = voice;
            window.speechSynthesis?.speak(msg);
          }
        }
      } catch (error) {
        toast({
          status: 'error',
          title: getErrText(error, '语音播报异常')
        });
      }
      setAudioLoading(false);
    },
    [audio, toast, ttsUrl]
  );

  const cancelAudio = useCallback(() => {
    if (audio) {
      audio.pause();
      audio.src = '';
    }
    window.speechSynthesis?.cancel();
    setAudioPlaying(false);
  }, [audio]);

  useEffect(() => {
    if (ttsUrl) {
      setAudio(new Audio());
    } else {
      setAudio(undefined);
    }
  }, [ttsUrl]);

  useEffect(() => {
    if (audio) {
      audio.onplay = () => {
        setAudioPlaying(true);
      };
      audio.onended = () => {
        setAudioPlaying(false);
      };
      audio.onerror = () => {
        setAudioPlaying(false);
      };
    }
    const listen = () => {
      cancelAudio();
    };
    window.addEventListener('beforeunload', listen);
    return () => {
      if (audio) {
        audio.onplay = null;
        audio.onended = null;
        audio.onerror = null;
      }
      cancelAudio();
      window.removeEventListener('beforeunload', listen);
    };
  }, [audio, cancelAudio]);

  useEffect(() => {
    return () => {
      setAudio(undefined);
    };
  }, []);

  return {
    audioPlaying,
    audioLoading,
    hasAudio,
    playAudio,
    cancelAudio
  };
};
