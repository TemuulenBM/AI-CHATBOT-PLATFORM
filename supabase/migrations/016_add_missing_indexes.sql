-- Migration 016: Дутуу index-үүдийг нэмэх
-- Эдгээр column-ууд WHERE clause-д байнга ашиглагддаг ч index байхгүй байсан
-- Index байхгүй бол Postgres sequential scan хийж, table өсөхөд query маш удаашрана

-- conversations.session_id — GET /api/chat/:chatbotId/:sessionId endpoint-д session_id-аар хайдаг
CREATE INDEX IF NOT EXISTS idx_conversations_session_id
  ON public.conversations(session_id);

-- embeddings.chatbot_id — embedding хайлт, устгалтад chatbot_id-аар шүүдэг
-- (ivfflat vector index нь chatbot_id-аар шүүхэд тус болохгүй)
CREATE INDEX IF NOT EXISTS idx_embeddings_chatbot_id
  ON public.embeddings(chatbot_id);

-- feedback.chatbot_id — satisfaction metrics endpoint-д chatbot_id-аар шүүдэг
CREATE INDEX IF NOT EXISTS idx_feedback_chatbot_id
  ON public.feedback(chatbot_id);

-- feedback.conversation_id — conversation-аар feedback шалгахад ашиглагдана
CREATE INDEX IF NOT EXISTS idx_feedback_conversation_id
  ON public.feedback(conversation_id);

-- conversations: chatbot_id + session_id composite index — хамгийн түгээмэл query pattern
CREATE INDEX IF NOT EXISTS idx_conversations_chatbot_session
  ON public.conversations(chatbot_id, session_id);
