export const mockData = [
  {
    tableName: 'users',
    description: '用户基本信息表',
    enabled: true,
    columns: {
      id: {
        columnName: 'id',
        columnType: 'VARCHAR(36)',
        description: '用户唯一标识符',
        examples: ['user_001', 'user_002'],
        enabled: true,
        valueIndex: true
      },
      username: {
        columnName: 'username',
        columnType: 'VARCHAR(50)',
        description: '用户名',
        examples: ['john_doe', 'jane_smith'],
        enabled: true,
        valueIndex: false
      },
      email: {
        columnName: 'email',
        columnType: 'VARCHAR(100)',
        description: '用户邮箱地址',
        examples: ['john@example.com', 'jane@example.com'],
        enabled: true,
        valueIndex: false
      },
      created_at: {
        columnName: 'created_at',
        columnType: 'TIMESTAMP',
        description: '创建时间1',
        examples: ['2023-01-01 00:00:00', '2023-01-02 00:00:00'],
        enabled: true,
        valueIndex: false
      },
      created_at2: {
        columnName: 'created_at',
        columnType: 'TIMESTAMP',
        description: '创建时间2',
        examples: ['2023-01-01 00:00:00', '2023-01-02 00:00:00'],
        enabled: true,
        valueIndex: false
      },
      created_at3: {
        columnName: 'created_at',
        columnType: 'TIMESTAMP',
        description: '创建时间3',
        examples: ['2023-01-01 00:00:00', '2023-01-02 00:00:00'],
        enabled: true,
        valueIndex: false
      },
      created_at4: {
        columnName: 'created_at',
        columnType: 'TIMESTAMP',
        description: '创建时间',
        examples: ['2023-01-01 00:00:00', '2023-01-02 00:00:00'],
        enabled: true,
        valueIndex: false
      },
      created_at5: {
        columnName: 'created_at',
        columnType: 'TIMESTAMP',
        description: '创建时间',
        examples: ['2023-01-01 00:00:00', '2023-01-02 00:00:00'],
        enabled: true,
        valueIndex: false
      },
      created_at6: {
        columnName: 'created_at',
        columnType: 'TIMESTAMP',
        description: '创建时间',
        examples: ['2023-01-01 00:00:00', '2023-01-02 00:00:00'],
        enabled: true,
        valueIndex: false
      }
    }
  }
];
