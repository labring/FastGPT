-- FastGPT 安全视图创建脚本 (MySQL)
-- 基于实际的 Users 和 conversations 表结构

USE fastgpt;

-- 1. 用户视图（排除密码字段）
DROP VIEW IF EXISTS v_users_safe;
CREATE VIEW v_users_safe AS
SELECT 
    userId AS user_id,
    userName AS user_name,
    email,
    role_id,
    create_time,
    update_time,
    CASE 
        WHEN role_id = 2 THEN 'admin'
        ELSE 'user'
    END AS role
FROM Users;


-- 2. 对话记录视图（关联用户信息）
DROP VIEW IF EXISTS v_conversations_with_user;
CREATE VIEW v_conversations_with_user AS
SELECT 
    c.id,
    c.userId AS user_id,
    u.userName AS username,
    u.email,
    c.title,
    c.content,
    c.create_time
FROM conversations c
LEFT JOIN Users u ON c.userId = u.userId;


-- 3. 管理员视图（仅显示管理员用户）
DROP VIEW IF EXISTS v_admins;
CREATE VIEW v_admins AS
SELECT 
    userId AS user_id,
    userName AS user_name,
    email,
    role_id,
    create_time,
    update_time
FROM Users
WHERE role_id = 2;


-- 4. 对话记录统计视图（按用户汇总）
DROP VIEW IF EXISTS v_conversation_stats_by_user;
CREATE VIEW v_conversation_stats_by_user AS
SELECT 
    userId AS user_id,
    COUNT(*) AS total_count,
    MIN(create_time) AS first_chat_time,
    MAX(create_time) AS last_chat_time
FROM conversations
WHERE userId IS NOT NULL
GROUP BY userId;


-- 验证视图是否创建成功
SHOW FULL TABLES WHERE TABLE_TYPE LIKE 'VIEW';

-- 测试查询
SELECT COUNT(*) AS user_count FROM v_users_safe;
SELECT COUNT(*) AS conversation_count FROM v_conversations_with_user;
SELECT COUNT(*) AS admin_count FROM v_admins;
SELECT * FROM v_conversation_stats_by_user LIMIT 10;
