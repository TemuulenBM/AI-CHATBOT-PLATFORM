-- Migration 017: pgvector index-г IVF-с HNSW-руу шинэчлэх
-- Яагаад: IVF (lists=100) нь 100K+ embedding-д recall quality буурна
-- HNSW нь автоматаар scale хийж, search accuracy илүү өндөр
-- Trade-off: Build time удаан, memory илүү зарцуулна — гэхдээ search хурд, accuracy илүү сайн

-- Embeddings хүснэгтийн vector index-г HNSW болгох
-- m=16: хөрш холболтын тоо (16 нь ихэнх тохиолдолд оновчтой)
-- ef_construction=64: build-ийн үеийн нарийвчлал (өндөр = илүү нарийн, удаан build)
DROP INDEX IF EXISTS idx_embeddings_vector;
CREATE INDEX idx_embeddings_vector ON public.embeddings
USING hnsw (embedding extensions.vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Knowledge base хүснэгтийн vector index-г HNSW болгох
DROP INDEX IF EXISTS idx_knowledge_base_embedding;
CREATE INDEX idx_knowledge_base_embedding ON public.knowledge_base
USING hnsw (embedding extensions.vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- HNSW search-ийн ef параметрийг тохируулах (session level)
-- ef=100: search-ийн үеийн нарийвчлал (default 40, бид 100 болгож accuracy-г нэмэгдүүлнэ)
-- Энэ нь зөвхөн энэ session-д хүчинтэй; application level-д SET LOCAL ашиглах хэрэгтэй
-- Application-с тохируулахыг хүсвэл query-ийн өмнө SET hnsw.ef_search = 100 ажиллуулна
COMMENT ON INDEX idx_embeddings_vector IS 'HNSW vector index: m=16, ef_construction=64. Search-д SET hnsw.ef_search = 100 ашиглах боломжтой';
COMMENT ON INDEX idx_knowledge_base_embedding IS 'HNSW vector index: m=16, ef_construction=64. Search-д SET hnsw.ef_search = 100 ашиглах боломжтой';
