import type { AgentPlanType } from '@fastgpt/global/core/ai/agent/type';

export const accordionButtonStyle = {
  w: 'auto',
  bg: 'white',
  borderRadius: 'md',
  borderWidth: '1px',
  borderColor: 'myGray.200',
  boxShadow: '1',
  pl: 3,
  pr: 2.5,
  _hover: {
    bg: 'auto'
  }
};

// 24px 标题 + 4px 底部留白 + 1px 分隔线，供内部吸顶标题和收起定位共用。
export const PROCESSING_COLLAPSE_HEADER_HEIGHT = '29px';

const nativeClipSupport =
  '(view-timeline-name: --processing-content) and (animation-range: exit-crossing 0% exit-crossing 100%) and (overflow: clip)';

/** 限制裁剪窗口的可视边界，避免补偿位移扩大滚动区域或覆盖后续处理项。 */
export const processingItemClipStyle = {
  [`@supports ${nativeClipSupport}`]: { overflow: 'clip' }
} as const;

/** 单项标题在所属内容内吸顶，外层标题存在时顺延；详情裁剪负责遮挡，标题保持透明。 */
export const processingItemHeaderStyle = {
  position: 'sticky',
  top: 'var(--processing-header-offset, 0px)',
  zIndex: 3,
  sx: {
    // 旧浏览器不启用透明吸顶，避免 JS 裁剪追不上合成线程滚动。
    [`@supports not (${nativeClipSupport})`]: { position: 'static' }
  }
} as const;

/**
 * 将透明标题下方作为裁剪窗口，窗口与内容沿同一滚动时间线反向位移，保持内容的自然滚动位置。
 * 只动画 transform，让遮挡与合成线程滚动同步；clip-path 或 JS 裁剪在主线程繁忙时会滞后。
 * 详情必须有一个 data-processing-content 直接子元素，且由 hook 提供窗口高度和吸顶偏移。
 */
export const processingContentClipStyle = {
  [`@supports ${nativeClipSupport}`]: {
    '--code-header-top': 'var(--processing-clip-top, 24px)',
    overflow: 'clip',
    pointerEvents: 'none',
    viewTimelineName: '--processing-content',
    viewTimelineInset: 'var(--processing-clip-top, 24px) 0px',
    animation: 'processing-content-window 1s linear both',
    animationTimeline: '--processing-content',
    animationRange: 'exit-crossing 0% exit-crossing 100%',
    willChange: 'transform',
    '@keyframes processing-content-window': {
      from: { transform: 'translateY(0px)' },
      to: { transform: 'translateY(var(--processing-clip-height, 0px))' }
    },
    '> [data-processing-content]': {
      pointerEvents: 'auto',
      animation: 'processing-content-scroll 1s linear both',
      animationTimeline: '--processing-content',
      animationRange: 'exit-crossing 0% exit-crossing 100%',
      willChange: 'transform',
      '@keyframes processing-content-scroll': {
        from: { transform: 'translateY(0px)' },
        to: { transform: 'translateY(calc(0px - var(--processing-clip-height, 0px)))' }
      }
    }
  }
} as const;

export const AGENT_PLAN_ASK_OTHER_OPTION_VALUE = '__fastgpt_agent_plan_ask_other__';

export const planStepStatusStyle: Record<
  AgentPlanType['steps'][number]['status'],
  { dot: string; line?: string }
> = {
  pending: {
    dot: 'myGray.300'
  },
  in_progress: {
    dot: 'blue.500',
    line: 'blue.200'
  },
  done: {
    dot: 'green.500'
  },
  blocked: {
    dot: 'red.500'
  },
  skipped: {
    dot: 'orange.400'
  }
};

export const planStepPulseAfterStyle = {
  content: '""',
  position: 'absolute',
  inset: '-6px',
  borderRadius: 'full',
  border: '2px solid',
  borderColor: 'blue.300',
  animation: 'planStepPulse 1.4s ease-out infinite'
};

export const planStepPulseSx = {
  '@keyframes planStepPulse': {
    '0%': {
      transform: 'scale(0.45)',
      opacity: 0.75
    },
    '100%': {
      transform: 'scale(1.4)',
      opacity: 0
    }
  }
};
