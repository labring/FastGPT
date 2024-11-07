'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import type { AppTTSConfigType } from '@fastgpt/global/core/app/type.d';
import { TTSTypeEnum } from '@/web/core/app/constants';
import { useTranslation } from 'next-i18next';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat.d';
import { useMount } from 'ahooks';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';

const contentType = 'audio/mpeg';
const splitMarker = 'SPLIT_MARKER';

// 添加 MediaSource 支持检测函数
const isMediaSourceSupported = () => {
  return typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported?.(contentType);
};

export const useAudioPlay = (props?: OutLinkChatAuthProps & { ttsConfig?: AppTTSConfigType }) => {
  const { t } = useTranslation();
  const { ttsConfig, shareId, outLinkUid, teamId, teamToken } = props || {};
  const { toast } = useToast();
  const audioRef = useRef<HTMLAudioElement>();
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const audioController = useRef(new AbortController());

  // Check whether the voice is supported
  const hasAudio = (() => {
    if (typeof window === 'undefined') return false;
    if (ttsConfig?.type === TTSTypeEnum.none) return false;
    if (ttsConfig?.type === TTSTypeEnum.model) return true;
    const voices = window?.speechSynthesis?.getVoices?.() || []; // 获取语言包
    const voice = voices.find((item) => {
      return item.lang === 'zh-CN' || item.lang === 'zh';
    });
    return !!voice;
  })();

  const getAudioStream = useCallback(
    async (input: string) => {
      if (!input) return Promise.reject('Text is empty');

      setAudioLoading(true);
      audioController.current = new AbortController();

      const response = await fetch(getWebReqUrl('/api/core/chat/item/getSpeech'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        signal: audioController.current.signal,
        body: JSON.stringify({
          ttsConfig,
          input: input.trim(),
          shareId,
          outLinkUid,
          teamId,
          teamToken
        })
      }).finally(() => {
        setAudioLoading(false);
      });

      if (!response.body || !response.ok) {
        const data = await response.json();
        toast({
          status: 'error',
          title: getErrText(data, t('common:core.chat.Audio Speech Error'))
        });
        return Promise.reject(data);
      }
      return response.body;
    },
    [outLinkUid, shareId, t, teamId, teamToken, toast, ttsConfig]
  );
  const playWebAudio = useCallback((text: string) => {
    // window speech
    window?.speechSynthesis?.cancel();
    const msg = new SpeechSynthesisUtterance(text);
    const voices = window?.speechSynthesis?.getVoices?.() || []; // 获取语言包
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
  }, []);
  const cancelAudio = useCallback(() => {
    try {
      window.speechSynthesis?.cancel();
      audioController.current.abort('');
    } catch (error) {}
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    setAudioPlaying(false);
  }, []);

  /* Perform a voice playback */
  const playAudioByText = useCallback(
    async ({ text, buffer }: { text: string; buffer?: Uint8Array }) => {
      const playAudioBuffer = (buffer: Uint8Array) => {
        if (!audioRef.current) return;
        const audioUrl = URL.createObjectURL(new Blob([buffer], { type: contentType }));
        audioRef.current.src = audioUrl;
        audioRef.current.play();
      };
      const readAudioStream = (stream: ReadableStream<Uint8Array>) => {
        if (!audioRef.current) return;

        if (!isMediaSourceSupported()) {
          // 不支持 MediaSource 时，直接读取完整流并播放
          return new Promise<Uint8Array>(async (resolve) => {
            const reader = stream.getReader();
            let chunks: Uint8Array[] = [];

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              chunks.push(value);
            }

            const fullBuffer = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
            let offset = 0;
            for (const chunk of chunks) {
              fullBuffer.set(chunk, offset);
              offset += chunk.length;
            }

            playAudioBuffer(fullBuffer);
            resolve(fullBuffer);
          });
        }

        // 原有的 MediaSource 逻辑
        const ms = new MediaSource();
        const url = URL.createObjectURL(ms);
        audioRef.current.src = url;
        audioRef.current.play();

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
              if (done || audioRef.current?.paused) {
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
      };

      return new Promise<{ buffer?: Uint8Array }>(async (resolve, reject) => {
        text = text.replace(/\\n/g, '\n');
        try {
          // stop last audio
          cancelAudio();

          // tts play
          if (audioRef.current && ttsConfig?.type === TTSTypeEnum.model) {
            /* buffer tts */
            if (buffer) {
              playAudioBuffer(buffer);
              return resolve({ buffer });
            }

            /* request tts */
            const audioBuffer = await readAudioStream(await getAudioStream(text));

            resolve({
              buffer: audioBuffer
            });
          } else {
            // window speech
            playWebAudio(text);
            resolve({});
          }
        } catch (error) {
          toast({
            status: 'error',
            title: getErrText(error, t('common:core.chat.Audio Speech Error'))
          });
          reject(error);
        }
      });
    },
    [cancelAudio, getAudioStream, playWebAudio, t, toast, ttsConfig?.type]
  );

  // segmented params
  const segmentedMediaSource = useRef<MediaSource>();
  const segmentedSourceBuffer = useRef<SourceBuffer>();
  const segmentedTextList = useRef<string[]>([]);
  const appendAudioPromise = useRef<Promise<any>>(Promise.resolve());

  /* Segmented voice playback */
  const startSegmentedAudio = useCallback(async () => {
    if (!audioRef.current) return;

    if (!isMediaSourceSupported()) {
      // 不支持 MediaSource 时，直接使用简单的音频播放
      cancelAudio();
      segmentedTextList.current = [];
      return;
    }

    cancelAudio();

    /* reset all source */
    const buffer = segmentedSourceBuffer.current;
    if (buffer) {
      buffer.updating && (await new Promise((resolve) => (buffer.onupdateend = resolve)));
      segmentedSourceBuffer.current = undefined;
    }
    if (segmentedMediaSource.current) {
      if (segmentedMediaSource.current?.readyState === 'open') {
        segmentedMediaSource.current.endOfStream();
      }
      segmentedMediaSource.current = undefined;
    }

    /* init source */
    segmentedTextList.current = [];
    appendAudioPromise.current = Promise.resolve();

    /* start ms and source buffer */
    const ms = new MediaSource();
    segmentedMediaSource.current = ms;
    const url = URL.createObjectURL(ms);
    audioRef.current.src = url;
    audioRef.current.play();

    await new Promise((resolve) => {
      ms.onsourceopen = resolve;
    });
    const sourceBuffer = ms.addSourceBuffer(contentType);
    segmentedSourceBuffer.current = sourceBuffer;
  }, [cancelAudio, t, toast]);
  const finishSegmentedAudio = useCallback(() => {
    if (!isMediaSourceSupported()) {
      // 不支持 MediaSource 时，不需要特殊处理
      return;
    }

    appendAudioPromise.current = appendAudioPromise.current.finally(() => {
      if (segmentedMediaSource.current?.readyState === 'open') {
        segmentedMediaSource.current.endOfStream();
      }
    });
  }, []);

  const appendAudioStream = useCallback(
    (input: string) => {
      const buffer = segmentedSourceBuffer.current;

      if (!buffer) return;

      let u8Arr: Uint8Array = new Uint8Array();
      return new Promise<Uint8Array>(async (resolve, reject) => {
        // read stream
        try {
          const stream = await getAudioStream(input);
          const reader = stream.getReader();

          while (true) {
            const { done, value } = await reader.read();

            if (done || !audioRef.current?.played) {
              buffer.updating && (await new Promise((resolve) => (buffer.onupdateend = resolve)));
              return resolve(u8Arr);
            }

            u8Arr = new Uint8Array([...u8Arr, ...value]);

            await new Promise((resolve) => {
              buffer.onupdateend = resolve;
              buffer.appendBuffer(value.buffer);
            });
          }
        } catch (error) {
          reject(error);
        }
      });
    },
    [getAudioStream, segmentedSourceBuffer]
  );
  /* split audio text and fetch tts */
  const splitText2Audio = useCallback(
    async (text: string, done?: boolean) => {
      if (ttsConfig?.type === TTSTypeEnum.model && ttsConfig?.model) {
        if (!isMediaSourceSupported()) {
          // 不支持 MediaSource 时，等待文本结束后一次性播放
          if (done) {
            try {
              const stream = await getAudioStream(text);
              const reader = stream.getReader();
              let chunks: Uint8Array[] = [];

              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
              }

              const fullBuffer = new Uint8Array(
                chunks.reduce((acc, chunk) => acc + chunk.length, 0)
              );
              let offset = 0;
              for (const chunk of chunks) {
                fullBuffer.set(chunk, offset);
                offset += chunk.length;
              }

              if (audioRef.current) {
                const audioUrl = URL.createObjectURL(new Blob([fullBuffer], { type: contentType }));
                audioRef.current.src = audioUrl;
                audioRef.current.play();
              }
            } catch (error) {
              console.error('Play audio error:', error);
            }
          }
          return;
        }

        // 原有的分段逻辑
        const splitReg = /([。！？]|[.!?]\s)/g;
        const storeText = segmentedTextList.current.join('');
        const newText = text.slice(storeText.length);

        const splitTexts = newText
          .replace(splitReg, (() => `$1${splitMarker}`.trim())())
          .split(`${splitMarker}`)
          .filter((part) => part.trim());

        if (splitTexts.length > 1 || done) {
          let splitList = splitTexts.slice();

          // concat same sentence
          if (!done) {
            splitList = splitTexts.slice(0, -1);
            splitList = [splitList.join('')];
          }

          segmentedTextList.current = segmentedTextList.current.concat(splitList);

          for (const item of splitList) {
            appendAudioPromise.current = appendAudioPromise.current.then(() =>
              appendAudioStream(item)
            );
          }
        }
      } else if (ttsConfig?.type === TTSTypeEnum.web && done) {
        playWebAudio(text);
      }
    },
    [appendAudioStream, playWebAudio, ttsConfig?.model, ttsConfig?.type]
  );

  // listen audio status
  useMount(() => {
    const audio = new Audio();
    audioRef.current = audio;

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
    const listen = () => {
      cancelAudio();
    };
    window.addEventListener('beforeunload', listen);
    return () => {
      audio.onplay = null;
      audio.onended = null;
      audio.onerror = null;
      cancelAudio();
      audio.remove();
      window.removeEventListener('beforeunload', listen);
    };
  });

  return {
    audio: audioRef.current,
    audioLoading,
    audioPlaying,
    setAudioPlaying,
    getAudioStream,
    cancelAudio,
    audioController,
    hasAudio: useMemo(() => hasAudio, [hasAudio]),
    playAudioByText,
    startSegmentedAudio,
    finishSegmentedAudio,
    splitText2Audio
  };
};
