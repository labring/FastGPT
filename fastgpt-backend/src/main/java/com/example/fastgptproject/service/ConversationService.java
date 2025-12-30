package com.example.fastgptproject.service;

import com.example.fastgptproject.pojo.Conversation;

import java.util.List;
import java.util.Map;

/**
 * 对话记录服务接口
 */
public interface ConversationService {

    /**
     * 保存对话记录
     * @param conversation 对话记录对象
     * @return 保存后的对话记录
     */
    Conversation saveConversation(Conversation conversation);

    /**
     * 获取所有对话记录（分页）
     * @param page 页码
     * @param pageSize 每页大小
     * @return 包含列表和总数的Map
     */
    Map<String, Object> findAllConversations(int page, int pageSize);

    /**
     * 根据用户ID获取对话记录
     * @param userId 用户ID
     * @return 对话记录列表
     */
    List<Conversation> findByUserId(Integer userId);

    /**
     * 根据ID获取对话记录
     * @param id 对话记录ID
     * @return 对话记录
     */
    Conversation findById(Integer id);

    /**
     * 搜索对话记录
     * @param keyword 关键词
     * @param page 页码
     * @param pageSize 每页大小
     * @return 包含列表和总数的Map
     */
    Map<String, Object> searchConversations(String keyword, int page, int pageSize);

    /**
     * 删除对话记录
     * @param id 对话记录ID
     * @return 是否删除成功
     */
    boolean deleteConversation(Integer id);

    /**
     * 获取对话记录总数
     * @return 总数
     */
    int countConversations();
}
