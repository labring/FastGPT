package com.example.fastgptproject.mapper;

import com.example.fastgptproject.entity.Feedback;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 反馈 Mapper 接口
 */
@Mapper
public interface FeedbackMapper {
    
    /**
     * 查询所有反馈（联合查询用户信息）
     */
    List<Feedback> findAllFeedbacks();
    
    /**
     * 根据用户ID查询反馈
     */
    List<Feedback> findFeedbacksByUserId(@Param("userId") Integer userId);
    
    /**
     * 根据ID查询反馈
     */
    Feedback findFeedbackById(@Param("fbId") Integer fbId);
    
    /**
     * 创建反馈
     */
    int insertFeedback(Feedback feedback);
    
    /**
     * 删除反馈
     */
    int deleteFeedback(@Param("fbId") Integer fbId);
}
