package com.example.fastgptproject.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 对话记录DTO，包含用户信息
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ConversationWithUser {
    private Integer id;
    private Integer userId;
    private String userName;  // 用户名
    private String email;     // 用户邮箱
    private String title;
    private String content;
    private LocalDateTime createTime;
}
