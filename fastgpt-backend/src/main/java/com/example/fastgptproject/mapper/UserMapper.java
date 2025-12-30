package com.example.fastgptproject.mapper;

import com.example.fastgptproject.pojo.Users;
import org.apache.ibatis.annotations.Mapper;

import java.util.List;

@Mapper
public interface UserMapper {

    /**
     * 根据用户名查找用户
     */
    Users findByUserName(String userName);

    /**
     * 插入新用户
     */
    int insertUser(Users user);

    /**
     * 查询所有用户
     */
    List<Users> findAllUsers();

    /**
     * 根据用户ID查找用户
     */
    Users findByUserId(Integer userId);

    /**
     * 更新用户信息
     */
    int updateUser(Users user);

    /**
     * 删除用户
     */
    int deleteUser(Integer userId);

    /**
     * 检查用户名是否已存在
     */
    int countByUserName(String userName);

    /**
     * 检查邮箱是否已存在
     */
    int countByEmail(String email);
    
    /**
     * 根据邮箱查找用户
     */
    Users findByEmail(String email);
}