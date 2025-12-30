package com.example.fastgptproject.mapper;

import com.example.fastgptproject.pojo.Users;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * 用户视图 Mapper - 使用安全视图查询
 * 查询操作使用视图，写操作仍使用原表
 */
@Mapper
public interface UserViewMapper {

    /**
     * 从视图查询所有用户（不含密码）
     */
    @Select("SELECT user_id, user_name, email, role_id, create_time, update_time, role FROM v_users_safe")
    List<Users> findAllUsersFromView();

    /**
     * 从视图根据用户ID查找用户（不含密码）
     */
    @Select("SELECT user_id, user_name, email, role_id, create_time, update_time, role FROM v_users_safe WHERE user_id = #{userId}")
    Users findByUserIdFromView(Integer userId);

    /**
     * 从视图根据用户名查找用户（不含密码）
     */
    @Select("SELECT user_id, user_name, email, role_id, create_time, update_time, role FROM v_users_safe WHERE user_name = #{userName}")
    Users findByUserNameFromView(String userName);

    /**
     * 查询所有管理员（从管理员视图）
     */
    @Select("SELECT user_id, user_name, email, role_id, create_time, update_time FROM v_admins")
    List<Users> findAllAdminsFromView();
}
