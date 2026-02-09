-- Migration 018: Нийт message тоо тоолох SQL функц
-- Яагаад: Dashboard-ийн JS код бүх conversation-ийн JSONB messages-г татаж тоолж байсан
-- Энэ нь network payload маш том болгодог. SQL-д тоолж зөвхөн тоо буцааж оновчлов.

CREATE OR REPLACE FUNCTION public.get_total_message_count(
  p_chatbot_ids UUID[]
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT COALESCE(SUM(jsonb_array_length(messages)), 0)
    FROM public.conversations
    WHERE chatbot_id = ANY(p_chatbot_ids)
  );
END;
$$;

COMMENT ON FUNCTION public.get_total_message_count IS 'Dashboard-д ашиглах: бүх JSONB messages-г JS-руу татахгүйгээр SQL-д тоолно';
