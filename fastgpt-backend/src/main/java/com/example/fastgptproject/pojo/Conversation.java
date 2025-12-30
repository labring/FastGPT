package com.example.fastgptproject.pojo;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 对话记录实体类
 * 对应数据库 conversations 表
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class Conversation {
    private Integer id;
    private Integer userId;
    private String title;
    private String content;
    private LocalDateTime createTime;
}
