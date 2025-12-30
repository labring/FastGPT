package com.example.fastgptproject.service.impl;

import com.example.fastgptproject.mapper.UserMapper;
import com.example.fastgptproject.mapper.UserViewMapper;
import com.example.fastgptproject.pojo.Users;
import com.example.fastgptproject.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class UserServiceImpl implements UserService {

    @Autowired
    private UserMapper userMapper;

    @Autowired
    private UserViewMapper userViewMapper;

    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    /**
     * 用户注册
     */
    @Override
    public Users register(String userName, String email, String password) {
        // 检查用户名是否已存在
        if (userMapper.countByUserName(userName) > 0) {
            throw new RuntimeException("用户名已存在");
        }

        // 检查邮箱是否已存在
        if (email != null && userMapper.countByEmail(email) > 0) {
            throw new RuntimeException("邮箱已被注册");
        }

        // 创建新用户
        Users user = new Users();
        user.setUserName(userName);
        user.setEmail(email);
        user.setPassword(passwordEncoder.encode(password)); // 加密密码
        user.setCreate_time(LocalDateTime.now());
        user.setUpdate_time(LocalDateTime.now());
        user.setRole_id((byte) 1); // 默认为普通用户

        userMapper.insertUser(user);
        
        // 返回用户信息（不包含密码）
        user.setPassword(null);
        return user;
    }

    /**
     * 用户登录验证
     */
    @Override
    public Users login(String userName, String password) {
        // 根据用户名查找用户
        Users user = userMapper.findByUserName(userName);
        
        if (user == null) {
            throw new RuntimeException("用户不存在");
        }

        // 验证密码
        if (!passwordEncoder.matches(password, user.getPassword())) {
            throw new RuntimeException("密码错误");
        }

        // 返回用户信息（不包含密码）
        user.setPassword(null);
        return user;
    }

    /**
     * 获取所有用户（从Users表查询）
     */
    @Override
    public List<Users> findAllUsers() {
        // 直接查询Users表，返回完整用户信息（密码会在返回时自动过滤）
        return userMapper.findAllUsers();
    }

    /**
     * 根据ID查找用户（从安全视图查询，不含密码）
     */
    @Override
    public Users findById(Integer userId) {
        // 使用视图查询，自动排除密码字段
        return userViewMapper.findByUserIdFromView(userId);
    }

    /**
     * 删除用户
     */
    @Override
    public boolean deleteUser(Integer userId) {
        return userMapper.deleteUser(userId) > 0;
    }

    /**
     * 检查是否为管理员
     */
    @Override
    public boolean isAdmin(Users user) {
        return user != null && user.getRole_id() != null && user.getRole_id() == 2;
    }

    /**
     * 初始化管理员账号（如果不存在）
     */
    @Override
    public void initAdminUser() {
        try {
            Users admin = userMapper.findByUserName("admin");
            if (admin == null) {
                Users adminUser = new Users();
                adminUser.setUserName("admin");
                adminUser.setEmail("admin@fastgpt.com");
                adminUser.setPassword(passwordEncoder.encode("123456"));
                adminUser.setCreate_time(LocalDateTime.now());
                adminUser.setUpdate_time(LocalDateTime.now());
                adminUser.setRole_id((byte) 2); // 管理员角色
                userMapper.insertUser(adminUser);
                System.out.println("已创建默认管理员账号: admin/123456");
            }
        } catch (Exception e) {
            System.err.println("初始化管理员账号失败: " + e.getMessage());
        }
    }

    /**
     * 保持兼容性的方法
     */
    @Override
    public List<Users> findAll() {
        return findAllUsers();
    }

    /**
     * 提升用户为管理员
     */
    @Override
    public boolean promoteToAdmin(Integer userId) {
        Users user = userMapper.findByUserId(userId);
        if (user == null) {
            return false;
        }
        user.setRole_id((byte) 2);
        user.setUpdate_time(LocalDateTime.now());
        return userMapper.updateUser(user) > 0;
    }

    /**
     * 降级管理员为普通用户
     */
    @Override
    public boolean demoteAdmin(Integer userId) {
        Users user = userMapper.findByUserId(userId);
        if (user == null) {
            return false;
        }
        // 防止降级默认 admin 账户
        if ("admin".equals(user.getUserName())) {
            throw new RuntimeException("不能降级默认管理员账户");
        }
        user.setRole_id((byte) 1);
        user.setUpdate_time(LocalDateTime.now());
        return userMapper.updateUser(user) > 0;
    }

    /**
     * 创建管理员账号
     */
    @Override
    public Users createAdmin(String userName, String email, String password) {
        // 检查用户名是否已存在
        if (userMapper.countByUserName(userName) > 0) {
            throw new RuntimeException("用户名已存在");
        }

        if (password == null || password.length() < 6) {
            throw new RuntimeException("密码长度至少为 6 位");
        }

        Users admin = new Users();
        admin.setUserName(userName);
        admin.setEmail(email);
        admin.setPassword(passwordEncoder.encode(password));
        admin.setCreate_time(LocalDateTime.now());
        admin.setUpdate_time(LocalDateTime.now());
        admin.setRole_id((byte) 2); // 管理员角色

        userMapper.insertUser(admin);
        admin.setPassword(null); // 不返回密码
        return admin;
    }

    /**
     * 修改密码
     */
    @Override
    public boolean changePassword(Integer userId, String oldPassword, String newPassword) {
        Users user = userMapper.findByUserId(userId);
        if (user == null) {
            return false;
        }

        // 验证旧密码
        if (!passwordEncoder.matches(oldPassword, user.getPassword())) {
            return false;
        }

        if (newPassword == null || newPassword.length() < 6) {
            throw new RuntimeException("新密码长度至少为 6 位");
        }

        // 更新密码
        user.setPassword(passwordEncoder.encode(newPassword));
        user.setUpdate_time(LocalDateTime.now());
        return userMapper.updateUser(user) > 0;
    }

    /**
     * 重置密码（管理员功能）
     */
    @Override
    public boolean resetPassword(Integer userId, String newPassword) {
        Users user = userMapper.findByUserId(userId);
        if (user == null) {
            return false;
        }

        if (newPassword == null || newPassword.length() < 6) {
            throw new RuntimeException("新密码长度至少为 6 位");
        }

        user.setPassword(passwordEncoder.encode(newPassword));
        user.setUpdate_time(LocalDateTime.now());
        return userMapper.updateUser(user) > 0;
    }
    
    /**
     * 根据邮箱查找用户
     */
    @Override
    public Users findByEmail(String email) {
        if (email == null || email.trim().isEmpty()) {
            return null;
        }
        return userMapper.findByEmail(email);
    }
    
    /**
     * 通过邮箱重置密码（忘记密码功能）
     */
    @Override
    public boolean resetPasswordByEmail(String email, String newPassword) {
        Users user = userMapper.findByEmail(email);
        if (user == null) {
            throw new RuntimeException("该邮箱未注册");
        }

        if (newPassword == null || newPassword.length() < 6) {
            throw new RuntimeException("新密码长度至少为 6 位");
        }

        user.setPassword(passwordEncoder.encode(newPassword));
        user.setUpdate_time(LocalDateTime.now());
        return userMapper.updateUser(user) > 0;
    }
}
