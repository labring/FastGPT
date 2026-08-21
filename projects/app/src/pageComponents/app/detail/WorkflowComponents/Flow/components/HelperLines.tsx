import { type THelperLine } from '@/web/core/workflow/type';
import {
  type CSSProperties,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from 'react';
import { useStore, useStoreApi } from 'reactflow';

const canvasStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  position: 'absolute',
  zIndex: 10,
  pointerEvents: 'none'
};

export type HelperLinesProps = {
  horizontal?: THelperLine;
  vertical?: THelperLine;
};

export type HelperLinesController = {
  draw: (lines: HelperLinesProps) => void;
  clear: () => void;
};

const HelperLinesRenderer = forwardRef<HelperLinesController>(function HelperLinesRenderer(_, ref) {
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  const storeApi = useStoreApi();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latestLinesRef = useRef<HelperLinesProps>({});
  const [devicePixelRatio, setDevicePixelRatio] = useState(() =>
    typeof window === 'undefined' ? 1 : window.devicePixelRatio
  );

  /** 使用 React Flow 最新视口直接绘制辅助线，不经过 React render。 */
  const renderLines = useCallback(
    ({ horizontal, vertical }: HelperLinesProps) => {
      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx) return;

      const transform = storeApi.getState().transform;
      const zoom = transform[2];
      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = '#D92D20';

      const drawCross = (x: number, y: number, size: number) => {
        ctx.beginPath();
        ctx.moveTo(x - size, y - size);
        ctx.lineTo(x + size, y + size);
        ctx.moveTo(x + size, y - size);
        ctx.lineTo(x - size, y + size);
        ctx.stroke();
      };

      if (vertical?.nodes.length) {
        const x = vertical.position * zoom + transform[0];
        ctx.beginPath();
        ctx.moveTo(x, Math.min(...vertical.nodes.map((node) => node.top)) * zoom + transform[1]);
        ctx.lineTo(x, Math.max(...vertical.nodes.map((node) => node.bottom)) * zoom + transform[1]);
        ctx.stroke();

        vertical.nodes.forEach((node) => {
          drawCross(x, node.top * zoom + transform[1], 5 * zoom);
          drawCross(x, node.bottom * zoom + transform[1], 5 * zoom);
        });
      }

      if (horizontal?.nodes.length) {
        const y = horizontal.position * zoom + transform[1];
        ctx.beginPath();
        ctx.moveTo(Math.min(...horizontal.nodes.map((node) => node.left)) * zoom + transform[0], y);
        ctx.lineTo(
          Math.max(...horizontal.nodes.map((node) => node.right)) * zoom + transform[0],
          y
        );
        ctx.stroke();

        horizontal.nodes.forEach((node) => {
          drawCross(node.left * zoom + transform[0], y, 5 * zoom);
          drawCross(node.right * zoom + transform[0], y, 5 * zoom);
        });
      }
    },
    [height, storeApi, width]
  );

  const clear = useCallback(() => {
    latestLinesRef.current = {};
    canvasRef.current?.getContext('2d')?.clearRect(0, 0, width, height);
  }, [height, width]);

  useImperativeHandle(
    ref,
    () => ({
      draw: (lines) => {
        latestLinesRef.current = lines;
        renderLines(lines);
      },
      clear
    }),
    [clear, renderLines]
  );

  // 浏览器缩放或跨屏幕移动时同步 DPR，保证 Canvas 清晰度和尺寸正确。
  useEffect(() => {
    const updateDevicePixelRatio = () => setDevicePixelRatio(window.devicePixelRatio);
    window.addEventListener('resize', updateDevicePixelRatio);

    return () => window.removeEventListener('resize', updateDevicePixelRatio);
  }, []);

  // 仅在容器尺寸或 DPR 变化时重建 Canvas 像素缓冲区。
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const canvasWidth = Math.round(width * devicePixelRatio);
    const canvasHeight = Math.round(height * devicePixelRatio);
    if (canvas.width !== canvasWidth) canvas.width = canvasWidth;
    if (canvas.height !== canvasHeight) canvas.height = canvasHeight;

    canvas.getContext('2d')?.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    renderLines(latestLinesRef.current);
  }, [width, height, devicePixelRatio, renderLines]);

  return <canvas ref={canvasRef} style={canvasStyle} />;
});

export default HelperLinesRenderer;
