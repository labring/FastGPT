package com.example.fastgptproject.service;

import com.example.fastgptproject.pojo.Users;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 用户服务接口
 */
@Service
public interface UserService {

    /**
     * 用户注册
     * @param userName 用户名
     * @param email 邮箱
     * @param password 密码
     * @return 注册成功的用户信息
     */
    Users register(String userName, String email, String password);

    /**
     * 用户登录验证
     * @param userName 用户名
     * @param password 密码
     * @return 登录成功的用户信息
     */
    Users login(String userName, String password);

    /**
     * 获取所有用户
     * @return 用户列表
     */
    List<Users> findAllUsers();

    /**
     * 根据ID查找用户
     * @param userId 用户ID
     * @return 用户信息
     */
    Users findById(Integer userId);

    /**
     * 删除用户
     * @param userId 用户ID
     * @return 删除是否成功
     */
    boolean deleteUser(Integer userId);

    /**
     * 检查是否为管理员
     * @param user 用户对象
     * @return 是否为管理员
     */
    boolean isAdmin(Users user);

    /**
     * 初始化管理员账号（如果不存在）
     */
    void initAdminUser();

    /**
     * 保持兼容性的方法
     * @return 用户列表
     */
    List<Users> findAll();

    /**
     * 提升用户为管理员
     * @param userId 用户ID
     * @return 是否成功
     */
    boolean promoteToAdmin(Integer userId);

    /**
     * 降级管理员为普通用户
     * @param userId 用户ID
     * @return 是否成功
     */
    boolean demoteAdmin(Integer userId);

    /**
     * 创建管理员账号
     * @param userName 用户名
     * @param email 邮箱
     * @param password 密码
     * @return 创建的管理员信息
     */
    Users createAdmin(String userName, String email, String password);

    /**
     * 修改密码
     * @param userId 用户ID
     * @param oldPassword 旧密码
     * @param newPassword 新密码
     * @return 是否成功
     */
    boolean changePassword(Integer userId, String oldPassword, String newPassword);

    /**
     * 重置密码（管理员功能）
     * @param userId 用户ID
     * @param newPassword 新密码
     * @return 是否成功
     */
    boolean resetPassword(Integer userId, String newPassword);
    
    /**
     * 根据邮箱查找用户
     * @param email 邮箱地址
     * @return 用户信息
     */
    Users findByEmail(String email);
    
    /**
     * 通过邮箱重置密码（忘记密码功能）
     * @param email 邮箱地址
     * @param newPassword 新密码
     * @return 是否成功
     */
    boolean resetPasswordByEmail(String email, String newPassword);
}
