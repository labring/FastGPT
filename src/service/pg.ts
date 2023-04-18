import { Pool } from 'pg';

export const connectPg = async () => {
  if (global.pgClient) {
    return global.pgClient;
  }

  global.pgClient = new Pool({
    host: process.env.PG_HOST,
    port: process.env.PG_PORT ? +process.env.PG_PORT : 5432,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DB_NAME,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000
  });

  global.pgClient.on('connect', () => {
    console.log('pg connected');
  });
  global.pgClient.on('error', (err) => {
    console.log(err);
    global.pgClient = null;
  });

  try {
    await global.pgClient.connect();
    return global.pgClient;
  } catch (error) {
    global.pgClient = null;
    return Promise.reject(error);
  }
};
