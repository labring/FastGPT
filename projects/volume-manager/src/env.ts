import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().default(3000),
  VM_AUTH_TOKEN: z.string().min(1),
  VM_RUNTIME: z.enum(['docker', 'kubernetes']).default('kubernetes'),
  VM_DOCKER_SOCKET: z.string().default('/var/run/docker.sock'),
  VM_DOCKER_API_VERSION: z.string().default('v1.44'),
  VM_K8S_NAMESPACE: z.string().default('opensandbox'),
  VM_K8S_PVC_STORAGE_CLASS: z.string().default('standard'),
  VM_K8S_PVC_STORAGE_SIZE: z.string().default('1Gi'),
  VM_VOLUME_NAME_PREFIX: z.string().default('fastgpt-session'),
  VM_LOG_LEVEL: z.enum(['debug', 'info', 'none']).default('info')
});

const result = schema.safeParse(process.env);

if (!result.success) {
  const missing = result.error.issues.map((i) => i.path.join('.')).join(', ');
  console.error(`[volume-manager] Invalid environment variables: ${missing}`);
  process.exit(1);
}

export const env = result.data;
