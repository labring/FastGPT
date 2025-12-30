package com.example.fastgptproject.pojo;

import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class Users {
    private Integer userId;
    private String userName;
    private String student_number;
    private String email;
    @JsonIgnore  // 防止密码在JSON响应中暴露
    private String password;
    private LocalDateTime create_time;
    private LocalDateTime update_time;
    private Byte role_id; // 1=用户, 2=管理员
}
