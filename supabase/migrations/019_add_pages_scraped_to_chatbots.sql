-- Migration: chatbots table-д pages_scraped column нэмэх
-- Шалтгаан: pages_scraped зөвхөн scrape_history-д байсан, chatbots-д байхгүй байсан
-- UI-д "undefined scraped" гэж харагдаж байсан bug-ийг засна

ALTER TABLE chatbots
  ADD COLUMN IF NOT EXISTS pages_scraped INTEGER DEFAULT 0;

-- Одоо байгаа chatbot-уудын pages_scraped-г scrape_history-ээс бөглөх
-- Хамгийн сүүлийн completed scrape-ийн pages_scraped утгыг авна
UPDATE chatbots c
SET pages_scraped = COALESCE(
  (SELECT sh.pages_scraped
   FROM scrape_history sh
   WHERE sh.chatbot_id = c.id
     AND sh.status = 'completed'
   ORDER BY sh.completed_at DESC
   LIMIT 1),
  0
);

COMMENT ON COLUMN chatbots.pages_scraped IS 'Хамгийн сүүлд scrape хийсэн хуудасны тоо';
