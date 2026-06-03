import React, { useRef, useEffect } from 'react';

const RandomGridBackground = React.memo(() => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId = 0;
    let width = 0;
    let height = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      width = rect.width;
      height = rect.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
    };

    resize();
    window.addEventListener('resize', resize);

    const spacing = 16;
    const dotsMap = new Map<
      string,
      {
        visible: boolean;
        baseOpacity: number;
        speed: number;
        phase: number;
      }
    >();

    const getDotState = (c: number, r: number) => {
      const key = `${c},${r}`;
      if (!dotsMap.has(key)) {
        // 55% 的网格点可见，45% 的点隐藏以形成随机散布的稀疏效果
        const visible = Math.random() < 0.55;
        // 随机基础亮度
        const baseOpacity = 0.08 + Math.random() * 0.22;
        // 调快随机呼吸闪烁频率
        const speed = 0.035 + Math.random() * 0.045;
        const phase = Math.random() * Math.PI * 2;
        dotsMap.set(key, { visible, baseOpacity, speed, phase });
      }
      return dotsMap.get(key)!;
    };

    let dy = 0;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // 向下快速流动
      dy += 0.22;

      const offsetR = Math.floor(dy / spacing);
      const moveY = dy % spacing;

      const cols = Math.ceil(width / spacing) + 2;
      const rows = Math.ceil(height / spacing) + 2;

      for (let c = -1; c < cols; c++) {
        for (let r = -1; r < rows; r++) {
          const logicalC = c;
          const logicalR = r - offsetR;
          const state = getDotState(logicalC, logicalR);

          if (!state.visible) continue;

          // 更新闪烁呼吸状态
          state.phase += state.speed;
          const currentOpacity = state.baseOpacity * (0.4 + 0.6 * Math.sin(state.phase));

          const x = c * spacing;
          const y = r * spacing + moveY;

          if (x >= -2 && x <= width + 2 && y >= -2 && y <= height + 2) {
            ctx.beginPath();
            ctx.arc(x, y, 1.5, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(37, 99, 235, ${currentOpacity.toFixed(3)})`;
            ctx.fill();
          }
        }
      }

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none'
      }}
    />
  );
});
RandomGridBackground.displayName = 'RandomGridBackground';

export default RandomGridBackground;
