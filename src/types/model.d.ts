import { ModelStatusEnum } from '@/constants/model';
import type { ModelSchema } from './mongoSchema';
export interface ModelUpdateParams {
  name: string;
  systemPrompt: string;
  intro: string;
  temperature: number;
  service: ModelSchema.service;
  security: ModelSchema.security;
}
