// Load vector database environment variables before tests run
export default async function setup() {
  console.log('Vector DB integration tests - environment loaded');
  console.log('PG_URL configured:', Boolean(process.env.PG_URL));
  console.log('OCEANBASE_URL configured:', Boolean(process.env.OCEANBASE_URL));
  console.log('MILVUS_ADDRESS configured:', Boolean(process.env.MILVUS_ADDRESS));
  console.log('SEEKDB_URL configured:', Boolean(process.env.SEEKDB_URL));

  return async () => {
    // Cleanup if needed
  };
}
