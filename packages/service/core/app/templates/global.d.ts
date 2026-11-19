import type { AppTemplateData } from './service';

declare global {
  var appTemplateData: AppTemplateData | undefined;
}

export {};
