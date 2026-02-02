import { loadVectorDBEnv } from './utils';

// Load env before any modules that read process.env
loadVectorDBEnv({ envFileNames: ['.env.test.local'] });
