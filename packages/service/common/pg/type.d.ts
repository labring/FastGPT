import type { Pool } from 'pg';

declare global {
  var pgClient: Pool | null;
}
