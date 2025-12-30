-- 将现有用户提升为管理员
-- 替换 'username' 为实际用户名
UPDATE users SET role_id = 2 WHERE user_name = 'username';

-- 或者直接插入新的管理员账号
INSERT INTO users (user_name, email, password, role_id, create_time, update_time)
VALUES (
    'newadmin',                                                          -- 用户名
    'newadmin@example.com',                                              -- 邮箱
    '$2a$10$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',     -- BCrypt加密后的密码
    2,                                                                   -- 管理员角色
    NOW(),                                                               -- 创建时间
    NOW()                                                                -- 更新时间
);

-- 注意：密码需要使用 BCrypt 加密
-- 可以使用在线工具或运行 Java 代码生成：
-- new BCryptPasswordEncoder().encode("your_password")
