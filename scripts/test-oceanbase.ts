import mysql from 'mysql2/promise';

async function testConnection() {
  console.log('Connecting to OceanBase...');
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT) || 2881,
      user: process.env.DB_USER || 'root@test',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'test'
    });

    console.log('✅ Connected to OceanBase!');
    const [rows] = await connection.execute('SELECT VERSION() as version');
    console.log('Version:', (rows as any)[0].version);

    // Create a test table to verify write permissions
    await connection.execute('CREATE TABLE IF NOT EXISTS ci_test_table (id INT PRIMARY KEY, name VARCHAR(255))');
    console.log('✅ Table created');

    await connection.execute('INSERT INTO ci_test_table (id, name) VALUES (1, "ci_test") ON DUPLICATE KEY UPDATE name="ci_test"');
    console.log('✅ Data inserted');

    const [results] = await connection.execute('SELECT * FROM ci_test_table WHERE id = 1');
    console.log('✅ Data retrieved:', (results as any)[0]);

    await connection.execute('DROP TABLE ci_test_table');
    console.log('✅ Cleanup successful');

    await connection.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Connection failed:', error);
    process.exit(1);
  }
}

testConnection();
