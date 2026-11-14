import React, { useEffect, useRef, useState } from 'react';
import { Box, Flex, Icon, IconButton, Image, ModalBody, Spinner, Text } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import type {
  PuzzleCaptchaChallenge,
  PuzzleCaptchaTrackPoint
} from '@fastgpt/global/support/user/account/captcha/type';
import type { CaptchaVerificationPurpose } from '@fastgpt/global/support/user/account/verification/type';
import { verifyPuzzleCaptcha } from '@/web/support/user/api';

/**
 * 圆形图片转正交互：滑块从 0 到 360 度，鼠标、触摸与键盘使用相同的服务端角度校验。
 * 前两次失败保留图片，第三次失败或后续业务失败重新取题；次数以服务端响应为准。
 */
const PuzzleCaptchaModal = ({
  purpose,
  getCaptcha,
  onVerified,
  onClose
}: {
  purpose: CaptchaVerificationPurpose;
  getCaptcha: () => Promise<PuzzleCaptchaChallenge>;
  onVerified: (captcha: string) => Promise<void>;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const [challenge, setChallenge] = useState<PuzzleCaptchaChallenge>();
  const [x, setX] = useState(0);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('');
  const [expired, setExpired] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [passed, setPassed] = useState(false);
  const mounted = useRef(true);
  const requestVersion = useRef(0);
  const submitting = useRef(false);
  const value = useRef(0);
  const track = useRef<PuzzleCaptchaTrackPoint[]>([]);
  const startedAt = useRef(0);
  const pointerY = useRef(0);
  const startY = useRef(0);
  const generation = useRef(0);

  /** 刷新时立即禁用旧题；只接受最新请求结果，关闭弹窗后忽略异步回调。 */
  const refresh = async () => {
    const version = ++requestVersion.current;
    generation.current += 1;
    setChallenge(undefined);
    setX(0);
    value.current = 0;
    track.current = [];
    setExpired(false);
    setPassed(false);
    setDragging(false);
    setBusy(true);
    try {
      const result = await getCaptcha();
      if (mounted.current && version === requestVersion.current) setChallenge(result);
    } catch {
      if (mounted.current) setMessage(t('common:puzzle_captcha_load_failed'));
    } finally {
      if (mounted.current && version === requestVersion.current) setBusy(false);
    }
  };

  useEffect(() => {
    mounted.current = true;
    // 延迟到下个任务启动首次请求，StrictMode 的卸载重挂载可以取消尚未启动的重复请求。
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => {
      window.clearTimeout(timer);
      mounted.current = false;
      requestVersion.current += 1;
    };
    // 调用方的适配器可能每次渲染重新创建，弹窗只在首次打开时自动取题。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!challenge) return;
    const timeout = window.setTimeout(
      () => {
        setExpired(true);
        setMessage(t('common:puzzle_captcha_expired'));
      },
      Math.max(0, new Date(challenge.expiresAt).getTime() - Date.now())
    );
    return () => window.clearTimeout(timeout);
  }, [challenge, t]);

  const begin = (y = 0) => {
    if (busy || expired || !challenge || submitting.current) return;
    value.current = 0;
    setX(0);
    setMessage('');
    setDragging(true);
    startY.current = y;
    pointerY.current = y;
    startedAt.current = performance.now();
    track.current = [{ x: 0, y: 0, t: 0 }];
  };

  const record = (next: number) => {
    if (!track.current.length) return;
    value.current = next;
    setX(next);
    const point = {
      x: next,
      y: pointerY.current - startY.current,
      t: Math.round(performance.now() - startedAt.current)
    };
    // 有界采样，长时间拖动时保留起点并均匀压缩中间轨迹。
    if (track.current.length >= 240) {
      track.current = track.current.filter((_, index) => index === 0 || index % 2 === 1);
    }
    track.current.push(point);
  };

  const submit = async () => {
    if (!challenge || expired || busy || submitting.current || track.current.length === 0) return;
    submitting.current = true;
    setDragging(false);
    setBusy(true);
    const currentGeneration = generation.current;
    record(value.current);
    try {
      const result = await verifyPuzzleCaptcha({
        purpose,
        challengeId: challenge.challengeId,
        angle: value.current,
        track: track.current
      });
      if (!mounted.current || currentGeneration !== generation.current) return;
      if (result.status === 'retry') {
        track.current = [];
        value.current = 0;
        setX(0);
        setMessage(t('common:puzzle_captcha_retry_remaining', { count: result.remainingAttempts }));
        return;
      }
      if (result.status === 'refreshRequired') {
        setMessage(t('common:puzzle_captcha_refreshed'));
        await refresh();
        return;
      }
      setPassed(true);
      setMessage(t('common:puzzle_captcha_passed'));
      await onVerified(result.captcha);
    } catch {
      if (mounted.current) {
        setMessage(t('common:puzzle_captcha_retry'));
        await refresh();
      }
    } finally {
      submitting.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const max = 360;

  const progress = max > 0 ? (x / max) * 100 : 0;
  const thumbWidth = 72;

  return (
    <MyModal
      isOpen
      isCentered
      onClose={busy ? undefined : onClose}
      showCloseButton={false}
      closeOnOverlayClick={!busy}
      w="380px"
      minW={0}
      maxW="calc(100vw - 40px)"
      borderRadius="16px"
      overflow="hidden"
      boxShadow="0 20px 80px rgba(16, 24, 40, 0.16)"
    >
      <ModalBody p="20px" pb="22px">
        <Flex align="flex-start" justify="space-between" gap={2} mb="20px">
          <Box pt="3px">
            <Text fontSize="13px" lineHeight="20px" color="myGray.400">
              {t('common:puzzle_captcha_title')}
            </Text>
            <Text mt="5px" fontSize="18px" lineHeight="27px" fontWeight={600} color="myGray.900">
              {t('common:puzzle_captcha_hint')}
            </Text>
          </Box>
          <IconButton
            aria-label={t('common:Cancel')}
            icon={
              <Icon viewBox="0 0 24 24" boxSize="23px">
                <path
                  d="m5 5 14 14M19 5 5 19"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </Icon>
            }
            variant="ghost"
            color="myGray.400"
            _hover={{ bg: 'myGray.50', color: 'myGray.700' }}
            minW="30px"
            h="30px"
            mr="-5px"
            isDisabled={busy}
            onClick={onClose}
          />
        </Flex>
        <Flex
          position="relative"
          w="100%"
          h="240px"
          align="center"
          justify="center"
          aria-busy={busy}
          userSelect="none"
        >
          <Box
            position="relative"
            w="224px"
            maxW="100%"
            aspectRatio="1"
            borderRadius="full"
            bg="#F4F2ED"
            overflow="hidden"
          >
            {challenge ? (
              <>
                <Image
                  src={challenge.captchaImage}
                  alt=""
                  w="100%"
                  h="100%"
                  draggable={false}
                  pointerEvents="none"
                  transform={`rotate(${x}deg)`}
                  style={{ willChange: dragging ? 'transform' : undefined }}
                />
                {expired && <Box position="absolute" inset={0} bg="blackAlpha.500" />}
              </>
            ) : (
              <Flex position="absolute" inset={0} align="center" justify="center">
                {busy && <Spinner size="sm" color="#5D54FF" />}
              </Flex>
            )}
          </Box>
          <IconButton
            aria-label={t('common:puzzle_captcha_refresh')}
            title={t('common:puzzle_captcha_refresh')}
            icon={
              <Icon viewBox="0 0 24 24" boxSize="18px">
                <path
                  d="M20 7v5h-5M4 17v-5h5M6.1 7a7 7 0 0 1 11.55-1.6L20 8M4 16l2.35 2.6A7 7 0 0 0 17.9 17"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Icon>
            }
            position="absolute"
            right="0"
            bottom="0"
            minW="32px"
            h="32px"
            borderRadius="full"
            color="myGray.500"
            bg="myGray.50"
            _hover={{ bg: 'myGray.100', color: 'myGray.800' }}
            isDisabled={busy}
            onClick={() => {
              setMessage('');
              void refresh();
            }}
          />
        </Flex>
        <Box position="relative" h="44px" mt="23px" role="group">
          <Box
            position="absolute"
            left={0}
            right={0}
            top="14px"
            h="16px"
            borderRadius="full"
            bg="#F0F0F2"
            overflow="hidden"
          >
            <Box
              h="100%"
              w={`calc(${progress}% + ${thumbWidth * (1 - progress / 100)}px)`}
              bg={passed ? '#D2F1E1' : '#E5E2FF'}
              opacity={x > 0 || passed ? 1 : 0}
            />
          </Box>
          <Flex
            pointerEvents="none"
            position="absolute"
            left={`calc(${progress}% - ${(progress / 100) * thumbWidth}px)`}
            top="3px"
            w={`${thumbWidth}px`}
            h="38px"
            align="center"
            justify="center"
            gap="5px"
            bg={passed ? '#24A36A' : '#5D54FF'}
            borderRadius="full"
            boxShadow={
              dragging ? '0 4px 12px rgba(93,84,255,.28)' : '0 2px 5px rgba(93,84,255,.12)'
            }
            opacity={expired || !challenge ? 0.45 : 1}
            transition="background-color .15s, box-shadow .15s"
            sx={{ '@media (prefers-reduced-motion: reduce)': { transition: 'none' } }}
          >
            {busy && challenge ? (
              <Spinner size="xs" color="white" />
            ) : passed ? (
              <Icon viewBox="0 0 24 24" boxSize="22px" color="white">
                <path
                  d="m5 12 4 4L19 6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Icon>
            ) : (
              [0, 1, 2].map((line) => (
                <Box key={line} w="2px" h="17px" borderRadius="full" bg="white" />
              ))
            )}
          </Flex>
          <Box
            as="input"
            type="range"
            aria-label={t('common:puzzle_captcha_slider')}
            aria-describedby="puzzle-captcha-keyboard"
            aria-valuetext={`${Math.round(x)}°`}
            min={0}
            max={max}
            step={1}
            value={x}
            disabled={busy || expired || !challenge}
            position="absolute"
            inset={0}
            w="100%"
            h="44px"
            m={0}
            p={0}
            border={0}
            bg="transparent"
            cursor={dragging ? 'grabbing' : 'grab'}
            style={{ touchAction: 'none' }}
            sx={{
              appearance: 'none',
              '&::-webkit-slider-runnable-track': { height: '44px', background: 'transparent' },
              '&::-moz-range-track': { height: '44px', background: 'transparent' },
              '&::-webkit-slider-thumb': {
                appearance: 'none',
                width: `${thumbWidth}px`,
                height: '44px',
                background: 'transparent',
                border: 0
              },
              '&::-moz-range-thumb': {
                width: `${thumbWidth}px`,
                height: '44px',
                background: 'transparent',
                border: 0
              },
              '&:focus-visible': {
                outline: '2px solid #A8A2FF',
                outlineOffset: '4px',
                borderRadius: '999px'
              },
              '&:disabled': { cursor: 'not-allowed' }
            }}
            onPointerDown={(event: React.PointerEvent<HTMLInputElement>) => {
              begin(event.clientY);
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event: React.PointerEvent<HTMLInputElement>) => {
              pointerY.current = event.clientY;
            }}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              record(Number(event.target.value))
            }
            onPointerUp={() => void submit()}
            onPointerCancel={() => {
              track.current = [];
              setX(0);
              value.current = 0;
              setDragging(false);
            }}
            onBlur={() => setDragging(false)}
            onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
              event.stopPropagation();
              if (
                ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(
                  event.key
                ) &&
                !track.current.length
              )
                begin();
              if (event.key === 'Enter') {
                event.preventDefault();
                void submit();
              }
            }}
          />
          <Text
            id="puzzle-captcha-keyboard"
            position="absolute"
            top="calc(100% + 5px)"
            w="100%"
            fontSize="10px"
            textAlign="center"
            color="myGray.500"
            opacity={0}
            pointerEvents="none"
            _groupFocusWithin={{ opacity: message ? 0 : 1 }}
          >
            {t('common:puzzle_captcha_keyboard')}
          </Text>
        </Box>
        <Text
          role="status"
          aria-live="polite"
          fontSize="11px"
          lineHeight="16px"
          textAlign="center"
          color={passed ? 'green.600' : 'red.500'}
          mt={message ? '8px' : 0}
        >
          {message}
        </Text>
      </ModalBody>
    </MyModal>
  );
};

export default PuzzleCaptchaModal;
