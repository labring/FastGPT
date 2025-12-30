package com.example.fastgptproject.service;

import com.example.fastgptproject.entity.Feedback;
import java.util.List;

/**
 * 反馈服务接口
 */
public interface FeedbackService {
    
    /**
     * 获取所有反馈
     */
    List<Feedback> getAllFeedbacks();
    
    /**
     * 根据用户ID获取反馈
     */
    List<Feedback> getFeedbacksByUserId(Integer userId);
    
    /**
     * 创建反馈
     */
    boolean createFeedback(Feedback feedback);
    
    /**
     * 删除反馈
     */
    boolean deleteFeedback(Integer fbId);
}
