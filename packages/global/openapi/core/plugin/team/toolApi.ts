import z from 'zod';

export const GetTeamToolDetailQuerySchema = z.object({
  toolId: z.string()
});
export type GetTeamToolDetailQueryType = z.infer<typeof GetTeamToolDetailQuerySchema>;

export const ToolDetailItemSchema = z.object({
  name: z.string(),
  intro: z.string(),
  icon: z.string().nullish(),
  readme: z.string().nullish(),
  versionList: z.array(
    z.object({
      inputs: z.array(
        z.object({
          key: z.string(),
          label: z.string().nullish(),
          description: z.string().nullish(),
          valueType: z.string().nullish()
        })
      ),
      outputs: z.array(
        z.object({
          key: z.string(),
          label: z.string().nullish(),
          description: z.string().nullish(),
          valueType: z.string().nullish()
        })
      )
    })
  )
});
export const TeamToolDetailSchema = z.object({
  tools: z.array(ToolDetailItemSchema),
  downloadUrl: z.string()
});
export type GetTeamToolDetailResponseType = z.infer<typeof TeamToolDetailSchema>;
