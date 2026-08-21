import React, { useEffect, useRef, useCallback, useState } from 'react';
import {
  Box,
  Flex,
  IconButton,
  Modal,
  ModalContent,
  ModalOverlay,
  Text,
  useDisclosure
} from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';

const punctuationMap: Record<string, string> = {
  '，': ',',
  '；': ';',
  '。': '.',
  '：': ':',
  '！': '!',
  '？': '?',
  '“': '"',
  '”': '"',
  '‘': "'",
  '’': "'",
  '【': '[',
  '】': ']',
  '（': '(',
  '）': ')',
  '《': '<',
  '》': '>',
  '、': ','
};

type MermaidPreview = {
  key: string;
  markup: string;
  width: number;
  height: number;
};

type MermaidViewportTransform = {
  x: number;
  y: number;
  scale: number;
};

type MermaidCanvasProps = {
  preview?: MermaidPreview;
  visible: boolean;
  onClose: () => void;
  onExport: () => void;
  closeOnOverlayClick?: boolean;
};

const MERMAID_MIN_SCALE = 0.2;
const MERMAID_MAX_SCALE = 5;
const MERMAID_VIEWPORT_PADDING = 48;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const getFitScale = ({
  viewportWidth,
  viewportHeight,
  contentWidth,
  contentHeight
}: {
  viewportWidth: number;
  viewportHeight: number;
  contentWidth: number;
  contentHeight: number;
}) =>
  Math.min(
    1,
    Math.max(viewportWidth - MERMAID_VIEWPORT_PADDING * 2, 1) / contentWidth,
    Math.max(viewportHeight - MERMAID_VIEWPORT_PADDING * 2, 1) / contentHeight
  );

const getMinimumScale = ({
  viewportWidth,
  viewportHeight,
  contentWidth,
  contentHeight
}: {
  viewportWidth: number;
  viewportHeight: number;
  contentWidth: number;
  contentHeight: number;
}) =>
  Math.min(
    MERMAID_MIN_SCALE,
    getFitScale({
      viewportWidth,
      viewportHeight,
      contentWidth,
      contentHeight
    })
  );

const clampTransform = ({
  transform,
  viewportWidth,
  viewportHeight,
  contentWidth,
  contentHeight
}: {
  transform: MermaidViewportTransform;
  viewportWidth: number;
  viewportHeight: number;
  contentWidth: number;
  contentHeight: number;
}): MermaidViewportTransform => {
  const scaledWidth = contentWidth * transform.scale;
  const scaledHeight = contentHeight * transform.scale;
  const x =
    scaledWidth + MERMAID_VIEWPORT_PADDING * 2 <= viewportWidth
      ? (viewportWidth - scaledWidth) / 2
      : clamp(
          transform.x,
          viewportWidth - scaledWidth - MERMAID_VIEWPORT_PADDING,
          MERMAID_VIEWPORT_PADDING
        );
  const y =
    scaledHeight + MERMAID_VIEWPORT_PADDING * 2 <= viewportHeight
      ? (viewportHeight - scaledHeight) / 2
      : clamp(
          transform.y,
          viewportHeight - scaledHeight - MERMAID_VIEWPORT_PADDING,
          MERMAID_VIEWPORT_PADDING
        );

  return { ...transform, x, y };
};

const getPointerDistance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Mermaid 放大预览画布：统一处理适配、缩放、拖拽和触控板/双指手势，避免使用图片查看器时丢失 SVG 的可交互性。
 */
const MermaidCanvas = ({
  preview,
  visible,
  onClose,
  onExport,
  closeOnOverlayClick = false
}: MermaidCanvasProps) => {
  const { t } = useTranslation();
  const viewportRef = useRef<HTMLDivElement>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const gestureRef = useRef<
    | {
        mode: 'pan';
        startPoint: { x: number; y: number };
        startTransform: MermaidViewportTransform;
      }
    | {
        mode: 'pinch';
        startDistance: number;
        startMidpoint: { x: number; y: number };
        startTransform: MermaidViewportTransform;
      }
  >();
  const [transform, setTransform] = useState<MermaidViewportTransform>({ x: 0, y: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);

  const getViewportTransform = useCallback(
    (nextTransform: MermaidViewportTransform) => {
      const viewport = viewportRef.current;
      if (!viewport || !preview) return nextTransform;

      return clampTransform({
        transform: nextTransform,
        viewportWidth: viewport.clientWidth,
        viewportHeight: viewport.clientHeight,
        contentWidth: preview.width,
        contentHeight: preview.height
      });
    },
    [preview]
  );

  const resetView = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport || !preview || !viewport.clientWidth || !viewport.clientHeight) return;

    const scale = getFitScale({
      viewportWidth: viewport.clientWidth,
      viewportHeight: viewport.clientHeight,
      contentWidth: preview.width,
      contentHeight: preview.height
    });
    setTransform(
      getViewportTransform({
        scale,
        x: (viewport.clientWidth - preview.width * scale) / 2,
        y: (viewport.clientHeight - preview.height * scale) / 2
      })
    );
  }, [getViewportTransform, preview]);

  const setScaleAtPoint = useCallback(
    (nextScale: number, clientX: number, clientY: number) => {
      const viewport = viewportRef.current;
      if (!viewport) return;

      const rect = viewport.getBoundingClientRect();
      const point = { x: clientX - rect.left, y: clientY - rect.top };
      setTransform((current) => {
        const scale = clamp(
          nextScale,
          getMinimumScale({
            viewportWidth: viewport.clientWidth,
            viewportHeight: viewport.clientHeight,
            contentWidth: preview?.width ?? 1,
            contentHeight: preview?.height ?? 1
          }),
          MERMAID_MAX_SCALE
        );
        const contentPoint = {
          x: (point.x - current.x) / current.scale,
          y: (point.y - current.y) / current.scale
        };
        return getViewportTransform({
          scale,
          x: point.x - contentPoint.x * scale,
          y: point.y - contentPoint.y * scale
        });
      });
    },
    [getViewportTransform, preview]
  );

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      const nextScale = transform.scale * Math.exp(-event.deltaY * 0.0015);
      setScaleAtPoint(nextScale, event.clientX, event.clientY);
    },
    [setScaleAtPoint, transform.scale]
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 && event.button !== 1) return;

      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const pointers = [...pointersRef.current.values()];
      if (pointers.length >= 2) {
        const [first, second] = pointers;
        gestureRef.current = {
          mode: 'pinch',
          startDistance: getPointerDistance(first, second),
          startMidpoint: {
            x: (first.x + second.x) / 2,
            y: (first.y + second.y) / 2
          },
          startTransform: transform
        };
      } else {
        gestureRef.current = {
          mode: 'pan',
          startPoint: { x: event.clientX, y: event.clientY },
          startTransform: transform
        };
      }
      setIsDragging(true);
    },
    [transform]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!pointersRef.current.has(event.pointerId)) return;

      event.preventDefault();
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const pointers = [...pointersRef.current.values()];
      const gesture = gestureRef.current;
      if (!gesture) return;

      if (gesture.mode === 'pinch' && pointers.length >= 2) {
        const [first, second] = pointers;
        const distance = getPointerDistance(first, second);
        const midpoint = {
          x: (first.x + second.x) / 2,
          y: (first.y + second.y) / 2
        };
        const viewport = viewportRef.current;
        if (!viewport || !preview) return;
        const nextScale = clamp(
          gesture.startTransform.scale * (distance / Math.max(gesture.startDistance, 1)),
          getMinimumScale({
            viewportWidth: viewport.clientWidth,
            viewportHeight: viewport.clientHeight,
            contentWidth: preview.width,
            contentHeight: preview.height
          }),
          MERMAID_MAX_SCALE
        );
        const rect = viewport.getBoundingClientRect();
        const startPoint = {
          x: gesture.startMidpoint.x - rect.left,
          y: gesture.startMidpoint.y - rect.top
        };
        const contentPoint = {
          x: (startPoint.x - gesture.startTransform.x) / gesture.startTransform.scale,
          y: (startPoint.y - gesture.startTransform.y) / gesture.startTransform.scale
        };
        const currentPoint = { x: midpoint.x - rect.left, y: midpoint.y - rect.top };
        setTransform(
          getViewportTransform({
            scale: nextScale,
            x: currentPoint.x - contentPoint.x * nextScale,
            y: currentPoint.y - contentPoint.y * nextScale
          })
        );
        return;
      }

      if (gesture.mode === 'pan' && pointers.length === 1) {
        setTransform(
          getViewportTransform({
            ...gesture.startTransform,
            x: gesture.startTransform.x + event.clientX - gesture.startPoint.x,
            y: gesture.startTransform.y + event.clientY - gesture.startPoint.y
          })
        );
      }
    },
    [getViewportTransform, preview]
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      pointersRef.current.delete(event.pointerId);
      if (pointersRef.current.size === 0) {
        gestureRef.current = undefined;
        setIsDragging(false);
        return;
      }

      const remaining = [...pointersRef.current.values()][0];
      gestureRef.current = {
        mode: 'pan',
        startPoint: remaining,
        startTransform: transform
      };
    },
    [transform]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === '0' || event.key.toLowerCase() === 'f') {
        event.preventDefault();
        resetView();
      } else if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        const rect = viewportRef.current?.getBoundingClientRect();
        if (rect)
          setScaleAtPoint(
            transform.scale * 1.2,
            rect.left + rect.width / 2,
            rect.top + rect.height / 2
          );
      } else if (event.key === '-') {
        event.preventDefault();
        const rect = viewportRef.current?.getBoundingClientRect();
        if (rect)
          setScaleAtPoint(
            transform.scale / 1.2,
            rect.left + rect.width / 2,
            rect.top + rect.height / 2
          );
      }
    },
    [resetView, setScaleAtPoint, transform.scale]
  );

  useEffect(() => {
    if (!visible || !preview) return;
    const frame = window.requestAnimationFrame(resetView);
    viewportRef.current?.focus();
    return () => window.cancelAnimationFrame(frame);
  }, [preview, resetView, visible]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !preview || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      setTransform((current) => getViewportTransform(current));
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [getViewportTransform, preview]);

  if (!preview) return null;

  const zoomPercent = Math.round(transform.scale * 100);
  const changeScale = (ratio: number) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    setScaleAtPoint(
      transform.scale * ratio,
      rect.left + rect.width / 2,
      rect.top + rect.height / 2
    );
  };

  return (
    <Modal
      isOpen={visible}
      onClose={onClose}
      isCentered
      motionPreset={'none'}
      autoFocus={false}
      returnFocusOnClose={false}
      blockScrollOnMount
      closeOnOverlayClick={closeOnOverlayClick}
    >
      <ModalOverlay bg={'blackAlpha.700'} />
      <ModalContent
        m={{ base: 0, sm: 6 }}
        w={{ base: '100vw', sm: '92vw' }}
        h={{ base: '100vh', sm: '86vh' }}
        maxW={{ base: '100vw', sm: '1440px' }}
        maxH={{ base: '100vh', sm: '900px' }}
        display={'flex'}
        flexDirection={'column'}
        borderRadius={{ base: 0, sm: 'lg' }}
        overflow={'hidden'}
        bg={'gray.50'}
      >
        <Box
          ref={viewportRef}
          position={'relative'}
          flex={1}
          minH={0}
          overflow={'hidden'}
          bg={'gray.50'}
          sx={{ touchAction: 'none' }}
          cursor={isDragging ? 'grabbing' : 'grab'}
          userSelect={'none'}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onContextMenu={(event) => event.preventDefault()}
          onKeyDown={handleKeyDown}
          tabIndex={0}
        >
          <Box
            key={preview.key}
            position={'absolute'}
            left={0}
            top={0}
            transform={`translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`}
            transformOrigin={'0 0'}
            willChange={'transform'}
            dangerouslySetInnerHTML={{ __html: preview.markup }}
          />
          <Flex
            position={'absolute'}
            right={4}
            bottom={4}
            alignItems={'center'}
            gap={2}
            px={2}
            py={1}
            bg={'white'}
            borderRadius={'8px'}
            overflow={'hidden'}
            boxShadow={'0 0 1px rgba(19, 51, 107, 0.10), 0 4px 10px rgba(19, 51, 107, 0.10)'}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <MyTooltip label={t('common:MermaidFitView')}>
              <IconButton
                aria-label={t('common:MermaidFitView')}
                icon={<MyIcon name={'core/modules/fitView'} boxSize={'18px'} />}
                w={'30px'}
                h={'30px'}
                minW={'30px'}
                minH={'30px'}
                p={'6px'}
                borderRadius={'6px'}
                color={'#485264'}
                variant={'ghost'}
                onClick={resetView}
              />
            </MyTooltip>

            <Box w={'1px'} h={'20px'} flexShrink={0} borderRadius={'10px'} bg={'#E8EBF0'} />

            <Flex alignItems={'center'} gap={1}>
              <MyTooltip label={t('common:MermaidZoomOut')}>
                <IconButton
                  aria-label={t('common:MermaidZoomOut')}
                  icon={<MyIcon name={'minus'} boxSize={'18px'} />}
                  w={'30px'}
                  h={'30px'}
                  minW={'30px'}
                  minH={'30px'}
                  p={'6px'}
                  borderRadius={'6px'}
                  color={'#485264'}
                  variant={'ghost'}
                  _active={{ transform: 'none' }}
                  onClick={() => changeScale(1 / 1.2)}
                />
              </MyTooltip>
              <Text
                w={'52px'}
                flexShrink={0}
                color={'#485264'}
                fontSize={'16px'}
                fontWeight={500}
                lineHeight={'24px'}
                letterSpacing={'0.15px'}
                textAlign={'center'}
                whiteSpace={'nowrap'}
                sx={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {zoomPercent} %
              </Text>
              <MyTooltip label={t('common:MermaidZoomIn')}>
                <IconButton
                  aria-label={t('common:MermaidZoomIn')}
                  icon={
                    <Flex w={'18px'} h={'18px'} alignItems={'center'} justifyContent={'center'}>
                      <MyIcon name={'core/chat/mermaidPreviewAdd'} boxSize={'12px'} />
                    </Flex>
                  }
                  w={'30px'}
                  h={'30px'}
                  minW={'30px'}
                  minH={'30px'}
                  p={'6px'}
                  borderRadius={'6px'}
                  color={'#485264'}
                  variant={'ghost'}
                  _active={{ transform: 'none' }}
                  onClick={() => changeScale(1.2)}
                />
              </MyTooltip>
            </Flex>

            <Box w={'1px'} h={'20px'} flexShrink={0} borderRadius={'10px'} bg={'#E8EBF0'} />

            <MyTooltip label={t('common:Export')}>
              <IconButton
                aria-label={t('common:Export')}
                icon={<MyIcon name={'export'} boxSize={'18px'} />}
                w={'30px'}
                h={'30px'}
                minW={'30px'}
                minH={'30px'}
                p={'6px'}
                borderRadius={'6px'}
                color={'#485264'}
                variant={'ghost'}
                onClick={onExport}
              />
            </MyTooltip>
            <MyTooltip label={t('common:Close')}>
              <IconButton
                aria-label={t('common:Close')}
                icon={
                  <Flex w={'18px'} h={'18px'} alignItems={'center'} justifyContent={'center'}>
                    <MyIcon name={'core/chat/mermaidPreviewClose'} boxSize={'9.90809px'} />
                  </Flex>
                }
                w={'30px'}
                h={'30px'}
                minW={'30px'}
                minH={'30px'}
                p={'6px'}
                borderRadius={'6px'}
                color={'#485264'}
                variant={'ghost'}
                onClick={onClose}
              />
            </MyTooltip>
          </Flex>
        </Box>
      </ModalContent>
    </Modal>
  );
};

const MermaidBlock = ({
  code,
  clickToPreview = false
}: {
  code: string;
  clickToPreview?: boolean;
}) => {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState('');
  const [mermaid, setMermaid] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error] = useState<string>('');
  const [preview, setPreview] = useState<MermaidPreview>();
  const { isOpen, onOpen, onClose } = useDisclosure();

  useEffect(() => {
    let mounted = true;

    import('mermaid')
      .then((module) => {
        if (!mounted) return;

        const mermaidInstance = module.default;
        mermaidInstance.mermaidAPI.initialize({
          startOnLoad: true,
          theme: 'base',
          flowchart: {
            useMaxWidth: false
          },
          themeVariables: {
            fontSize: '14px',
            primaryColor: '#d6e8ff',
            primaryTextColor: '#485058',
            primaryBorderColor: '#fff',
            lineColor: '#5A646E',
            secondaryColor: '#B5E9E5',
            tertiaryColor: '#485058'
          }
        });

        setMermaid(mermaidInstance);
        setIsLoading(false);
      })
      .catch((error) => {
        console.error('Failed to load mermaid:', error);
        setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    (async () => {
      if (!code || !mermaid || isLoading) return;

      try {
        const formatCode = code.replace(
          new RegExp(`[${Object.keys(punctuationMap).join('')}]`, 'g'),
          (match) => punctuationMap[match]
        );
        const { svg } = await mermaid.render(`mermaid-${Date.now()}`, formatCode);
        setSvg(svg);
      } catch (e: any) {
        console.log('[Mermaid] ', e?.message);
      }
    })();
  }, [code, isLoading, mermaid]);

  const onclickExport = useCallback(() => {
    const svgElement = ref.current?.children[0];
    const markup = preview?.markup ?? ref.current?.innerHTML;
    const width = preview?.width ?? svgElement?.clientWidth;
    const height = preview?.height ?? svgElement?.clientHeight;
    if (!markup || !width || !height) return;

    const rate = height / width;
    const w = 3000;
    const h = rate * w;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);

    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup);

    img.onload = () => {
      ctx.drawImage(img, 0, 0, w, h);

      const jpgDataUrl = canvas.toDataURL('image/jpeg', 1);
      const a = document.createElement('a');
      a.href = jpgDataUrl;
      a.download = 'mermaid.jpg';
      document.body.appendChild(a);
      a.click();
      document.body?.removeChild(a);
    };
    img.onerror = (e) => {
      console.log(e);
    };
  }, [preview]);

  const onOpenPreview = useCallback(() => {
    const svgElement = ref.current?.querySelector('svg');
    if (!svgElement) return;

    // 放大层直接渲染 SVG DOM，保持 foreignObject 内文字与行内 Mermaid 的布局一致。
    const previewSvg = svgElement.cloneNode(true) as SVGSVGElement;
    const viewBox = previewSvg.getAttribute('viewBox')?.trim().split(/\s+/).map(Number);
    if (
      !viewBox ||
      viewBox.length !== 4 ||
      viewBox.some((value) => !Number.isFinite(value)) ||
      viewBox[2] <= 0 ||
      viewBox[3] <= 0
    ) {
      return;
    }
    const [viewBoxX, viewBoxY, viewBoxWidth, viewBoxHeight] = viewBox;
    const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    background.setAttribute('x', String(viewBoxX));
    background.setAttribute('y', String(viewBoxY));
    background.setAttribute('width', String(viewBoxWidth));
    background.setAttribute('height', String(viewBoxHeight));
    background.setAttribute('fill', '#fff');
    previewSvg.insertBefore(background, previewSvg.firstChild);
    previewSvg.setAttribute('width', String(viewBoxWidth));
    previewSvg.setAttribute('height', String(viewBoxHeight));
    previewSvg.style.display = 'block';
    const { width, height } = svgElement.getBoundingClientRect();
    setPreview({
      key: `${previewSvg.id || 'mermaid'}-${viewBoxWidth}-${viewBoxHeight}`,
      markup: previewSvg.outerHTML,
      width: viewBoxWidth || width,
      height: viewBoxHeight || height
    });
    onOpen();
  }, [onOpen]);

  if (isLoading) {
    return (
      <Box
        minW={'100px'}
        minH={'50px'}
        py={4}
        bg={'gray.50'}
        borderRadius={'md'}
        textAlign={'center'}
      >
        Loading...
      </Box>
    );
  }

  if (error) {
    return (
      <Box minW={'100px'} minH={'50px'} py={4} bg={'red.50'} borderRadius={'md'} p={3}>
        <Box color={'red.600'} fontSize={'sm'}>
          {error}
        </Box>
      </Box>
    );
  }

  return (
    <>
      <Box
        position={'relative'}
        cursor={clickToPreview && svg ? 'pointer' : undefined}
        role={clickToPreview ? 'button' : undefined}
        tabIndex={clickToPreview ? 0 : undefined}
        aria-label={clickToPreview ? t('common:FullScreenLight') : undefined}
        onClick={clickToPreview && svg ? onOpenPreview : undefined}
        onKeyDown={(event) => {
          if (!clickToPreview || !svg || (event.key !== 'Enter' && event.key !== ' ')) return;
          event.preventDefault();
          onOpenPreview();
        }}
      >
        {!isOpen && (
          <Box
            overflowX={'auto'}
            ref={ref}
            minW={'100px'}
            minH={'50px'}
            py={4}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        )}
        {!clickToPreview && (
          <Flex
            position={'absolute'}
            top={1}
            right={1}
            gap={1}
            p={1}
            bg={'white'}
            border={'1px solid'}
            borderColor={'myGray.200'}
            borderRadius={'md'}
            boxShadow={'1'}
          >
            <MyTooltip label={t('common:FullScreenLight')}>
              <IconButton
                aria-label={t('common:FullScreenLight')}
                icon={<MyIcon name={'fullScreen'} w={'16px'} />}
                size={'xs'}
                variant={'ghost'}
                isDisabled={!svg}
                onClick={onOpenPreview}
              />
            </MyTooltip>
            <MyTooltip label={t('common:Export')}>
              <IconButton
                aria-label={t('common:Export')}
                icon={<MyIcon name={'export'} w={'16px'} />}
                size={'xs'}
                variant={'ghost'}
                isDisabled={!svg}
                onClick={onclickExport}
              />
            </MyTooltip>
          </Flex>
        )}
      </Box>

      <MermaidCanvas
        visible={isOpen}
        preview={preview}
        onClose={onClose}
        onExport={onclickExport}
        closeOnOverlayClick={clickToPreview}
      />
    </>
  );
};

export default MermaidBlock;
