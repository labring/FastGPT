import type { z } from '@hono/zod-openapi';
export declare const CreateContainerSchema: z.ZodObject<
  {
    name: z.ZodString;
  },
  z.core.$strip
>;
export type CreateContainerInput = z.infer<typeof CreateContainerSchema>;
export declare const ContainerStatusSchema: z.ZodObject<
  {
    state: z.ZodEnum<{
      Running: 'Running';
      Creating: 'Creating';
      Paused: 'Paused';
      Error: 'Error';
      Unknown: 'Unknown';
    }>;
    replicas: z.ZodOptional<z.ZodNumber>;
    availableReplicas: z.ZodOptional<z.ZodNumber>;
  },
  z.core.$strip
>;
export type ContainerStatus = z.infer<typeof ContainerStatusSchema>;
export declare const ContainerServerSchema: z.ZodObject<
  {
    serviceName: z.ZodString;
    number: z.ZodNumber;
    publicDomain: z.ZodOptional<z.ZodString>;
    domain: z.ZodOptional<z.ZodString>;
  },
  z.core.$strip
>;
export type ContainerServer = z.infer<typeof ContainerServerSchema>;
export declare const ContainerInfoSchema: z.ZodObject<
  {
    name: z.ZodString;
    image: z.ZodObject<
      {
        imageName: z.ZodString;
      },
      z.core.$strip
    >;
    status: z.ZodObject<
      {
        state: z.ZodEnum<{
          Running: 'Running';
          Creating: 'Creating';
          Paused: 'Paused';
          Error: 'Error';
          Unknown: 'Unknown';
        }>;
        replicas: z.ZodOptional<z.ZodNumber>;
        availableReplicas: z.ZodOptional<z.ZodNumber>;
      },
      z.core.$strip
    >;
    server: z.ZodOptional<
      z.ZodObject<
        {
          serviceName: z.ZodString;
          number: z.ZodNumber;
          publicDomain: z.ZodOptional<z.ZodString>;
          domain: z.ZodOptional<z.ZodString>;
        },
        z.core.$strip
      >
    >;
    createdAt: z.ZodOptional<z.ZodString>;
  },
  z.core.$strip
>;
export type ContainerInfo = z.infer<typeof ContainerInfoSchema>;
export declare const ContainerInfoResponseSchema: z.ZodObject<
  {
    success: z.ZodLiteral<true>;
    data: z.ZodObject<
      {
        name: z.ZodString;
        image: z.ZodObject<
          {
            imageName: z.ZodString;
          },
          z.core.$strip
        >;
        status: z.ZodObject<
          {
            state: z.ZodEnum<{
              Running: 'Running';
              Creating: 'Creating';
              Paused: 'Paused';
              Error: 'Error';
              Unknown: 'Unknown';
            }>;
            replicas: z.ZodOptional<z.ZodNumber>;
            availableReplicas: z.ZodOptional<z.ZodNumber>;
          },
          z.core.$strip
        >;
        server: z.ZodOptional<
          z.ZodObject<
            {
              serviceName: z.ZodString;
              number: z.ZodNumber;
              publicDomain: z.ZodOptional<z.ZodString>;
              domain: z.ZodOptional<z.ZodString>;
            },
            z.core.$strip
          >
        >;
        createdAt: z.ZodOptional<z.ZodString>;
      },
      z.core.$strip
    >;
  },
  z.core.$strip
>;
export type ContainerInfoResponse = z.infer<typeof ContainerInfoResponseSchema>;
export declare const SealosContainerResponseSchema: z.ZodObject<
  {
    name: z.ZodString;
    image: z.ZodObject<
      {
        imageName: z.ZodString;
      },
      z.core.$strip
    >;
    createTime: z.ZodOptional<z.ZodString>;
    status: z.ZodObject<
      {
        replicas: z.ZodCoercedNumber<unknown>;
        availableReplicas: z.ZodCoercedNumber<unknown>;
        isPause: z.ZodCoercedBoolean<unknown>;
      },
      z.core.$strip
    >;
    ports: z.ZodArray<
      z.ZodObject<
        {
          serviceName: z.ZodString;
          number: z.ZodCoercedNumber<unknown>;
          publicDomain: z.ZodOptional<z.ZodString>;
          domain: z.ZodOptional<z.ZodString>;
        },
        z.core.$strip
      >
    >;
  },
  z.core.$strip
>;
export type SealosContainerResponse = z.infer<typeof SealosContainerResponseSchema>;
