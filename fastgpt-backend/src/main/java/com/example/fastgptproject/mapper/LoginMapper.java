package com.example.fastgptproject.mapper;

import com.example.fastgptproject.pojo.Users;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface LoginMapper {
    List<Users> findAll();
    List<Users> findAllUsers();
}
