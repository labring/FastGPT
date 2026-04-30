import { Hono } from 'hono';
import { env } from './env';
import { DockerVolumeDriver } from './drivers/DockerVolumeDriver';
import { K8sVolumeDriver } from './drivers/K8sVolumeDriver';
import { VolumeService } from './services/VolumeService';
import { volumeRoutes } from './routes/volumes';

// Select driver based on runtime
const driver = env.VM_RUNTIME === 'docker' ? new DockerVolumeDriver() : new K8sVolumeDriver();
const service = new VolumeService(driver);

const app = new Hono();

// Health check (no auth)
app.get('/health', (c) => c.json({ status: 'ok' }));

// Auth middleware for /v1/* routes
app.use('/v1/*', async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (authHeader !== `Bearer ${env.VM_AUTH_TOKEN}`) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
});

// Volume routes
app.route('/v1/volumes', volumeRoutes(service));

const server = Bun.serve({
  port: env.PORT,
  fetch: app.fetch
});

console.log(`[volume-manager] Listening on port ${server.port} (runtime: ${env.VM_RUNTIME})`);
