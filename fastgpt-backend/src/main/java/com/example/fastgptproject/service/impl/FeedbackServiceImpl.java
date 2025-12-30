package com.example.fastgptproject.service.impl;

import com.example.fastgptproject.entity.Feedback;
import com.example.fastgptproject.mapper.FeedbackMapper;
import com.example.fastgptproject.service.FeedbackService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 反馈服务实现类
 */
@Service
public class FeedbackServiceImpl implements FeedbackService {
    
    @Autowired
    private FeedbackMapper feedbackMapper;
    
    @Override
    public List<Feedback> getAllFeedbacks() {
        return feedbackMapper.findAllFeedbacks();
    }
    
    @Override
    public List<Feedback> getFeedbacksByUserId(Integer userId) {
        return feedbackMapper.findFeedbacksByUserId(userId);
    }
    
    @Override
    @Transactional
    public boolean createFeedback(Feedback feedback) {
        if (feedback.getUpTime() == null) {
            feedback.setUpTime(LocalDateTime.now());
        }
        return feedbackMapper.insertFeedback(feedback) > 0;
    }
    
    @Override
    @Transactional
    public boolean deleteFeedback(Integer fbId) {
        return feedbackMapper.deleteFeedback(fbId) > 0;
    }
}
