package com.thors.module.chat;

import java.time.ZonedDateTime;

/** Cho com.thors.it.ChatIntegrationTest gọi lượt "đỡ lời" của ChatBot với giờ giả lập (thay cho chờ lịch mỗi phút). */
public final class ChatBotAccess {
    private ChatBotAccess() {}

    public static void answerWaiting(ChatBot bot, ZonedDateTime nowVn) {
        bot.answerWaiting(nowVn);
    }
}
