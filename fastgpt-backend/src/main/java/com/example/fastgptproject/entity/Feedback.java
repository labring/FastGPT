package com.example.fastgptproject.entity;

import lombok.Data;
import java.time.LocalDateTime;

/**
 * 用户反馈实体类
 */
@Data
public class Feedback {
    private Integer fbId;
    private Integer userId;
    private String context;
    private LocalDateTime upTime;
    
    // 扩展字段（用于查询时携带用户信息）
    private String userName;
    private String email;
}
