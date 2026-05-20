import React, { useEffect, useMemo, useRef } from 'react';
import { Box, type BoxProps, type SpinnerProps } from '@chakra-ui/react';

const config = {
  rotate: true,
  particleCount: 30,
  trailSpan: 0.38,
  durationMs: 3000,
  rotationDurationMs: 16000,
  pulseDurationMs: 4600,
  orbitRadius: 7,
  detailAmplitude: 2.7,
  petalCount: 5,
  curveScale: 3.9
};

const TWO_PI = Math.PI * 2;
const PETAL_K = Math.round(config.petalCount);
const particleSizeMap: Record<string, BoxProps['boxSize']> = {
  xs: '24px',
  sm: '32px',
  md: '48px',
  lg: '64px',
  xl: '80px'
};

const point = (progress: number, detailScale: number) => {
  const t = progress * TWO_PI;
  const r = config.orbitRadius - config.detailAmplitude * detailScale * Math.cos(PETAL_K * t);
  return {
    x: 50 + Math.cos(t) * r * config.curveScale,
    y: 50 + Math.sin(t) * r * config.curveScale
  };
};

const normalizeProgress = (progress: number) => ((progress % 1) + 1) % 1;

const getDetailScale = (time: number) => {
  const pulseProgress = (time % config.pulseDurationMs) / config.pulseDurationMs;
  const pulseAngle = pulseProgress * TWO_PI;
  return 0.52 + ((Math.sin(pulseAngle + 0.55) + 1) / 2) * 0.48;
};

const getRotation = (time: number) => {
  if (!config.rotate) return 0;
  return -((time % config.rotationDurationMs) / config.rotationDurationMs) * 360;
};

const getParticle = (index: number, progress: number, detailScale: number) => {
  const tailOffset = index / (config.particleCount - 1);
  const p = point(normalizeProgress(progress - tailOffset * config.trailSpan), detailScale);
  const fade = Math.pow(1 - tailOffset, 0.56);
  return {
    x: p.x,
    y: p.y,
    radius: 0.6 + fade * 3.57,
    opacity: 0.04 + fade * 0.96
  };
};

const getParticleSize = (size: SpinnerProps['size']) => {
  if (typeof size === 'string' && particleSizeMap[size]) {
    return particleSizeMap[size];
  }

  return size || particleSizeMap.lg;
};

const ParticleLoading = ({ size = 'lg' }: { size?: SpinnerProps['size'] }) => {
  const groupRef = useRef<SVGGElement>(null);
  const particleRefs = useRef<(SVGCircleElement | null)[]>([]);
  const boxSize = getParticleSize(size);

  const indices = useMemo(() => Array.from({ length: config.particleCount }, (_, i) => i), []);

  useEffect(() => {
    const startedAt = performance.now();
    let rafId = 0;

    const render = (now: number) => {
      const time = now - startedAt;
      const progress = (time % config.durationMs) / config.durationMs;
      const detailScale = getDetailScale(time);

      if (groupRef.current) {
        groupRef.current.setAttribute('transform', `rotate(${getRotation(time)} 50 50)`);
      }

      for (let i = 0; i < particleRefs.current.length; i++) {
        const node = particleRefs.current[i];
        if (!node) continue;

        const particle = getParticle(i, progress, detailScale);
        node.setAttribute('cx', particle.x.toFixed(2));
        node.setAttribute('cy', particle.y.toFixed(2));
        node.setAttribute('r', particle.radius.toFixed(2));
        node.setAttribute('opacity', particle.opacity.toFixed(3));
      }

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <Box boxSize={boxSize} position="relative" flexShrink={0} display="grid" placeItems="center">
      <Box
        as="svg"
        viewBox="8 8 84 84"
        fill="none"
        sx={{ width: '100%', height: '100%', overflow: 'visible' }}
        aria-hidden="true"
      >
        <g ref={groupRef}>
          {indices.map((i) => (
            <circle
              key={i}
              ref={(el) => {
                particleRefs.current[i] = el;
              }}
              fill="#3370FF"
            />
          ))}
        </g>
      </Box>
    </Box>
  );
};

export default React.memo(ParticleLoading);
