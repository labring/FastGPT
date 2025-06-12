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

  // Add waveform data caching and animation control
  const waveformDataRef = useRef<number[]>([]);
  const lastUpdateTimeRef = useRef(0);

  // Mobile waveform data cache
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

    // Waveform parameters
    const centerY = height / 2;
    const dataPoints = 300;
    const maxBarHeight = height * 0.35;

    // More sensitive audio data processing - multiple sampling and averaging
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

      const sampleIntensity = maxVal > 2 ? (maxVal / 128) * 2.5 : 0.03; // Increase sensitivity: threshold reduced from 5 to 2, amplification factor increased from 1.5 to 2.5
      intensitySum += sampleIntensity;
    }

    const currentIntensity = intensitySum / sampleCount;

    const currentTime = Date.now();
    if (currentTime - lastUpdateTimeRef.current > 16) {
      if (waveformDataRef.current.length !== dataPoints) {
        waveformDataRef.current = new Array(dataPoints).fill(0.03);
      }

      const smoothingFactor = 0.4; // Improve response speed: increased from 0.3 to 0.4
      const smoothedIntensity =
        (waveformDataRef.current[dataPoints - 1] || 0.03) * (1 - smoothingFactor) +
        currentIntensity * smoothingFactor;

      waveformDataRef.current.shift(); // Remove leftmost data
      waveformDataRef.current.push(smoothedIntensity); // Add new data on the right

      lastUpdateTimeRef.current = currentTime;
    }

    // Draw smooth waveform curves
    if (waveformDataRef.current.length > 0) {
      // Create gradient effect
      const gradient = canvasCtx.createLinearGradient(
        0,
        centerY - maxBarHeight,
        0,
        centerY + maxBarHeight
      );
      gradient.addColorStop(0, 'rgba(59, 130, 246, 0.8)'); // Blue, more transparent
      gradient.addColorStop(0.5, 'rgba(59, 130, 246, 0.4)');
      gradient.addColorStop(1, 'rgba(59, 130, 246, 0.1)');

      // Draw upper half waveform curve
      canvasCtx.beginPath();
      canvasCtx.moveTo(0, centerY);

      for (let i = 0; i < dataPoints; i++) {
        const x = (i / (dataPoints - 1)) * width;
        const intensity = waveformDataRef.current[i] || 0.03;
        const y = centerY - intensity * maxBarHeight * 1.5; // Increase waveform amplitude

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
        const y = centerY + intensity * maxBarHeight * 1.5; // Increase waveform amplitude

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
        const y = centerY - intensity * maxBarHeight * 1.5; // Increase waveform amplitude

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

      // Handle device pixel ratio for clarity
      const rect = canvas.getBoundingClientRect();
      const pixelRatio = window.devicePixelRatio || 1;

      canvas.width = rect.width * pixelRatio;
      canvas.height = rect.height * pixelRatio;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';

      canvasCtx.scale(pixelRatio, pixelRatio);

      // Disable anti-aliasing for crisp pixel-level rendering
      canvasCtx.imageSmoothingEnabled = false;

      const width = rect.width;
      const height = rect.height;

      canvasCtx.clearRect(0, 0, width, height);

      const centerY = height / 2;
      const widthRatio = 0.8; // Total bar width ratio to canvas width (80%)
      const totalUsedWidth = width * widthRatio;
      const barWidth = 4; // Width of each bar
      const gap = 4; // Gap between bars

      // Calculate the number of bars that can fit based on total width
      const barCount = Math.floor((totalUsedWidth + gap) / (barWidth + gap));
      const actualTotalWidth = barCount * barWidth + (barCount - 1) * gap;
      const startX = (width - actualTotalWidth) / 2;

      // Audio data processing - use similar sampling frequency control as PC
      const currentTime = Date.now();

      // Control update frequency, reduce to similar speed as PC (60ms interval)
      if (currentTime - mobileLastUpdateTimeRef.current > 45) {
        const intensities: number[] = [];

        // Multiple sampling and averaging, consistent algorithm with PC
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

            const sampleIntensity = maxVal > 1 ? (maxVal / 128) * 3.0 : 0.05; // Increase sensitivity: threshold reduced from 2 to 1, amplification factor increased from 1.8 to 3.0
            intensitySum += sampleIntensity;
          }

          const avgIntensity = intensitySum / sampleCount;
          // Limit range and enhance, maintain minimum height
          const normalizedIntensity = Math.max(0.1, Math.min(1.0, avgIntensity * 1.5)); // Further amplify audio intensity
          intensities.push(normalizedIntensity);
        }

        // Smoothing processing - similar smoothing algorithm as PC
        if (mobileWaveformDataRef.current.length !== barCount) {
          mobileWaveformDataRef.current = new Array(barCount).fill(0.1);
        }

        const smoothingFactor = 0.3; // 与PC保持一致的平滑系数
        for (let i = 0; i < barCount; i++) {
          const smoothedIntensity =
            (mobileWaveformDataRef.current[i] || 0.1) * (1 - smoothingFactor) +
            intensities[i] * smoothingFactor;
          mobileWaveformDataRef.current[i] = smoothedIntensity;
        }

        mobileLastUpdateTimeRef.current = currentTime;
      }

      // Use cached data for rendering
      const cachedIntensities = mobileWaveformDataRef.current;
      if (!cachedIntensities || cachedIntensities.length === 0) {
        return;
      }

      // Directly draw dynamic pill-shaped waveform bars, no background
      for (let i = 0; i < barCount; i++) {
        // Pixel alignment to ensure crisp rendering
        const x = Math.round(startX + i * (barWidth + gap));
        const intensity = cachedIntensities[i] || 0.1;

        // Set minimum and maximum height, pill bars are shorter
        const minBarHeight = height * 0.08;
        const maxBarHeight = height * 0.4; // Increase maximum height to 55%, make waveform more visible
        const barHeight = Math.round(minBarHeight + intensity * (maxBarHeight - minBarHeight));

        // Ensure border radius doesn't exceed half of width or height, and pixel aligned
        const radius = Math.min(barWidth / 2, barHeight / 2);

        // Pure white fill, completely opaque
        canvasCtx.fillStyle = '#FFFFFF';

        // Draw complete vertical pill shape, coordinates pixel aligned
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

      // Clear waveform history records
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

          // Clear waveform history records
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
              // Default fallback option
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
          // Clear waveform history records
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

    // Clear waveform history records
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
