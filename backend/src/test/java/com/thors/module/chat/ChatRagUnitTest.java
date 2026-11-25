package com.thors.module.chat;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.thors.common.ApiException;
import com.thors.module.chat.ChatKnowledge.Hit;
import com.thors.module.chat.ChatKnowledge.SyncResult;
import com.thors.module.chat.ChatKnowledgeRepository.ProductDoc;
import com.thors.module.chat.ChatKnowledgeRepository.Stored;
import com.thors.module.chat.ChatRepository.RecentOrder;
import com.thors.module.chat.GeminiClient.GeminiException;
import com.thors.module.order.delivery.GhnClient;
import com.thors.module.order.delivery.GhnClient.Step;
import com.thors.module.shop.repository.ShopRepository;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * Trợ lý AI - RAG: kho tri thức (embedding, tìm theo nghĩa) và các công cụ search_products, search_policies,
 * get_my_orders, track_order. Mỗi test ứng với một dòng UTC-CHAT-xxx trong sheet "Chat" của Report-5.1_Unit Test,
 * lập từ sơ đồ SD1-SD6 trong docs/CHAT_RAG.md. Gemini, DB và GHN được giả lập, không gọi mạng.
 */
@DisplayName("Trợ lý AI (RAG) - Unit Test")
class ChatRagUnitTest {
    private static final double EPS = 1e-6;
    private static final String MODEL = "gemini-embedding-001";
    private static final String HOURS = "08:00 – 22:00";
    private static final String PRODUCT_3 = "Áo Sơ Mi Linen. Danh mục: Áo. Vải linen thoáng mát";
    private static final String FAQ_0 = "Hỏi: Có freeship không?\nĐáp: Đơn từ 500.000 ₫ được miễn phí giao hàng.";

    private final ObjectMapper json = new ObjectMapper();
    private ChatKnowledgeRepository kRepo;
    private GeminiClient gemini;
    private ChatAutoReply settings;

    @BeforeEach
    void setUpCommon() {
        kRepo = mock(ChatKnowledgeRepository.class);
        gemini = mock(GeminiClient.class);
        settings = mock(ChatAutoReply.class);
        when(gemini.configured()).thenReturn(true);
        when(gemini.embeddingModel()).thenReturn(MODEL);
        when(gemini.json()).thenReturn(json);
        when(kRepo.ready()).thenReturn(true);
        when(settings.workingHoursText()).thenReturn(HOURS);
        when(settings.faqs()).thenReturn(List.of(
                new ChatAutoReply.Faq("orders", "Đơn hàng của tôi tới đâu rồi?", null),
                new ChatAutoReply.Faq("faq-0", "Có freeship không?", "Đơn từ 500.000 ₫ được miễn phí giao hàng.")));
    }

    private static ProductDoc linen(String description) {
        return new ProductDoc(3, "Áo Sơ Mi Linen", "Áo", description);
    }

    /** gemini.embed trả vector [0.1, 0.2] cho mỗi đoạn. */
    private void embedReturnsVectors() {
        when(gemini.embed(anyList(), anyString())).thenAnswer(inv -> {
            List<float[]> out = new ArrayList<>();
            for (int i = 0; i < ((List<?>) inv.getArgument(0)).size(); i++) out.add(new float[] {0.1f, 0.2f});
            return out;
        });
    }

    @SuppressWarnings("unchecked")
    private static ArgumentCaptor<List<String>> textsCaptor() {
        return ArgumentCaptor.forClass((Class<List<String>>) (Class<?>) List.class);
    }

    // =================================================================== ChatKnowledge.cosine

    @Nested
    @DisplayName("ChatKnowledge.cosine(float[] a, float[] b)")
    class Cosine {
        @Test
        @DisplayName("UTC-CHAT-001: Hai vector trùng nhau")
        void same() {
            assertEquals(1.0, ChatKnowledge.cosine(new float[] {1, 0}, new float[] {1, 0}), EPS);
        }

        @Test
        @DisplayName("UTC-CHAT-002: Hai vector vuông góc")
        void orthogonal() {
            assertEquals(0.0, ChatKnowledge.cosine(new float[] {1, 0}, new float[] {0, 1}), EPS);
        }

        @Test
        @DisplayName("UTC-CHAT-003: Cùng hướng, khác độ dài")
        void sameDirection() {
            assertEquals(1.0, ChatKnowledge.cosine(new float[] {1, 2, 3}, new float[] {2, 4, 6}), EPS);
        }

        @Test
        @DisplayName("UTC-CHAT-004: Vector 0 trả 0, không trả NaN")
        void zeroVector() {
            double r = ChatKnowledge.cosine(new float[] {0, 0}, new float[] {1, 1});
            assertFalse(Double.isNaN(r));
            assertEquals(0.0, r, EPS);
        }

        @Test
        @DisplayName("UTC-CHAT-005: Khác số chiều trả 0")
        void differentLength() {
            assertEquals(0.0, ChatKnowledge.cosine(new float[] {1, 0, 0}, new float[] {1, 0}), EPS);
        }
    }

    // =================================================================== ChatKnowledge.toBytes / fromBytes

    @Nested
    @DisplayName("ChatKnowledge.toBytes(float[] v) / ChatKnowledge.fromBytes(byte[] b)")
    class Bytes {
        @Test
        @DisplayName("UTC-CHAT-006: 3 số float thành 12 byte và đọc lại đúng")
        void roundTrip() {
            float[] v = {0.5f, -1.25f, 3.0f};
            byte[] b = ChatKnowledge.toBytes(v);
            assertEquals(12, b.length);
            assertArrayEquals(v, ChatKnowledge.fromBytes(b));
        }

        @Test
        @DisplayName("UTC-CHAT-007: Vector rỗng")
        void empty() {
            byte[] b = ChatKnowledge.toBytes(new float[0]);
            assertEquals(0, b.length);
            assertArrayEquals(new float[0], ChatKnowledge.fromBytes(b));
        }

        @Test
        @DisplayName("UTC-CHAT-008: 5 byte không chia hết cho 4")
        void invalidLength() {
            IllegalArgumentException e = assertThrows(IllegalArgumentException.class, () -> ChatKnowledge.fromBytes(new byte[5]));
            assertEquals("Dữ liệu vector không hợp lệ (5 byte).", e.getMessage());
        }
    }

    // =================================================================== ChatKnowledge.sync

    @Nested
    @DisplayName("ChatKnowledge.sync()")
    class Sync {
        private ChatKnowledge knowledge;

        @BeforeEach
        void setUp() {
            knowledge = new ChatKnowledge(kRepo, gemini, settings);
            when(kRepo.productsForIndex()).thenReturn(List.of(linen("Vải linen thoáng mát")));
        }

        /** 4 dòng đã lưu với hash đúng nội dung hiện tại. */
        private List<Stored> storedUpToDate() {
            List<String[]> policies = ChatKnowledge.policies(HOURS);
            return List.of(
                    new Stored("PRODUCT", "3", PRODUCT_3, ChatKnowledge.hash(MODEL, PRODUCT_3), new float[] {1, 0}),
                    new Stored("FAQ", "faq-0", FAQ_0, ChatKnowledge.hash(MODEL, FAQ_0), new float[] {1, 0}),
                    new Stored("POLICY", "return", policies.get(0)[1], ChatKnowledge.hash(MODEL, policies.get(0)[1]), new float[] {1, 0}),
                    new Stored("POLICY", "hours", policies.get(1)[1], ChatKnowledge.hash(MODEL, policies.get(1)[1]), new float[] {1, 0}));
        }

        @Test
        @DisplayName("UTC-CHAT-009: DB rỗng, tạo embedding cho 1 sản phẩm, 1 FAQ, 2 chính sách")
        void firstSync() {
            embedReturnsVectors();
            SyncResult r = knowledge.sync();

            ArgumentCaptor<List<String>> texts = textsCaptor();
            verify(gemini, times(1)).embed(texts.capture(), eq("RETRIEVAL_DOCUMENT"));
            List<String> sent = texts.getValue();
            assertEquals(4, sent.size());
            assertEquals(PRODUCT_3, sent.get(0));
            assertEquals(FAQ_0, sent.get(1));
            assertEquals(ChatKnowledge.RETURN_POLICY, sent.get(2));
            assertTrue(sent.get(3).contains(HOURS));
            assertFalse(sent.stream().anyMatch(t -> t.contains("tới đâu")));
            verify(kRepo).upsert(eq("PRODUCT"), eq("3"), eq(PRODUCT_3), anyString(), any(), eq(MODEL));
            verify(kRepo).upsert(eq("FAQ"), eq("faq-0"), eq(FAQ_0), anyString(), any(), eq(MODEL));
            verify(kRepo).upsert(eq("POLICY"), eq("return"), anyString(), anyString(), any(), eq(MODEL));
            verify(kRepo).upsert(eq("POLICY"), eq("hours"), anyString(), anyString(), any(), eq(MODEL));
            verify(kRepo, times(4)).upsert(anyString(), anyString(), anyString(), anyString(), any(), eq(MODEL));
            verify(kRepo, never()).upsert(eq("FAQ"), eq("orders"), any(), any(), any(), any());
            assertEquals(new SyncResult(4, 4, 0, null), r);
        }

        @Test
        @DisplayName("UTC-CHAT-010: Nội dung không đổi thì không gọi Gemini")
        void unchanged() {
            when(kRepo.loadAll()).thenReturn(storedUpToDate());
            SyncResult r = knowledge.sync();
            verify(gemini, never()).embed(anyList(), anyString());
            verify(kRepo, never()).upsert(any(), any(), any(), any(), any(), any());
            assertEquals(new SyncResult(4, 0, 0, null), r);
        }

        @Test
        @DisplayName("UTC-CHAT-011: Chỉ tạo lại embedding cho sản phẩm vừa đổi mô tả")
        void onlyChanged() {
            when(kRepo.loadAll()).thenReturn(storedUpToDate());
            when(kRepo.productsForIndex()).thenReturn(List.of(linen("Vải linen, form rộng")));
            embedReturnsVectors();
            SyncResult r = knowledge.sync();
            verify(gemini, times(1)).embed(List.of("Áo Sơ Mi Linen. Danh mục: Áo. Vải linen, form rộng"), "RETRIEVAL_DOCUMENT");
            verify(kRepo, times(1)).upsert(any(), any(), any(), any(), any(), any());
            verify(kRepo).upsert(eq("PRODUCT"), eq("3"), any(), any(), any(), any());
            assertEquals(new SyncResult(4, 1, 0, null), r);
        }

        @Test
        @DisplayName("UTC-CHAT-012: Xóa dòng của sản phẩm đã ngừng bán")
        void removesStale() {
            when(kRepo.loadAll()).thenReturn(storedUpToDate());
            when(kRepo.deleteExcept(any())).thenReturn(1);
            SyncResult r = knowledge.sync();
            verify(kRepo).deleteExcept(Set.of("PRODUCT:3", "FAQ:faq-0", "POLICY:return", "POLICY:hours"));
            assertEquals(new SyncResult(4, 0, 1, null), r);
        }

        @Test
        @DisplayName("UTC-CHAT-013: 120 đoạn chia thành lô 50, 50, 20")
        void batches() {
            List<ProductDoc> products = new ArrayList<>();
            for (int i = 1; i <= 118; i++) products.add(new ProductDoc(i, "SP " + i, "Áo", "Mô tả " + i));
            when(kRepo.productsForIndex()).thenReturn(products);
            when(settings.faqs()).thenReturn(List.of(new ChatAutoReply.Faq("orders", "Đơn hàng của tôi tới đâu rồi?", null)));
            embedReturnsVectors();

            SyncResult r = knowledge.sync();

            ArgumentCaptor<List<String>> texts = textsCaptor();
            verify(gemini, times(3)).embed(texts.capture(), eq("RETRIEVAL_DOCUMENT"));
            assertEquals(List.of(50, 50, 20), texts.getAllValues().stream().map(List::size).toList());
            assertEquals(new SyncResult(120, 120, 0, null), r);
        }

        @Test
        @DisplayName("UTC-CHAT-014: Mô tả HTML được bỏ thẻ và cắt còn 500 ký tự")
        void cleansDescription() {
            when(kRepo.productsForIndex()).thenReturn(List.of(linen("<p>Vải <b>linen</b></p>" + "a".repeat(800))));
            embedReturnsVectors();
            knowledge.sync();

            ArgumentCaptor<List<String>> texts = textsCaptor();
            verify(gemini).embed(texts.capture(), eq("RETRIEVAL_DOCUMENT"));
            String product = texts.getValue().get(0);
            String prefix = "Áo Sơ Mi Linen. Danh mục: Áo. ";
            assertFalse(product.contains("<"));
            assertTrue(product.startsWith(prefix + "Vải linen a"));
            String description = product.substring(prefix.length());
            assertEquals(501, description.length());
            assertTrue(description.endsWith("…"));
        }

        @Test
        @DisplayName("UTC-CHAT-015: Chưa có Gemini API key")
        void noKey() {
            when(gemini.configured()).thenReturn(false);
            assertEquals(new SyncResult(0, 0, 0, "Chưa cấu hình Gemini API key"), knowledge.sync());
            verify(kRepo, never()).productsForIndex();
            verify(gemini, never()).embed(anyList(), anyString());
        }

        @Test
        @DisplayName("UTC-CHAT-016: Chưa chạy migration")
        void noTable() {
            when(kRepo.ready()).thenReturn(false);
            assertEquals(new SyncResult(0, 0, 0, "Chưa chạy migration 2026-11-24_chat_rag.sql"), knowledge.sync());
            verify(gemini, never()).embed(anyList(), anyString());
        }

        @Test
        @DisplayName("UTC-CHAT-017: Gemini hết hạn mức (429)")
        void geminiQuota() {
            when(gemini.embed(anyList(), anyString())).thenThrow(new GeminiException("Gemini trả lỗi HTTP 429: quota", true));
            GeminiException e = assertThrows(GeminiException.class, () -> knowledge.sync());
            assertEquals("Gemini trả lỗi HTTP 429: quota", e.getMessage());
            verify(kRepo, never()).upsert(any(), any(), any(), any(), any(), any());
            verify(kRepo, never()).deleteExcept(any());
        }
    }

    // =================================================================== ChatKnowledge.search

    @Nested
    @DisplayName("ChatKnowledge.search(String query, Set<String> types, int k)")
    class Search {
        private ChatKnowledge knowledge;
        private final List<Stored> index = new ArrayList<>(List.of(
                new Stored("PRODUCT", "3", "SP 3", "h", new float[] {1, 0}),
                new Stored("PRODUCT", "5", "SP 5", "h", new float[] {0.97f, 0.243f}),
                new Stored("PRODUCT", "7", "SP 7", "h", new float[] {0, 1}),
                new Stored("FAQ", "faq-0", FAQ_0, "h", new float[] {1, 0})));

        @BeforeEach
        void setUp() {
            knowledge = new ChatKnowledge(kRepo, gemini, settings);
            when(gemini.embed(anyList(), eq("RETRIEVAL_QUERY"))).thenReturn(List.of(new float[] {1, 0}));
        }

        private void load() {
            when(kRepo.loadAll()).thenReturn(index);
            knowledge.reload();
        }

        @Test
        @DisplayName("UTC-CHAT-018: Lấy 2 sản phẩm gần nghĩa nhất, điểm giảm dần")
        void topK() {
            load();
            List<Hit> hits = knowledge.search("đồ đi biển", Set.of(ChatKnowledge.PRODUCT), 2);
            verify(gemini).embed(List.of("đồ đi biển"), "RETRIEVAL_QUERY");
            assertEquals(List.of("3", "5"), hits.stream().map(Hit::key).toList());
            assertEquals(1.0, hits.get(0).score(), EPS);
            assertEquals(0.97, hits.get(1).score(), 0.001);
            assertTrue(hits.stream().allMatch(h -> h.type().equals("PRODUCT")));
        }

        @Test
        @DisplayName("UTC-CHAT-019: Chỉ lấy đúng loại FAQ / POLICY")
        void filterTypes() {
            load();
            List<Hit> hits = knowledge.search("freeship", Set.of(ChatKnowledge.FAQ, ChatKnowledge.POLICY), 3);
            assertEquals(1, hits.size());
            assertEquals("FAQ", hits.get(0).type());
            assertEquals("faq-0", hits.get(0).key());
            assertEquals(1.0, hits.get(0).score(), EPS);
        }

        @Test
        @DisplayName("UTC-CHAT-020: Bỏ đoạn thấp hơn điểm cao nhất quá 0.05 và đoạn dưới 0.65")
        void threshold() {
            index.add(new Stored("PRODUCT", "8", "SP 8", "h", new float[] {0.9f, 0.436f}));
            index.add(new Stored("PRODUCT", "9", "SP 9", "h", new float[] {0.5f, 0.866f}));
            load();
            List<Hit> hits = knowledge.search("áo", Set.of(ChatKnowledge.PRODUCT), 5);
            assertEquals(List.of("3", "5"), hits.stream().map(Hit::key).toList());
        }

        @Test
        @DisplayName("UTC-CHAT-060: Đoạn tốt nhất vẫn dưới 0.65 thì không lấy gì")
        void bestBelowMin() {
            when(kRepo.loadAll()).thenReturn(List.of(new Stored("PRODUCT", "10", "SP 10", "h", new float[] {0.62f, 0.785f})));
            knowledge.reload();
            assertEquals(List.of(), knowledge.search("xe máy", Set.of(ChatKnowledge.PRODUCT), 5));
        }

        @Test
        @DisplayName("UTC-CHAT-021: Câu hỏi rỗng không gọi Gemini")
        void blankQuery() {
            load();
            assertEquals(List.of(), knowledge.search("   ", Set.of(ChatKnowledge.PRODUCT), 5));
            verify(gemini, never()).embed(anyList(), anyString());
        }

        @Test
        @DisplayName("UTC-CHAT-022: Chỉ mục rỗng không gọi Gemini")
        void emptyIndex() {
            when(kRepo.loadAll()).thenReturn(List.of());
            knowledge.reload();
            assertEquals(List.of(), knowledge.search("áo", Set.of(ChatKnowledge.PRODUCT), 5));
            verify(gemini, never()).embed(anyList(), anyString());
        }

        @Test
        @DisplayName("UTC-CHAT-023: Gemini mất kết nối thì ném lỗi cho nơi gọi xử lý")
        void geminiDown() {
            load();
            when(gemini.embed(anyList(), anyString()))
                    .thenThrow(new GeminiException("Không kết nối được Gemini (ResourceAccessException).", false));
            GeminiException e = assertThrows(GeminiException.class, () -> knowledge.search("áo", Set.of(ChatKnowledge.PRODUCT), 5));
            assertEquals("Không kết nối được Gemini (ResourceAccessException).", e.getMessage());
        }
    }

    // =================================================================== ChatBot: các công cụ

    /** Chung cho các công cụ của ChatBot: kho tri thức, DB chat, cửa hàng, GHN đều giả lập. */
    abstract class BotTools {
        ChatKnowledge knowledge;
        ChatRepository chats;
        ShopRepository shop;
        GhnClient ghn;
        ChatBot bot;

        @BeforeEach
        void setUpBot() {
            knowledge = mock(ChatKnowledge.class);
            chats = mock(ChatRepository.class);
            shop = mock(ShopRepository.class);
            ghn = mock(GhnClient.class);
            bot = new ChatBot(chats, settings, gemini, shop, knowledge, ghn);
        }

        JsonNode run(String tool, String argsJson) throws Exception {
            return bot.runTool(tool, json.readTree(argsJson), 5, json);
        }
    }

    private static Map<String, Object> row(int id, String name, long price, int stock) {
        return Map.of("productId", id, "productName", name, "categoryName", "Áo", "minPrice", price, "maxPrice", price, "totalStock", stock);
    }

    @Nested
    @DisplayName("ChatBot.runTool(\"search_products\", JsonNode args, int customerId)")
    class SearchProducts extends BotTools {
        private void linenProduct() {
            when(shop.findProduct(3)).thenReturn(Map.of("productName", "Áo Sơ Mi Linen", "categoryName", "Áo"));
            when(shop.findVariants(3)).thenReturn(List.of(Map.of("price", 199000, "stock", 2), Map.of("price", 219000, "stock", 0)));
        }

        @Test
        @DisplayName("UTC-CHAT-024: Tìm theo nghĩa ra sản phẩm dù tên không khớp")
        void semantic() throws Exception {
            when(knowledge.search("đồ đi biển", Set.of(ChatKnowledge.PRODUCT), 12))
                    .thenReturn(List.of(new Hit("PRODUCT", "3", PRODUCT_3, 0.82)));
            linenProduct();
            JsonNode r = run("search_products", "{\"query\":\"đồ đi biển\"}");
            JsonNode products = r.path("products");
            assertEquals(1, products.size());
            JsonNode p = products.get(0);
            assertEquals(3, p.path("product_id").asInt());
            assertEquals("Áo Sơ Mi Linen", p.path("name").asText());
            assertEquals("Áo", p.path("category").asText());
            assertEquals("199.000 ₫", p.path("price_from").asText());
            assertEquals("219.000 ₫", p.path("price_to").asText());
            assertTrue(p.path("in_stock").asBoolean());
            assertFalse(r.has("note"));
        }

        @Test
        @DisplayName("UTC-CHAT-025: Gộp kết quả theo nghĩa và theo tên, không trùng")
        void mergeNoDuplicate() throws Exception {
            when(knowledge.search(any(), any(), anyInt())).thenReturn(List.of(new Hit("PRODUCT", "3", PRODUCT_3, 0.82)));
            linenProduct();
            when(shop.findProducts("áo sơ mi", null, null, 0, 12))
                    .thenReturn(List.of(row(3, "Áo Sơ Mi Linen", 199000, 2), row(8, "Áo Sơ Mi Trắng", 150000, 5)));
            JsonNode r = run("search_products", "{\"query\":\"áo sơ mi\"}");
            List<Integer> ids = new ArrayList<>();
            r.path("products").forEach(p -> ids.add(p.path("product_id").asInt()));
            assertEquals(List.of(3, 8), ids);
        }

        @Test
        @DisplayName("UTC-CHAT-026: Bỏ sản phẩm đã ngừng bán")
        void skipsStopped() throws Exception {
            when(knowledge.search(any(), any(), anyInt()))
                    .thenReturn(List.of(new Hit("PRODUCT", "4", "SP 4", 0.9), new Hit("PRODUCT", "3", PRODUCT_3, 0.8)));
            when(shop.findProduct(4)).thenReturn(null);
            linenProduct();
            JsonNode r = run("search_products", "{\"query\":\"áo đi biển\"}");
            assertEquals(1, r.path("products").size());
            assertEquals(3, r.path("products").get(0).path("product_id").asInt());
        }

        @Test
        @DisplayName("UTC-CHAT-027: Sản phẩm không còn biến thể bán online")
        void noVariants() throws Exception {
            when(knowledge.search(any(), any(), anyInt())).thenReturn(List.of(new Hit("PRODUCT", "3", PRODUCT_3, 0.82)));
            when(shop.findProduct(3)).thenReturn(Map.of("productName", "Áo Sơ Mi Linen", "categoryName", "Áo"));
            when(shop.findVariants(3)).thenReturn(List.of());
            JsonNode r = run("search_products", "{\"query\":\"áo đi biển\"}");
            assertEquals(0, r.path("products").size());
            assertEquals("Không tìm thấy sản phẩm phù hợp", r.path("note").asText());
        }

        @Test
        @DisplayName("UTC-CHAT-028: Vượt ngân sách khách nêu")
        void overBudget() throws Exception {
            when(knowledge.search(any(), any(), anyInt())).thenReturn(List.of(new Hit("PRODUCT", "3", PRODUCT_3, 0.82)));
            when(shop.findProduct(3)).thenReturn(Map.of("productName", "Áo Sơ Mi Linen", "categoryName", "Áo"));
            when(shop.findVariants(3)).thenReturn(List.of(Map.of("price", 250000, "stock", 2)));
            JsonNode r = run("search_products", "{\"query\":\"áo đi biển\",\"max_price\":200000}");
            assertEquals(0, r.path("products").size());
            assertEquals("Không tìm thấy sản phẩm phù hợp", r.path("note").asText());
        }

        @Test
        @DisplayName("UTC-CHAT-029: Tìm theo nghĩa lỗi thì quay về tìm theo tên")
        void fallbackToName() throws Exception {
            when(knowledge.search(any(), any(), anyInt())).thenThrow(new GeminiException("Gemini trả lỗi HTTP 429: quota", true));
            when(shop.findProducts("giày", null, null, 0, 12)).thenReturn(List.of(row(3, "Giày Da Nam", 500000, 4)));
            JsonNode r = run("search_products", "{\"query\":\"giày màu đen\"}");
            assertEquals(3, r.path("products").get(0).path("product_id").asInt());
            assertTrue(r.path("note").asText().contains("\"giày\""));
        }

        @Test
        @DisplayName("UTC-CHAT-030: Không có gì phù hợp")
        void nothing() throws Exception {
            JsonNode r = run("search_products", "{\"query\":\"xe máy\"}");
            assertEquals(0, r.path("products").size());
            assertEquals("Không tìm thấy sản phẩm phù hợp", r.path("note").asText());
        }
    }

    @Nested
    @DisplayName("ChatBot.runTool(\"search_policies\", JsonNode args, int customerId)")
    class SearchPolicies extends BotTools {
        private void assertFallback(JsonNode r) {
            JsonNode results = r.path("results");
            assertEquals(3, results.size());
            assertEquals(FAQ_0, results.get(0).asText());
            assertEquals(ChatKnowledge.RETURN_POLICY, results.get(1).asText());
            assertTrue(results.get(2).asText().contains(HOURS));
            results.forEach(t -> assertFalse(t.asText().contains("tới đâu")));
            assertEquals(ChatBot.POLICY_FALLBACK_NOTE, r.path("note").asText());
            assertEquals("Không tìm được đoạn sát nghĩa, đây là toàn bộ chính sách và câu hỏi thường gặp của cửa hàng.", r.path("note").asText());
        }

        @Test
        @DisplayName("UTC-CHAT-031: Trả đúng đoạn FAQ liên quan")
        void found() throws Exception {
            when(knowledge.search("có freeship không", Set.of(ChatKnowledge.FAQ, ChatKnowledge.POLICY), 3))
                    .thenReturn(List.of(new Hit("FAQ", "faq-0", FAQ_0, 0.77)));
            JsonNode r = run("search_policies", "{\"query\":\"có freeship không\"}");
            assertEquals(1, r.path("results").size());
            assertEquals(FAQ_0, r.path("results").get(0).asText());
            assertFalse(r.has("note"));
        }

        @Test
        @DisplayName("UTC-CHAT-032: Tìm theo nghĩa lỗi thì trả toàn bộ FAQ + chính sách")
        void errorFallback() throws Exception {
            when(knowledge.search(any(), any(), anyInt())).thenThrow(new GeminiException("Gemini trả lỗi HTTP 429: quota", true));
            assertFallback(run("search_policies", "{\"query\":\"đổi trả thế nào\"}"));
        }

        @Test
        @DisplayName("UTC-CHAT-033: Không đoạn nào đạt ngưỡng")
        void emptyFallback() throws Exception {
            when(knowledge.search(any(), any(), anyInt())).thenReturn(List.of());
            assertFallback(run("search_policies", "{\"query\":\"shop ở đâu\"}"));
        }

        @Test
        @DisplayName("UTC-CHAT-034: Không có query")
        void noQuery() throws Exception {
            when(knowledge.search(any(), any(), anyInt())).thenReturn(List.of());
            JsonNode r = run("search_policies", "{}");
            verify(knowledge).search("", Set.of(ChatKnowledge.FAQ, ChatKnowledge.POLICY), 3);
            assertFallback(r);
        }
    }

    /** Đơn ORD-100 đang giao bằng GHN (dùng cho get_my_orders và track_order). */
    private static RecentOrder ghnOrder() {
        return new RecentOrder(100, "ORD-100", "SHIPPING", LocalDateTime.of(2026, 11, 23, 2, 0), 230000, "GHN", "GHN123",
                null, null, "Áo Thun (L Trắng) x2", "IN_TRANSIT", LocalDateTime.of(2026, 11, 24, 1, 5));
    }

    private static RecentOrder pendingOrder() {
        return new RecentOrder(101, "ORD-101", "PENDING_CONFIRMATION", LocalDateTime.of(2026, 11, 23, 2, 0), 230000, null, null,
                null, null, "Áo Thun (L Trắng) x2", null, null);
    }

    @Nested
    @DisplayName("ChatBot.runTool(\"get_my_orders\", JsonNode args, int customerId)")
    class MyOrders extends BotTools {
        @Test
        @DisplayName("UTC-CHAT-035: Đơn đang giao có trạng thái giao hàng và giờ cập nhật")
        void shipping() throws Exception {
            when(chats.recentOrders(5, 5)).thenReturn(List.of(ghnOrder()));
            JsonNode o = run("get_my_orders", "{}").path("orders").get(0);
            assertEquals("ORD-100", o.path("order_number").asText());
            assertEquals("Đang giao", o.path("status").asText());
            assertEquals("23/11/2026", o.path("order_date").asText());
            assertEquals("230.000 ₫", o.path("total").asText());
            assertEquals("Giao Hàng Nhanh", o.path("carrier").asText());
            assertEquals("GHN123", o.path("tracking_number").asText());
            assertEquals("Đơn vị vận chuyển đang giao", o.path("shipping_status").asText());
            assertEquals("08:05 24/11/2026", o.path("shipping_updated").asText());
        }

        @Test
        @DisplayName("UTC-CHAT-036: Đơn chờ xác nhận chưa có thông tin giao hàng")
        void pending() throws Exception {
            when(chats.recentOrders(5, 5)).thenReturn(List.of(pendingOrder()));
            JsonNode o = run("get_my_orders", "{}").path("orders").get(0);
            assertEquals("Chờ cửa hàng xác nhận", o.path("status").asText());
            assertFalse(o.has("shipping_status"));
            assertFalse(o.has("shipping_updated"));
            assertFalse(o.has("carrier"));
        }

        @Test
        @DisplayName("UTC-CHAT-037: Trạng thái giao hàng lạ giữ nguyên")
        void unknownShipment() throws Exception {
            when(chats.recentOrders(5, 5)).thenReturn(List.of(new RecentOrder(100, "ORD-100", "SHIPPING",
                    LocalDateTime.of(2026, 11, 23, 2, 0), 230000, "GHN", "GHN123", null, null, "x", "XYZ", null)));
            JsonNode o = run("get_my_orders", "{}").path("orders").get(0);
            assertEquals("XYZ", o.path("shipping_status").asText());
            assertFalse(o.has("shipping_updated"));
        }

        @Test
        @DisplayName("UTC-CHAT-038: Khách chưa có đơn")
        void noOrders() throws Exception {
            when(chats.recentOrders(5, 5)).thenReturn(List.of());
            JsonNode r = run("get_my_orders", "{}");
            assertEquals(0, r.path("orders").size());
            assertEquals("Khách chưa có đơn hàng online nào", r.path("note").asText());
        }
    }

    @Nested
    @DisplayName("ChatBot.runTool(\"track_order\", JsonNode args, int customerId)")
    class TrackOrder extends BotTools {
        private void ghnJourney() {
            when(ghn.isConfigured()).thenReturn(true);
            when(ghn.journey("GHN123")).thenReturn(List.of(
                    new Step("ready_to_pick", "2026-11-23T02:00:00Z"),
                    new Step("picked", "2026-11-23T03:20:00Z"),
                    new Step("delivering", "2026-11-24T01:05:00Z")));
        }

        private void assertJourney(JsonNode r) {
            ArrayNode journey = (ArrayNode) r.path("journey");
            assertEquals(3, journey.size());
            assertEquals("09:00 23/11/2026", journey.get(0).path("time").asText());
            assertEquals("Chờ GHN đến lấy hàng", journey.get(0).path("event").asText());
            assertEquals("10:20 23/11/2026", journey.get(1).path("time").asText());
            assertEquals("GHN đã lấy hàng", journey.get(1).path("event").asText());
            assertEquals("08:05 24/11/2026", journey.get(2).path("time").asText());
            assertEquals("Nhân viên GHN đang giao đến bạn", journey.get(2).path("event").asText());
        }

        @Test
        @DisplayName("UTC-CHAT-039: Đơn GHN có hành trình đầy đủ")
        void journey() throws Exception {
            when(chats.ownOrder(5, "ORD-100")).thenReturn(Optional.of(ghnOrder()));
            ghnJourney();
            JsonNode r = run("track_order", "{\"order_number\":\"ORD-100\"}");
            assertEquals("ORD-100", r.path("order_number").asText());
            assertEquals("Đang giao", r.path("status").asText());
            assertEquals("Đơn vị vận chuyển đang giao", r.path("shipping_status").asText());
            assertJourney(r);
            assertFalse(r.has("note"));
        }

        @Test
        @DisplayName("UTC-CHAT-040: Mã đơn có khoảng trắng được bỏ đi")
        void trims() throws Exception {
            when(chats.ownOrder(5, "ord-100")).thenReturn(Optional.of(ghnOrder()));
            ghnJourney();
            JsonNode r = run("track_order", "{\"order_number\":\" ord-100 \"}");
            verify(chats).ownOrder(5, "ord-100");
            assertJourney(r);
        }

        @Test
        @DisplayName("UTC-CHAT-041: Sai mã hoặc đơn của khách khác")
        void notOwn() throws Exception {
            when(chats.ownOrder(5, "ORD-999")).thenReturn(Optional.empty());
            JsonNode r = run("track_order", "{\"order_number\":\"ORD-999\"}");
            assertEquals("Không tìm thấy đơn ORD-999 trong các đơn của bạn.", r.path("error").asText());
            verify(ghn, never()).journey(any());
        }

        @Test
        @DisplayName("UTC-CHAT-042: Không có mã đơn")
        void blank() throws Exception {
            JsonNode r = run("track_order", "{\"order_number\":\"  \"}");
            assertEquals("Vui lòng cho biết mã đơn hàng cần tra.", r.path("error").asText());
            verify(chats, never()).ownOrder(anyInt(), any());
        }

        @Test
        @DisplayName("UTC-CHAT-043: GHN lỗi thì trả trạng thái trong DB")
        void ghnDown() throws Exception {
            when(chats.ownOrder(5, "ORD-100")).thenReturn(Optional.of(ghnOrder()));
            when(ghn.isConfigured()).thenReturn(true);
            when(ghn.journey("GHN123")).thenThrow(new ApiException(502, "GHN_UNREACHABLE", "Không kết nối được GHN, vui lòng thử lại."));
            JsonNode r = run("track_order", "{\"order_number\":\"ORD-100\"}");
            assertFalse(r.has("journey"));
            assertEquals("Đơn vị vận chuyển đang giao", r.path("shipping_status").asText());
            assertEquals("Chưa lấy được hành trình từ GHN lúc này, đây là trạng thái mới nhất cửa hàng ghi nhận.", r.path("note").asText());
        }

        @Test
        @DisplayName("UTC-CHAT-044: GHN chưa cấu hình")
        void ghnNotConfigured() throws Exception {
            when(chats.ownOrder(5, "ORD-100")).thenReturn(Optional.of(ghnOrder()));
            when(ghn.isConfigured()).thenReturn(false);
            JsonNode r = run("track_order", "{\"order_number\":\"ORD-100\"}");
            assertEquals("Chưa lấy được hành trình từ GHN lúc này, đây là trạng thái mới nhất cửa hàng ghi nhận.", r.path("note").asText());
            verify(ghn, never()).journey(any());
        }

        @Test
        @DisplayName("UTC-CHAT-045: Đơn cửa hàng tự giao")
        void selfDelivery() throws Exception {
            when(chats.ownOrder(5, "ORD-100")).thenReturn(Optional.of(new RecentOrder(100, "ORD-100", "SHIPPING",
                    LocalDateTime.of(2026, 11, 23, 2, 0), 230000, "SELF", null, null, null, "x", null, null)));
            JsonNode r = run("track_order", "{\"order_number\":\"ORD-100\"}");
            assertEquals("Đang giao", r.path("status").asText());
            assertEquals("Đơn do cửa hàng tự giao nên không có hành trình chi tiết.", r.path("note").asText());
            verify(ghn, never()).journey(any());
        }

        @Test
        @DisplayName("UTC-CHAT-046: Đơn chưa giao cho đơn vị vận chuyển")
        void notShipped() throws Exception {
            when(chats.ownOrder(5, "ORD-101")).thenReturn(Optional.of(pendingOrder()));
            JsonNode r = run("track_order", "{\"order_number\":\"ORD-101\"}");
            assertEquals("Chờ cửa hàng xác nhận", r.path("status").asText());
            assertEquals("Đơn chưa được giao cho đơn vị vận chuyển.", r.path("note").asText());
            verify(ghn, never()).journey(any());
        }

        @Test
        @DisplayName("UTC-CHAT-047: Trạng thái GHN lạ và thời gian không đọc được")
        void unknownStep() throws Exception {
            when(chats.ownOrder(5, "ORD-100")).thenReturn(Optional.of(ghnOrder()));
            when(ghn.isConfigured()).thenReturn(true);
            when(ghn.journey("GHN123")).thenReturn(List.of(new Step("abc_new", "")));
            JsonNode journey = run("track_order", "{\"order_number\":\"ORD-100\"}").path("journey");
            assertEquals(1, journey.size());
            assertEquals("", journey.get(0).path("time").asText());
            assertEquals("abc_new", journey.get(0).path("event").asText());
        }

        @Test
        @DisplayName("UTC-CHAT-048: Bỏ qua customer_id mô hình tự đưa vào, chỉ dùng khách của cuộc chat")
        void ignoresCustomerIdFromArgs() throws Exception {
            when(chats.ownOrder(5, "ORD-100")).thenReturn(Optional.of(ghnOrder()));
            ghnJourney();
            run("track_order", "{\"order_number\":\"ORD-100\",\"customer_id\":99}");
            verify(chats).ownOrder(5, "ORD-100");
            verify(chats, never()).ownOrder(eq(99), any());
        }
    }

    // =================================================================== GhnClient.parseJourney

    @Nested
    @DisplayName("GhnClient.parseJourney(JsonNode data)")
    class ParseJourney {
        @Test
        @DisplayName("UTC-CHAT-049: Sắp các mốc theo thời gian tăng dần")
        void sorted() throws Exception {
            List<Step> steps = GhnClient.parseJourney(json.readTree(
                    "{\"log\":[{\"status\":\"picked\",\"updated_date\":\"2026-11-23T03:20:00Z\"},"
                            + "{\"status\":\"ready_to_pick\",\"updated_date\":\"2026-11-23T02:00:00Z\"}]}"));
            assertEquals(List.of(new Step("ready_to_pick", "2026-11-23T02:00:00Z"), new Step("picked", "2026-11-23T03:20:00Z")), steps);
        }

        @Test
        @DisplayName("UTC-CHAT-050: log là một object")
        void singleObject() throws Exception {
            List<Step> steps = GhnClient.parseJourney(json.readTree(
                    "{\"log\":{\"status\":\"delivered\",\"updated_date\":\"2026-11-24T05:00:00Z\"}}"));
            assertEquals(List.of(new Step("delivered", "2026-11-24T05:00:00Z")), steps);
        }

        @Test
        @DisplayName("UTC-CHAT-051: Không có log")
        void noLog() throws Exception {
            assertEquals(List.of(), GhnClient.parseJourney(json.readTree("{\"status\":\"picked\"}")));
        }

        @Test
        @DisplayName("UTC-CHAT-052: Bỏ mốc không có trạng thái")
        void skipsBlankStatus() throws Exception {
            List<Step> steps = GhnClient.parseJourney(json.readTree(
                    "{\"log\":[{\"status\":\"\",\"updated_date\":\"2026-11-23T02:00:00Z\"},"
                            + "{\"status\":\"picked\",\"updated_date\":\"2026-11-23T03:20:00Z\"}]}"));
            assertEquals(List.of(new Step("picked", "2026-11-23T03:20:00Z")), steps);
        }
    }

    // =================================================================== GeminiClient

    @Nested
    @DisplayName("GeminiClient.parseEmbeddings(String raw, int expected)")
    class ParseEmbeddings {
        @Test
        @DisplayName("UTC-CHAT-053: Đọc 2 vector")
        void two() {
            List<float[]> v = GeminiClient.parseEmbeddings("{\"embeddings\":[{\"values\":[0.1,0.2]},{\"values\":[0.3,0.4]}]}", 2);
            assertEquals(2, v.size());
            assertArrayEquals(new float[] {0.1f, 0.2f}, v.get(0));
            assertArrayEquals(new float[] {0.3f, 0.4f}, v.get(1));
        }

        @Test
        @DisplayName("UTC-CHAT-054: Thiếu vector")
        void missingOne() {
            GeminiException e = assertThrows(GeminiException.class,
                    () -> GeminiClient.parseEmbeddings("{\"embeddings\":[{\"values\":[0.1,0.2]}]}", 2));
            assertEquals("Gemini trả số embedding không khớp (1/2).", e.getMessage());
        }

        @Test
        @DisplayName("UTC-CHAT-055: Không có trường embeddings")
        void noField() {
            GeminiException e = assertThrows(GeminiException.class, () -> GeminiClient.parseEmbeddings("{}", 2));
            assertEquals("Gemini trả số embedding không khớp (0/2).", e.getMessage());
        }

        @Test
        @DisplayName("UTC-CHAT-056: Không phải JSON")
        void notJson() {
            GeminiException e = assertThrows(GeminiException.class, () -> GeminiClient.parseEmbeddings("not json", 1));
            assertEquals("Không đọc được embedding của Gemini.", e.getMessage());
        }
    }

    @Nested
    @DisplayName("GeminiClient.embed(List<String> texts, String taskType)")
    class Embed {
        @Test
        @DisplayName("UTC-CHAT-057: Chưa có API key")
        void noKey() {
            GeminiClient client = new GeminiClient("", null, "https://generativelanguage.googleapis.com/v1beta", null, 768);
            GeminiException e = assertThrows(GeminiException.class, () -> client.embed(List.of("áo"), "RETRIEVAL_QUERY"));
            assertEquals("Chưa cấu hình Gemini API key.", e.getMessage());
        }

        @Test
        @DisplayName("UTC-CHAT-058: Danh sách rỗng không gọi mạng")
        void emptyList() {
            GeminiClient client = new GeminiClient("k", null, "http://127.0.0.1:1", null, 768);
            assertEquals(List.of(), client.embed(List.of(), "RETRIEVAL_DOCUMENT"));
        }
    }

    // =================================================================== ChatKnowledge.descriptionText

    private static final String JSON_DESCRIPTION =
            "{\"v\":1,\"intro\":\"Áo phông dáng suông thoáng mát.\",\"highlights\":[\"breathable\",\"durable\",\"xyz\"],"
                    + "\"material\":\"100% Cotton\",\"fit\":\"Regular\",\"suitable\":\"Đi biển, đi chơi\",\"features\":\"\","
                    + "\"care\":\"Giặt máy\",\"returns\":\"7 ngày\",\"imageColors\":{\"https://x/a.jpg\":\"Be\"}}";
    private static final String JSON_DESCRIPTION_TEXT =
            "Áo phông dáng suông thoáng mát. Nổi bật: Thoáng khí, Bền bỉ. Chất liệu: 100% Cotton. Kiểu dáng: Regular. Phù hợp: Đi biển, đi chơi";

    @Nested
    @DisplayName("ChatKnowledge.descriptionText(String raw)")
    class DescriptionText {
        @Test
        @DisplayName("UTC-CHAT-061: Chữ thường giữ nguyên")
        void plain() {
            assertEquals("Vải linen thoáng mát", ChatKnowledge.descriptionText("Vải linen thoáng mát"));
        }

        @Test
        @DisplayName("UTC-CHAT-062: JSON có cấu trúc thành chữ dễ đọc")
        void structured() {
            String text = ChatKnowledge.descriptionText(JSON_DESCRIPTION);
            assertEquals(JSON_DESCRIPTION_TEXT, text);
            assertFalse(text.contains("Giặt máy"));
            assertFalse(text.contains("7 ngày"));
            assertFalse(text.contains("https://"));
            assertFalse(text.contains("breathable"));
            assertFalse(text.contains("xyz"));
        }

        @Test
        @DisplayName("UTC-CHAT-063: JSON chỉ có ảnh theo màu")
        void onlyImageColors() {
            assertEquals("", ChatKnowledge.descriptionText("{\"v\":1,\"imageColors\":{\"https://x/a.jpg\":\"Be\"}}"));
        }

        @Test
        @DisplayName("UTC-CHAT-064: JSON hỏng coi là chữ thường")
        void brokenJson() {
            assertEquals("{abc", ChatKnowledge.descriptionText("{abc"));
        }

        @Test
        @DisplayName("UTC-CHAT-065: JSON không có trường v coi là chữ thường")
        void jsonWithoutVersion() {
            assertEquals("{\"intro\":\"x\"}", ChatKnowledge.descriptionText("{\"intro\":\"x\"}"));
        }

        @Test
        @DisplayName("UTC-CHAT-066: null")
        void nullDescription() {
            assertEquals("", ChatKnowledge.descriptionText(null));
        }

        @Test
        @DisplayName("UTC-CHAT-067: Bỏ thẻ HTML")
        void html() {
            assertEquals("Vải linen", ChatKnowledge.descriptionText("<p>Vải <b>linen</b></p>"));
        }
    }

    @Nested
    @DisplayName("ChatBot.runTool(\"get_product\", JsonNode args, int customerId)")
    class GetProduct extends BotTools {
        @Test
        @DisplayName("UTC-CHAT-068: Mô tả JSON được đổi sang chữ trước khi đưa cho mô hình")
        void jsonDescription() throws Exception {
            when(shop.findProduct(17)).thenReturn(Map.of("productName", "Áo Thun Cổ Tròn Basic", "categoryName", "Áo", "description", JSON_DESCRIPTION));
            when(shop.findVariants(17)).thenReturn(List.of(Map.of("size", "L", "color", "Trắng", "price", 180000, "stock", 3)));
            JsonNode r = run("get_product", "{\"product_id\":17}");
            assertEquals(JSON_DESCRIPTION_TEXT, r.path("description").asText());
            assertFalse(r.path("description").asText().contains("{"));
            JsonNode v = r.path("variants").get(0);
            assertEquals("L", v.path("size").asText());
            assertEquals("Trắng", v.path("color").asText());
            assertEquals("180.000 ₫", v.path("price").asText());
            assertEquals(3, v.path("available").asInt());
        }
    }

    // =================================================================== GeminiClient.retryOn503

    @Nested
    @DisplayName("GeminiClient.retryOn503(Supplier<T> call, LongConsumer sleep)")
    class RetryOn503 {
        private final List<Long> slept = new ArrayList<>();
        private int calls;

        @Test
        @DisplayName("UTC-CHAT-069: Thành công ngay lần đầu")
        void firstTime() {
            String r = GeminiClient.retryOn503(() -> {
                calls++;
                return "ok";
            }, slept::add);
            assertEquals("ok", r);
            assertEquals(1, calls);
            assertEquals(List.of(), slept);
        }

        @Test
        @DisplayName("UTC-CHAT-070: 503 rồi thành công ở lần 2")
        void retriesOnce() {
            String r = GeminiClient.retryOn503(() -> {
                if (++calls == 1) throw new GeminiException("Gemini trả lỗi HTTP 503: high demand", false, 503);
                return "ok";
            }, slept::add);
            assertEquals("ok", r);
            assertEquals(2, calls);
            assertEquals(List.of(3000L), slept);
        }

        @Test
        @DisplayName("UTC-CHAT-071: 503 cả 2 lần thì ném lỗi của lần 2, không thử lần 3")
        void twice503() {
            GeminiException e = assertThrows(GeminiException.class, () -> GeminiClient.retryOn503(() -> {
                calls++;
                throw new GeminiException(calls == 1 ? "Gemini trả lỗi HTTP 503: high demand" : "Gemini trả lỗi HTTP 503: still busy", false, 503);
            }, slept::add));
            assertEquals("Gemini trả lỗi HTTP 503: still busy", e.getMessage());
            assertEquals(2, calls);
            assertEquals(1, slept.size());
        }

        @Test
        @DisplayName("UTC-CHAT-072: 429 hết hạn mức thì không thử lại")
        void quotaNoRetry() {
            GeminiException e = assertThrows(GeminiException.class, () -> GeminiClient.retryOn503(() -> {
                calls++;
                throw new GeminiException("Gemini trả lỗi HTTP 429: quota", true, 429);
            }, slept::add));
            assertEquals("Gemini trả lỗi HTTP 429: quota", e.getMessage());
            assertEquals(1, calls);
            assertEquals(List.of(), slept);
        }

        @Test
        @DisplayName("UTC-CHAT-073: Mất kết nối thì không thử lại")
        void connectionNoRetry() {
            GeminiException e = assertThrows(GeminiException.class, () -> GeminiClient.retryOn503(() -> {
                calls++;
                throw new GeminiException("Không kết nối được Gemini (ResourceAccessException).", false);
            }, slept::add));
            assertEquals("Không kết nối được Gemini (ResourceAccessException).", e.getMessage());
            assertEquals(1, calls);
            assertEquals(List.of(), slept);
        }
    }

    // =================================================================== ChatBot.toolDeclarations

    @Nested
    @DisplayName("ChatBot.toolDeclarations(ObjectMapper json)")
    class Tools {
        @Test
        @DisplayName("UTC-CHAT-059: Đủ 6 công cụ theo thứ tự")
        void names() {
            List<String> names = new ArrayList<>();
            ChatBot.toolDeclarations(json).forEach(t -> names.add(t.path("name").asText()));
            assertEquals(List.of("search_products", "search_policies", "get_product", "get_my_orders", "track_order", "handoff_to_staff"), names);
        }
    }
}
