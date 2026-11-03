import type {
  CreateUsageProps,
  ConcatUsageProps,
  PushUsageItemsProps
} from '@fastgpt/global/support/wallet/usage/api';

declare global {
  var createUsageHandler: (data: CreateUsageProps) => any;
  var concatUsageHandler: (data: ConcatUsageProps) => any;
  var pushUsageItemsHandler: (data: PushUsageItemsProps) => any;
}

export {};
