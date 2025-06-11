import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { POST } from '../api/request';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useTranslation } from 'next-i18next';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { type OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';

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

  // 添加波形数据缓存和动画控制
  const waveformDataRef = useRef<number[]>([]);
  const lastUpdateTimeRef = useRef(0);

  // 移动端波形数据缓存
  const mobileWaveformDataRef = useRef<number[]>([]);
  const mobileLastUpdateTimeRef = useRef(0);

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
    if (!canvasCtx) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    canvasCtx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const width = canvas.width / window.devicePixelRatio;
    const height = canvas.height / window.devicePixelRatio;

    canvasCtx.clearRect(0, 0, width, height);

    canvasCtx.beginPath();
    canvasCtx.moveTo(0, height / 2);
    canvasCtx.lineTo(width, height / 2);
    canvasCtx.strokeStyle = '#E5E7EB';
    canvasCtx.lineWidth = 0.5;
    canvasCtx.stroke();
    canvasCtx.closePath();

    // 波形参数
    const centerY = height / 2;
    const dataPoints = 300;
    const maxBarHeight = height * 0.35;

    // 更敏感的音频数据处理 - 多次采样并平均
    let intensitySum = 0;
    const sampleCount = 8;

    for (let sample = 0; sample < sampleCount; sample++) {
      let sum = 0;
      let maxVal = 0;
      const startIndex = Math.floor((sample * bufferLength) / sampleCount);
      const endIndex = Math.floor(((sample + 1) * bufferLength) / sampleCount);

      for (let i = startIndex; i < endIndex; i++) {
        sum += dataArray[i];
        maxVal = Math.max(maxVal, Math.abs(dataArray[i] - 128));
      }

      const sampleIntensity = maxVal > 2 ? (maxVal / 128) * 2.5 : 0.03; // 提高敏感度：阈值从5降到2，放大倍数从1.5提升到2.5
      intensitySum += sampleIntensity;
    }

    const currentIntensity = intensitySum / sampleCount;

    const currentTime = Date.now();
    if (currentTime - lastUpdateTimeRef.current > 16) {
      if (waveformDataRef.current.length !== dataPoints) {
        waveformDataRef.current = new Array(dataPoints).fill(0.03);
      }

      const smoothingFactor = 0.4; // 提高响应速度：从0.3提升到0.4
      const smoothedIntensity =
        (waveformDataRef.current[dataPoints - 1] || 0.03) * (1 - smoothingFactor) +
        currentIntensity * smoothingFactor;

      waveformDataRef.current.shift(); // 移除最左侧的数据
      waveformDataRef.current.push(smoothedIntensity); // 在右侧添加新数据

      lastUpdateTimeRef.current = currentTime;
    }

    // 绘制平滑的波形曲线
    if (waveformDataRef.current.length > 0) {
      // 创建渐变效果
      const gradient = canvasCtx.createLinearGradient(
        0,
        centerY - maxBarHeight,
        0,
        centerY + maxBarHeight
      );
      gradient.addColorStop(0, 'rgba(59, 130, 246, 0.8)'); // 蓝色，更透明
      gradient.addColorStop(0.5, 'rgba(59, 130, 246, 0.4)');
      gradient.addColorStop(1, 'rgba(59, 130, 246, 0.1)');

      // 绘制上半部分波形曲线
      canvasCtx.beginPath();
      canvasCtx.moveTo(0, centerY);

      for (let i = 0; i < dataPoints; i++) {
        const x = (i / (dataPoints - 1)) * width;
        const intensity = waveformDataRef.current[i] || 0.03;
        const y = centerY - intensity * maxBarHeight * 1.5; // 提高波形幅度

        if (i === 0) {
          canvasCtx.moveTo(x, y);
        } else {
          const prevX = ((i - 1) / (dataPoints - 1)) * width;
          const prevIntensity = waveformDataRef.current[i - 1] || 0.03;
          const prevY = centerY - prevIntensity * maxBarHeight * 1.5;
          const cpX = (prevX + x) / 2;
          const cpY = (prevY + y) / 2;
          canvasCtx.quadraticCurveTo(cpX, cpY, x, y);
        }
      }

      canvasCtx.lineTo(width, centerY);
      canvasCtx.lineTo(0, centerY);
      canvasCtx.closePath();
      canvasCtx.fillStyle = gradient;
      canvasCtx.fill();

      canvasCtx.beginPath();
      canvasCtx.moveTo(0, centerY);

      for (let i = 0; i < dataPoints; i++) {
        const x = (i / (dataPoints - 1)) * width;
        const intensity = waveformDataRef.current[i] || 0.03;
        const y = centerY + intensity * maxBarHeight * 1.5; // 提高波形幅度

        if (i === 0) {
          canvasCtx.moveTo(x, y);
        } else {
          const prevX = ((i - 1) / (dataPoints - 1)) * width;
          const prevIntensity = waveformDataRef.current[i - 1] || 0.03;
          const prevY = centerY + prevIntensity * maxBarHeight * 1.5;
          const cpX = (prevX + x) / 2;
          const cpY = (prevY + y) / 2;
          canvasCtx.quadraticCurveTo(cpX, cpY, x, y);
        }
      }

      canvasCtx.lineTo(width, centerY);
      canvasCtx.lineTo(0, centerY);
      canvasCtx.closePath();
      canvasCtx.fillStyle = gradient;
      canvasCtx.fill();

      canvasCtx.beginPath();
      canvasCtx.moveTo(0, centerY);

      for (let i = 0; i < dataPoints; i++) {
        const x = (i / (dataPoints - 1)) * width;
        const intensity = waveformDataRef.current[i] || 0.03;
        const y = centerY - intensity * maxBarHeight * 1.5; // 提高波形幅度

        if (i === 0) {
          canvasCtx.moveTo(x, y);
        } else {
          const prevX = ((i - 1) / (dataPoints - 1)) * width;
          const prevIntensity = waveformDataRef.current[i - 1] || 0.03;
          const prevY = centerY - prevIntensity * maxBarHeight * 1.5;
          const cpX = (prevX + x) / 2;
          const cpY = (prevY + y) / 2;
          canvasCtx.quadraticCurveTo(cpX, cpY, x, y);
        }
      }

      canvasCtx.strokeStyle = 'rgba(59, 130, 246, 0.6)';
      canvasCtx.lineWidth = 1.5;
      canvasCtx.stroke();
    }
  }, []);
  const renderAudioGraphMobile = useCallback(
    (analyser: AnalyserNode, canvas: HTMLCanvasElement) => {
      const canvasCtx = canvas?.getContext('2d');
      if (!canvasCtx) return;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyser.getByteTimeDomainData(dataArray);

      // 处理设备像素比，确保清晰度
      const rect = canvas.getBoundingClientRect();
      const pixelRatio = window.devicePixelRatio || 1;

      canvas.width = rect.width * pixelRatio;
      canvas.height = rect.height * pixelRatio;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';

      canvasCtx.scale(pixelRatio, pixelRatio);

      // 关闭抗锯齿以获得清晰的像素级渲染
      canvasCtx.imageSmoothingEnabled = false;

      const width = rect.width;
      const height = rect.height;

      canvasCtx.clearRect(0, 0, width, height);

      const centerY = height / 2;
      const widthRatio = 0.8; // 条形总宽度占画布宽度的比例（80%）
      const totalUsedWidth = width * widthRatio;
      const barWidth = 4; // 每个条形的宽度
      const gap = 4; // 条形之间的间隙

      // 根据总宽度计算能容纳的条形数量
      const barCount = Math.floor((totalUsedWidth + gap) / (barWidth + gap));
      const actualTotalWidth = barCount * barWidth + (barCount - 1) * gap;
      const startX = (width - actualTotalWidth) / 2;

      // 音频数据处理 - 采用与PC端类似的采样频率控制
      const currentTime = Date.now();

      // 控制更新频率，降低到与PC端类似的速度（60ms间隔）
      if (currentTime - mobileLastUpdateTimeRef.current > 60) {
        const intensities: number[] = [];

        // 多次采样并平均，与PC端保持一致的算法
        const sampleCount = 5;

        for (let i = 0; i < barCount; i++) {
          let intensitySum = 0;

          for (let sample = 0; sample < sampleCount; sample++) {
            const startIndex =
              Math.floor((i * bufferLength) / barCount) +
              Math.floor((sample * bufferLength) / (barCount * sampleCount));
            const endIndex = Math.min(
              bufferLength - 1,
              startIndex + Math.floor(bufferLength / (barCount * sampleCount))
            );

            let maxVal = 0;
            for (let j = startIndex; j <= endIndex; j++) {
              maxVal = Math.max(maxVal, Math.abs(dataArray[j] - 128));
            }

            const sampleIntensity = maxVal > 1 ? (maxVal / 128) * 3.0 : 0.05; // 提高敏感度：阈值从2降到1，放大倍数从1.8提升到3.0
            intensitySum += sampleIntensity;
          }

          const avgIntensity = intensitySum / sampleCount;
          // 限制范围并增强，保持最小高度
          const normalizedIntensity = Math.max(0.1, Math.min(1.0, avgIntensity * 1.5)); // 进一步放大音频强度
          intensities.push(normalizedIntensity);
        }

        // 平滑处理 - 与PC端类似的平滑算法
        if (mobileWaveformDataRef.current.length !== barCount) {
          mobileWaveformDataRef.current = new Array(barCount).fill(0.1);
        }

        const smoothingFactor = 0.3; // 与PC端保持一致的平滑因子
        for (let i = 0; i < barCount; i++) {
          const smoothedIntensity =
            (mobileWaveformDataRef.current[i] || 0.1) * (1 - smoothingFactor) +
            intensities[i] * smoothingFactor;
          mobileWaveformDataRef.current[i] = smoothedIntensity;
        }

        mobileLastUpdateTimeRef.current = currentTime;
      }

      // 使用缓存的数据绘制
      const cachedIntensities = mobileWaveformDataRef.current;
      if (!cachedIntensities || cachedIntensities.length === 0) {
        return;
      }

      // 直接绘制动态药丸波形条，不要背景
      for (let i = 0; i < barCount; i++) {
        // 像素对齐，确保清晰渲染
        const x = Math.round(startX + i * (barWidth + gap));
        const intensity = cachedIntensities[i] || 0.1;

        // 设置最小高度和最大高度，药丸条更短
        const minBarHeight = height * 0.08;
        const maxBarHeight = height * 0.55; // 增加最大高度到55%，让波形更明显
        const barHeight = Math.round(minBarHeight + intensity * (maxBarHeight - minBarHeight));

        // 确保圆角半径不会超过宽度或高度的一半，并像素对齐
        const radius = Math.min(barWidth / 2, barHeight / 2);

        // 纯白色填充，完全不透明
        canvasCtx.fillStyle = '#FFFFFF';

        // 绘制完整的竖直药丸形状，坐标像素对齐
        canvasCtx.beginPath();
        canvasCtx.roundRect(
          x,
          Math.round(centerY - barHeight),
          barWidth,
          Math.round(barHeight * 2),
          radius
        );
        canvasCtx.fill();
      }
    },
    []
  );

  const startSpeak = useCallback(
    async (onFinish: (text: string) => void) => {
      if (!navigator?.mediaDevices?.getUserMedia) {
        return toast({
          status: 'warning',
          title: t('common:speech_not_support')
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

      // 清空波形历史记录
      waveformDataRef.current = [];
      lastUpdateTimeRef.current = 0;
      mobileWaveformDataRef.current = [];
      mobileLastUpdateTimeRef.current = 0;

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

          // 清空波形历史记录
          waveformDataRef.current = [];
          lastUpdateTimeRef.current = 0;
          mobileWaveformDataRef.current = [];
          mobileLastUpdateTimeRef.current = 0;

          if (timeIntervalRef.current) {
            clearInterval(timeIntervalRef.current);
          }

          if (!cancelWhisperSignal.current) {
            const formData = new FormData();
            const { options, filename } = (() => {
              if (MediaRecorder.isTypeSupported('video/webm; codecs=vp9')) {
                return {
                  options: { mimeType: 'video/webm; codecs=vp9' },
                  filename: 'recording.webm'
                };
              }
              if (MediaRecorder.isTypeSupported('video/webm')) {
                return {
                  options: { type: 'video/webm' },
                  filename: 'recording.webm'
                };
              }
              if (MediaRecorder.isTypeSupported('audio/webm')) {
                return {
                  options: { mimeType: 'audio/webm' },
                  filename: 'recording.webm'
                };
              }
              if (MediaRecorder.isTypeSupported('audio/mp4')) {
                return {
                  options: { mimeType: 'audio/mp4' },
                  filename: 'recording.m4a'
                };
              }
              if (MediaRecorder.isTypeSupported('video/mp4')) {
                return {
                  options: { mimeType: 'video/mp4', videoBitsPerSecond: 100000 },
                  filename: 'recording.mp4'
                };
              }
              if (MediaRecorder.isTypeSupported('audio/mp3')) {
                return {
                  options: { mimeType: 'audio/mp3' },
                  filename: 'recording.mp3'
                };
              }
              // 默认回退选项
              return {
                options: { type: 'audio/webm' },
                filename: 'recording.webm'
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
                title: getErrText(error, t('common:speech_error_tip'))
              });
            }
            setIsTransCription(false);
          }
        };
        mediaRecorder.current.onerror = (e) => {
          if (timeIntervalRef.current) {
            clearInterval(timeIntervalRef.current);
          }
          // 清空波形历史记录
          waveformDataRef.current = [];
          lastUpdateTimeRef.current = 0;
          mobileWaveformDataRef.current = [];
          mobileLastUpdateTimeRef.current = 0;
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

    // 清空波形历史记录
    waveformDataRef.current = [];
    lastUpdateTimeRef.current = 0;
    mobileWaveformDataRef.current = [];
    mobileLastUpdateTimeRef.current = 0;

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
      // Note: mediaStream cleanup is handled in the mediaRecorder.current.onstop callback
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
