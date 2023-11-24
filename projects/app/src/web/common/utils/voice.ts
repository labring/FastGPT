import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useToast } from '@/web/common/hooks/useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import type { AppTTSConfigType } from '@fastgpt/global/core/module/type.d';
import { TTSTypeEnum } from '@/constants/app';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';

export const useAudioPlay = (props?: { ttsConfig?: AppTTSConfigType }) => {
  const { t } = useTranslation();
  const { shareId } = useRouter().query as { shareId?: string };
  const { ttsConfig } = props || {};
  const { toast } = useToast();
  const [audio, setAudio] = useState<HTMLAudioElement>();
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const audioController = useRef(new AbortController());

  // Check whether the voice is supported
  const hasAudio = useMemo(() => {
    if (ttsConfig?.type === TTSTypeEnum.none) return false;
    if (ttsConfig?.type === TTSTypeEnum.model) return true;
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
    buffer?: Uint8Array;
  }) =>
    new Promise<{ buffer?: Uint8Array }>(async (resolve, reject) => {
      text = text.replace(/\\n/g, '\n');
      try {
        // tts play
        if (audio && ttsConfig && ttsConfig?.type === TTSTypeEnum.model) {
          setAudioLoading(true);

          /* buffer tts */
          if (buffer) {
            playAudioBuffer({ audio, buffer });
            setAudioLoading(false);
            return resolve({ buffer });
          }

          audioController.current = new AbortController();

          /* request tts */
          const response = await fetch('/api/core/chat/item/getSpeech', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            signal: audioController.current.signal,
            body: JSON.stringify({
              chatItemId,
              ttsConfig,
              input: text,
              shareId
            })
          });
          setAudioLoading(false);

          if (!response.body || !response.ok) {
            const data = await response.json();
            toast({
              status: 'error',
              title: getErrText(data, t('core.chat.Audio Speech Error'))
            });
            return reject(data);
          }

          const audioBuffer = await readAudioStream({
            audio,
            stream: response.body,
            contentType: 'audio/mpeg'
          });

          resolve({
            buffer: audioBuffer
          });
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
          resolve({});
        }
      } catch (error) {
        toast({
          status: 'error',
          title: getErrText(error, t('core.chat.Audio Speech Error'))
        });
        reject(error);
      }
      setAudioLoading(false);
    });

  const cancelAudio = useCallback(() => {
    if (audio) {
      audio.pause();
      audio.src = '';
    }
    window.speechSynthesis?.cancel();
    audioController.current?.abort();
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
      audio.oncancel = () => {
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

export function readAudioStream({
  audio,
  stream,
  contentType = 'audio/mpeg'
}: {
  audio: HTMLAudioElement;
  stream: ReadableStream<Uint8Array>;
  contentType?: string;
}): Promise<Uint8Array> {
  // Create media source and play audio
  const ms = new MediaSource();
  const url = URL.createObjectURL(ms);
  audio.src = url;
  audio.play();

  let u8Arr: Uint8Array = new Uint8Array();
  return new Promise<Uint8Array>(async (resolve, reject) => {
    // Async to read data from ms
    await new Promise((resolve) => {
      ms.onsourceopen = resolve;
    });

    const sourceBuffer = ms.addSourceBuffer(contentType);

    const reader = stream.getReader();

    // read stream
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          resolve(u8Arr);
          if (sourceBuffer.updating) {
            await new Promise((resolve) => (sourceBuffer.onupdateend = resolve));
          }
          ms.endOfStream();
          return;
        }

        u8Arr = new Uint8Array([...u8Arr, ...value]);

        await new Promise((resolve) => {
          sourceBuffer.onupdateend = resolve;
          sourceBuffer.appendBuffer(value.buffer);
        });
      }
    } catch (error) {
      reject(error);
    }
  });
}
export function playAudioBuffer({
  audio,
  buffer
}: {
  audio: HTMLAudioElement;
  buffer: Uint8Array;
}) {
  const audioUrl = URL.createObjectURL(new Blob([buffer], { type: 'audio/mpeg' }));

  audio.src = audioUrl;
  audio.play();
}
