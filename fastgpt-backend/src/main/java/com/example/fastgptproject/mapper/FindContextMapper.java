package com.example.fastgptproject.mapper;

import com.example.fastgptproject.pojo.Conversation;
import com.example.fastgptproject.dto.ConversationWithUser;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 对话记录 Mapper 接口
 * 对应 conversations 表
 */
@Mapper
public interface FindContextMapper {

    /**
     * 插入对话记录
     */
    int insertConversation(Conversation conversation);

    /**
     * 获取所有对话记录（分页）
     */
    List<Conversation> findAllConversations(@Param("offset") int offset, @Param("limit") int limit);

    /**
     * 获取所有对话记录（分页，包含用户信息）
     */
    List<ConversationWithUser> findAllConversationsWithUser(@Param("offset") int offset, @Param("limit") int limit);

    /**
     * 根据用户ID获取对话记录
     */
    List<Conversation> findConversationsByUserId(@Param("userId") Integer userId);

    /**
     * 根据ID获取对话记录
     */
    Conversation findConversationById(@Param("id") Integer id);

    /**
     * 删除对话记录
     */
    int deleteConversationById(@Param("id") Integer id);

    /**
     * 获取对话记录总数
     */
    int countConversations();

    /**
     * 搜索对话记录
     */
    List<Conversation> searchConversations(@Param("keyword") String keyword, @Param("offset") int offset, @Param("limit") int limit);
}
