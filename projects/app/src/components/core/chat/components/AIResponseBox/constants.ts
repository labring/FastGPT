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
