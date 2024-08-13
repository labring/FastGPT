import { THelperLine } from '@fastgpt/global/core/workflow/type';
import { CSSProperties, useEffect, useRef } from 'react';
import { ReactFlowState, useStore, useViewport } from 'reactflow';

const canvasStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  position: 'absolute',
  zIndex: 10,
  pointerEvents: 'none'
};

const storeSelector = (state: ReactFlowState) => ({
  width: state.width,
  height: state.height,
  transform: state.transform
});

export type HelperLinesProps = {
  horizontal?: THelperLine;
  vertical?: THelperLine;
};

function HelperLinesRenderer({ horizontal, vertical }: HelperLinesProps) {
  const { width, height, transform } = useStore(storeSelector);
  const { zoom } = useViewport();

  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');

    if (!ctx || !canvas) {
      return;
    }

    const dpi = window.devicePixelRatio;
    canvas.width = width * dpi;
    canvas.height = height * dpi;

    ctx.scale(dpi, dpi);
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

    if (vertical) {
      const x = vertical.position * transform[2] + transform[0];
      ctx.beginPath();
      ctx.moveTo(
        x,
        Math.min(...vertical.nodes.map((node) => node.top)) * transform[2] + transform[1]
      );
      ctx.lineTo(
        x,
        Math.max(...vertical.nodes.map((node) => node.bottom)) * transform[2] + transform[1]
      );
      ctx.stroke();

      vertical.nodes.forEach((node) => {
        drawCross(x, node.top * transform[2] + transform[1], 5 * zoom);
        drawCross(x, node.bottom * transform[2] + transform[1], 5 * zoom);
      });
    }

    if (horizontal) {
      const y = horizontal.position * transform[2] + transform[1];
      ctx.beginPath();
      ctx.moveTo(
        Math.min(...horizontal.nodes.map((node) => node.left)) * transform[2] + transform[0],
        y
      );
      ctx.lineTo(
        Math.max(...horizontal.nodes.map((node) => node.right)) * transform[2] + transform[0],
        y
      );
      ctx.stroke();

      horizontal.nodes.forEach((node) => {
        drawCross(node.left * transform[2] + transform[0], y, 5 * zoom);
        drawCross(node.right * transform[2] + transform[0], y, 5 * zoom);
      });
    }
  }, [width, height, transform, horizontal, vertical, zoom]);

  return <canvas ref={canvasRef} style={canvasStyle} />;
}

export default HelperLinesRenderer;
