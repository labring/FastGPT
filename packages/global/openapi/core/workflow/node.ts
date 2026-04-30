import z from 'zod';
import { FlowNodeOutputItemTypeSchema } from '../../../core/workflow/type/io';
import { StoreNodeItemTypeSchema } from '../../../core/workflow/type/node';

// `invalidCondition` in FlowNodeOutputItemTypeSchema is a Zod function schema used only
// by the editor to validate outputs; function schemas cannot be represented in JSON
// Schema, so we strip it before exposing via OpenAPI.
const OpenAPIFlowNodeOutputItemTypeSchema = FlowNodeOutputItemTypeSchema.omit({
  invalidCondition: true
});

export const OpenAPIStoreNodeItemTypeSchema = StoreNodeItemTypeSchema.omit({
  outputs: true
}).extend({
  outputs: z.array(OpenAPIFlowNodeOutputItemTypeSchema)
});
