import type { FastGPTRegisterMethodType } from '@fastgpt/global/common/system/types';

type ShouldPromptContactBindingParams = {
  isPlus?: boolean;
  bindNotificationMethod?: readonly FastGPTRegisterMethodType[];
  contact?: string | null;
};

/** 判断当前账号是否满足弹出联系方式绑定引导的条件。 */
export const shouldPromptContactBinding = ({
  isPlus,
  bindNotificationMethod,
  contact
}: ShouldPromptContactBindingParams) => !!isPlus && !!bindNotificationMethod?.length && !contact;
