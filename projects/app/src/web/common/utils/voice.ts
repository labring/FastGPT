import { useState, useCallback, useEffect, useMemo } from 'react';
import { useToast } from '@/web/common/hooks/useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { getChatItemSpeech } from '@/web/core/chat/api';
import { AppTTSConfigType } from '@/types/app';
import { TTSTypeEnum } from '@/constants/app';
import { useTranslation } from 'next-i18next';

export const useAudioPlay = (props?: { ttsConfig?: AppTTSConfigType }) => {
  const { t } = useTranslation();
  const { ttsConfig } = props || {};
  const { toast } = useToast();
  const [audio, setAudio] = useState<HTMLAudioElement>();
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);

  // Check whether the voice is supported
  const hasAudio = useMemo(() => {
    if (ttsConfig?.type === TTSTypeEnum.none) return false;
    const voices = window.speechSynthesis?.getVoices?.() || []; // 获取语言包
    const voice = voices.find((item) => {
      return item.lang === 'zh-CN';
    });
    return !!voice;
  }, [ttsConfig]);

  const playAudio = async ({
    text,
    chatItemId,
    buffer
  }: {
    text: string;
    chatItemId?: string;
    buffer?: Buffer;
  }) => {
    text = text.replace(/\\n/g, '\n');
    try {
      // tts play
      if (audio && ttsConfig && ttsConfig?.type === TTSTypeEnum.model) {
        setAudioLoading(true);
        const { data } = buffer
          ? { data: buffer }
          : await getChatItemSpeech({ chatItemId, ttsConfig, input: text });

        const arrayBuffer = new Uint8Array(data).buffer;

        const audioUrl = URL.createObjectURL(new Blob([arrayBuffer], { type: 'audio/mp3' }));

        audio.src = audioUrl;
        audio.play();
        setAudioLoading(false);

        return data;
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
        title: getErrText(error, t('core.chat.Audio Speech Error'))
      });
    }
    setAudioLoading(false);
  };

  const cancelAudio = useCallback(() => {
    if (audio) {
      audio.pause();
      audio.src = '';
    }
    window.speechSynthesis?.cancel();
    setAudioPlaying(false);
  }, [audio]);

  // listen ttsUrl update
  useEffect(() => {
    setAudio(new Audio());
  }, []);

  // listen audio status
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
