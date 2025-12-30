package com.example.fastgptproject.mapper;

import com.example.fastgptproject.pojo.Conversation;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

/**
 * 对话记录视图 Mapper - 使用安全视图查询
 */
@Mapper
public interface ChatLogViewMapper {

    /**
     * 从视图查询所有对话记录（包含用户信息）
     */
    @Select("SELECT id, user_id, username, email, question, answer, category, create_time, " +
            "share_id, out_link_uid, app_id, chat_id, ip_address " +
            "FROM v_chat_logs_with_user " +
            "ORDER BY create_time DESC")
    List<Map<String, Object>> findAllChatLogsFromView();

    /**
     * 从视图根据用户ID查询对话记录
     */
    @Select("SELECT id, user_id, username, email, question, answer, category, create_time, " +
            "share_id, out_link_uid, app_id, chat_id, ip_address " +
            "FROM v_chat_logs_with_user " +
            "WHERE user_id = #{userId} " +
            "ORDER BY create_time DESC")
    List<Map<String, Object>> findChatLogsByUserIdFromView(Integer userId);

    /**
     * 从视图根据分类查询对话记录
     */
    @Select("SELECT id, user_id, username, email, question, answer, category, create_time, " +
            "share_id, out_link_uid, app_id, chat_id, ip_address " +
            "FROM v_chat_logs_with_user " +
            "WHERE category = #{category} " +
            "ORDER BY create_time DESC")
    List<Map<String, Object>> findChatLogsByCategoryFromView(String category);

    /**
     * 查询对话统计数据（按分类）
     */
    @Select("SELECT category, total_count, unique_users, first_chat_time, last_chat_time " +
            "FROM v_chat_stats_by_category " +
            "ORDER BY total_count DESC")
    List<Map<String, Object>> getChatStatsByCategory();
}
