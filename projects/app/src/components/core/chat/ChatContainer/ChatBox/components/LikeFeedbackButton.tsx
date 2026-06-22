import React, { useCallback, useEffect, useRef } from 'react';
import { Box, type BoxProps, type IconProps } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import styles from '../index.module.scss';

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  life: number;
  size: number;
  rotation: number;
  vr: number;
  color: string;
};

type LikeFeedbackButtonProps = Pick<BoxProps, 'cursor' | 'onClick'> &
  Pick<IconProps, 'w' | 'h' | 'boxSize' | 'p'> & {
    isActive: boolean;
    effectTrigger?: number;
  };

const blueColors = ['#3370ff', '#4f82ff', '#7ca3ff'];
const accentColor = '#efdefd';

const getParticles = (x: number, y: number): Particle[] =>
  Array.from({ length: 10 }, (_, index) => {
    const spread = -Math.PI * 0.72 + Math.PI * 0.44 * (index / 9);
    const speed = 2 + Math.random() * 2.4;

    return {
      x,
      y,
      vx: Math.cos(spread) * speed,
      vy: Math.sin(spread) * speed,
      gravity: 0.09 + Math.random() * 0.03,
      life: 26 + Math.random() * 8,
      size: 3 + Math.random() * 3,
      rotation: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.14,
      color:
        Math.random() < 0.28
          ? accentColor
          : blueColors[Math.floor(Math.random() * blueColors.length)]
    };
  });

/**
 * 渲染点赞按钮的局部成功反馈。
 *
 * hover、图标弹跳和 canvas 粒子参数都对齐 prototype，只有新的 effectTrigger 会播放撒花。
 */
const LikeFeedbackButton = ({
  isActive,
  effectTrigger,
  cursor,
  onClick,
  w,
  h,
  boxSize,
  p
}: LikeFeedbackButtonProps) => {
  const buttonRef = useRef<HTMLSpanElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number>();
  const playedTriggerRef = useRef<number>();

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');

    if (!canvas || !ctx) return;

    const ratio = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * ratio;
    canvas.height = window.innerHeight * ratio;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }, []);

  const removeCanvas = useCallback(() => {
    canvasRef.current?.remove();
    canvasRef.current = null;
  }, []);

  const stopAnimation = useCallback(() => {
    if (rafRef.current) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = undefined;
    }

    particlesRef.current = [];

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    ctx?.clearRect(0, 0, window.innerWidth, window.innerHeight);
    removeCanvas();
  }, [removeCanvas]);

  const createCanvas = useCallback(() => {
    if (typeof document === 'undefined') return null;

    removeCanvas();

    const canvas = document.createElement('canvas');
    canvas.className = styles.likeFeedbackCanvas;
    document.body.appendChild(canvas);
    canvasRef.current = canvas;

    return canvas;
  }, [removeCanvas]);

  useEffect(() => {
    if (!effectTrigger) {
      stopAnimation();
      return;
    }

    if (playedTriggerRef.current === effectTrigger) return;

    playedTriggerRef.current = effectTrigger;
    stopAnimation();

    const button = buttonRef.current;
    if (!button) return;

    const canvas = createCanvas();
    if (!canvas) return;

    resizeCanvas();

    const ctx = canvas?.getContext('2d');

    if (!canvas || !ctx) {
      stopAnimation();
      return;
    }

    const rect = button.getBoundingClientRect();
    particlesRef.current = getParticles(rect.left + rect.width / 2, rect.top + rect.height / 2 - 2);

    const animate = () => {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      particlesRef.current = particlesRef.current.filter((particle) => particle.life > 0);

      for (const particle of particlesRef.current) {
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.vy += particle.gravity;
        particle.life -= 1;
        particle.rotation += particle.vr;

        ctx.save();
        ctx.translate(particle.x, particle.y);
        ctx.rotate(particle.rotation);
        ctx.globalAlpha = Math.max(particle.life / 45, 0);
        ctx.fillStyle = particle.color;
        ctx.fillRect(-particle.size / 2, -particle.size / 3, particle.size, particle.size * 0.66);
        ctx.restore();
      }

      if (particlesRef.current.length > 0) {
        rafRef.current = window.requestAnimationFrame(animate);
      } else {
        rafRef.current = undefined;
        removeCanvas();
      }
    };

    animate();

    window.addEventListener('resize', resizeCanvas);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      stopAnimation();
    };
  }, [createCanvas, effectTrigger, removeCanvas, resizeCanvas, stopAnimation]);

  useEffect(() => stopAnimation, [stopAnimation]);

  return (
    <Box
      as="span"
      ref={buttonRef}
      display="inline-flex"
      position="relative"
      w="24px"
      h="24px"
      alignItems="center"
      justifyContent="center"
      overflow="visible"
      cursor={cursor ?? 'pointer'}
      color={isActive ? 'primary.600' : 'myGray.400'}
      filter={isActive ? 'drop-shadow(0 6px 12px rgba(51, 112, 255, 0.18))' : undefined}
      transition="color 180ms ease, transform 180ms ease, filter 180ms ease"
      _hover={{
        color: 'primary.600',
        transform: 'translateY(-1px)'
      }}
      onClick={onClick}
    >
      <MyIcon
        key={effectTrigger || 'idle'}
        w={w}
        h={h}
        boxSize={boxSize}
        p={p}
        cursor={undefined}
        color="currentColor"
        _hover={undefined}
        className={effectTrigger ? styles.likeFeedbackIconPop : undefined}
        name="core/chat/feedback/goodLight"
      />
    </Box>
  );
};

export default React.memo(LikeFeedbackButton);
