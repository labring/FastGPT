import { z } from 'zod';
import { ParentIdSchema } from '../../../../common/parentFolder/type';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import { SkillManifestSchema } from '../../../../core/app/skill/type';

export const ListSkillResponseSchema = z.array(SkillManifestSchema).meta({
  description: 'Skill template list',
  example: []
});
export type ListSkillResponseType = z.infer<typeof ListSkillResponseSchema>;

export const DetailSkillQuerySchema = z.object({
  skillId: z.string().meta({
    description: 'Skill ID',
    example: 'skill-coding-assistant'
  })
});
export type DetailSkillQueryType = z.infer<typeof DetailSkillQuerySchema>;

export const DetailSkillResponseSchema = SkillManifestSchema.meta({
  description: 'Skill detail'
});
export type DetailSkillResponseType = z.infer<typeof DetailSkillResponseSchema>;

export const CreateSkillAppBodySchema = z.object({
  parentId: ParentIdSchema.optional().meta({
    description: 'Parent folder id'
  }),
  skillId: z.string().meta({
    description: 'Skill ID',
    example: 'skill-coding-assistant'
  }),
  name: z.string().optional().meta({
    description: 'Custom app name'
  }),
  avatar: z.string().optional().meta({
    description: 'Custom app avatar'
  }),
  intro: z.string().optional().meta({
    description: 'Custom app intro'
  }),
  variables: z.record(z.string(), z.string()).optional().meta({
    description: 'Variable values for prompt rendering'
  }),
  toolIds: z.array(z.string()).optional().meta({
    description: 'Override selected tool ids'
  }),
  datasetIds: z.array(z.string()).optional().meta({
    description: 'Override selected dataset ids'
  })
});
export type CreateSkillAppBodyType = z.infer<typeof CreateSkillAppBodySchema>;

export const CreateSkillAppResponseSchema = ObjectIdSchema.meta({
  description: 'Created app id'
});
export type CreateSkillAppResponseType = z.infer<typeof CreateSkillAppResponseSchema>;
