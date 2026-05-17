import { eventBus, EventNameEnum } from '@/web/common/utils/eventbus';

export const onSendPrompt = (text: string) =>
  eventBus.emit(EventNameEnum.sendQuestion, {
    text,
    focus: true
  });
