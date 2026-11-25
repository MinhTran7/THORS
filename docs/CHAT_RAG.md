# Trợ lý AI trong chat: RAG

Trợ lý AI (Gemini) trả lời khách trong chat "Liên hệ người bán" theo kiểu **RAG (Retrieval-Augmented Generation)**:
trước khi trả lời, hệ thống **lấy dữ liệu thật** của cửa hàng rồi đưa cho Gemini, Gemini chỉ được trả lời dựa trên dữ liệu đó.

Có hai loại nguồn dữ liệu, lấy theo hai cách khác nhau:

| Nguồn | Ví dụ câu hỏi | Cách lấy (Retrieval) | Công cụ của trợ lý |
|---|---|---|---|
| Kiến thức dạng chữ: sản phẩm, FAQ, chính sách | "Có đồ gì mặc đi biển không?", "Shop có freeship không?" | **Vector search**: embedding câu hỏi, so cosine với embedding đã lưu trong bảng `chat_knowledge` | `search_products`, `search_policies` |
| Dữ liệu cá nhân, thời gian thực: đơn hàng, hành trình giao | "Đơn của mình tới đâu rồi?" | **Truy vấn chính xác**: SQL theo tài khoản khách đang chat, gọi API GHN | `get_my_orders`, `track_order` |

Đơn hàng không dùng vector search: phải đúng đơn **của chính khách đó** và đúng trạng thái **lúc này**.

## Thành phần

| Lớp | Vai trò |
|---|---|
| `GeminiClient.embed(texts, taskType)` | Gọi Gemini `batchEmbedContents`, trả về vector (mặc định 768 chiều). Model: `thors.ai.gemini-embedding-model` (mặc định `gemini-embedding-001`) |
| `GeminiClient.retryOn503(call, sleep)` | Mọi lần gọi Gemini (trả lời và embedding): gặp HTTP 503 (Google quá tải) thì chờ 3 giây và thử lại **1 lần**; lỗi khác (429 hết hạn mức, mất kết nối...) không thử lại |
| `ChatKnowledge.descriptionText(raw)` | Mô tả sản phẩm (chữ thường, HTML, hoặc JSON `{"v":1,...}` của trang quản lý) → chữ dễ đọc: mô tả ngắn, điểm nổi bật, chất liệu, kiểu dáng, phù hợp, tính năng. Dùng khi tạo embedding và trong `get_product` |
| `ChatKnowledgeRepository` | Bảng `chat_knowledge` (migration `2026-11-24_chat_rag.sql`); `ready()` = false khi chưa chạy migration |
| `ChatKnowledge` | Kho tri thức: `sync()` tạo/cập nhật embedding (30 phút một lần), `search()` tìm top-k theo cosine, giữ vector trong bộ nhớ. Một đoạn được lấy khi điểm ≥ `MIN_SCORE` (0.65) **và** không thấp hơn điểm cao nhất quá `MAX_GAP` (0.05) |
| `ChatBot` | Vòng gọi công cụ của Gemini; các công cụ chỉ đọc |
| `GhnClient.journey(orderCode)` | Lịch sử trạng thái vận đơn GHN (trường `log` của API chi tiết đơn) |

**Dự phòng:** chưa chạy migration, chưa đồng bộ xong, hoặc Gemini embedding lỗi thì `search_products` quay về tìm theo tên
(như trước) và `search_policies` trả toàn bộ FAQ + chính sách. GHN lỗi thì `track_order` trả trạng thái mới nhất trong DB.

## Cài đặt

1. Chạy `database/migrations/2026-11-24_chat_rag.sql` (chỉ tạo bảng mới `chat_knowledge`). Lần đồng bộ đầu chạy 1 phút
   sau khi backend khởi động, sau đó 30 phút một lần.
2. Dùng chung `thors.ai.gemini-api-key` với trợ lý. Tùy chọn trong `local.properties`:
   `thors.ai.gemini-embedding-model` (mặc định `gemini-embedding-001`), `thors.ai.gemini-embedding-dims` (mặc định 768).
3. Hành trình GHN dùng cấu hình GHN sẵn có (`GHN_TOKEN`, `GHN_SHOP_ID`).

Ngưỡng: thử với dữ liệu thật (24/11/2026), điểm cosine của Gemini dồn trong khoảng hẹp: đoạn đúng ~0.67–0.76, đoạn
không liên quan vẫn ~0.61–0.67. Vì vậy dùng cả ngưỡng tuyệt đối `MIN_SCORE = 0.65` lẫn ngưỡng tương đối
`MAX_GAP = 0.05` (chỉ giữ đoạn gần bằng đoạn tốt nhất).

## SD1. Đồng bộ kho tri thức — `ChatKnowledge.sync()`

```mermaid
sequenceDiagram
    participant S as Scheduler (30 phút)
    participant K as ChatKnowledge
    participant G as GeminiClient
    participant R as ChatKnowledgeRepository
    participant A as ChatAutoReply

    S->>K: sync()
    alt Chưa có Gemini API key
        K-->>S: SyncResult(skipped = "Chưa cấu hình Gemini API key")
    else Chưa chạy migration (R.ready() = false)
        K-->>S: SyncResult(skipped = "Chưa chạy migration 2026-11-24_chat_rag.sql")
    else
        K->>R: productsForIndex()
        R-->>K: sản phẩm đang bán (id, tên, danh mục, mô tả)
        K->>A: faqs(), workingHoursText()
        A-->>K: FAQ (bỏ câu không có đáp án), giờ làm việc
        Note over K: Lập tài liệu PRODUCT / FAQ / POLICY<br/>mô tả sản phẩm qua descriptionText() (JSON/HTML → chữ)<br/>hash = SHA-256(model + nội dung)
        K->>R: loadAll()
        R-->>K: các dòng đã lưu (type, key, hash, vector)
        Note over K: Chỉ lấy tài liệu mới / đổi nội dung (hash khác)
        loop Mỗi lô tối đa 50 tài liệu
            K->>G: embed(texts, RETRIEVAL_DOCUMENT)
            alt Gemini lỗi
                G-->>K: GeminiException
                K-->>S: ném GeminiException (giữ nguyên chỉ mục cũ)
            end
            G-->>K: vectors
            K->>R: upsert(type, key, content, hash, vector, model)
        end
        K->>R: deleteExcept(các key còn dùng)
        R-->>K: số dòng đã xóa
        K->>R: loadAll()
        Note over K: Nạp lại chỉ mục trong bộ nhớ
        K-->>S: SyncResult(total, embedded, removed)
    end
```

## SD2. Tìm theo nghĩa — `ChatKnowledge.search(query, types, k)`

```mermaid
sequenceDiagram
    participant B as ChatBot
    participant K as ChatKnowledge
    participant G as GeminiClient

    B->>K: search(query, types, k)
    alt query rỗng hoặc chỉ mục chưa có tài liệu loại types
        K-->>B: [] (không gọi Gemini)
    else
        K->>G: embed([query], RETRIEVAL_QUERY)
        alt Gemini lỗi
            G-->>K: GeminiException
            K-->>B: ném GeminiException
        end
        G-->>K: vector câu hỏi
        Note over K: cosine(câu hỏi, từng tài liệu loại types)<br/>bỏ điểm < 0.65 và điểm < (điểm cao nhất − 0.05)<br/>sắp giảm dần, lấy k
        K-->>B: List<Hit(type, key, content, score)>
    end
```

## SD3. Công cụ `search_products` (vector + từ khóa)

```mermaid
sequenceDiagram
    participant M as Gemini (mô hình)
    participant B as ChatBot
    participant K as ChatKnowledge
    participant P as ShopRepository

    M->>B: functionCall search_products(query, max_price?)
    B->>K: search(query, {PRODUCT}, 12)
    alt Lỗi (Gemini / chưa sẵn sàng)
        K-->>B: exception → coi như không có kết quả theo nghĩa
    else
        K-->>B: hits
        loop Mỗi hit
            B->>P: findProduct(id), findVariants(id)
            Note over B: Bỏ nếu ngừng bán / hết biến thể / giá thấp nhất > max_price
        end
    end
    B->>P: findProducts(query) (bớt dần từ cuối nếu rỗng)
    Note over B: Thêm kết quả theo tên, bỏ trùng id, tối đa 6
    B-->>M: {products: [...], note?}
```

## SD4. Công cụ `search_policies`

```mermaid
sequenceDiagram
    participant M as Gemini (mô hình)
    participant B as ChatBot
    participant K as ChatKnowledge
    participant A as ChatAutoReply

    M->>B: functionCall search_policies(query)
    B->>K: search(query, {FAQ, POLICY}, 3)
    alt Có kết quả
        K-->>B: hits
        B-->>M: {results: [nội dung các đoạn]}
    else Rỗng hoặc lỗi
        B->>A: faqs(), workingHoursText()
        B-->>M: {results: [toàn bộ FAQ + chính sách], note}
    end
```

## SD5. Công cụ `get_my_orders` (thêm trạng thái giao hàng)

```mermaid
sequenceDiagram
    participant M as Gemini (mô hình)
    participant B as ChatBot
    participant R as ChatRepository

    M->>B: functionCall get_my_orders()
    B->>R: recentOrders(customerId của cuộc chat, 5)
    R-->>B: đơn + shipment_status + shipment_updated_at
    Note over B: Trạng thái đơn, trạng thái giao hàng (tiếng Việt),<br/>thời điểm cập nhật giao hàng theo giờ VN
    B-->>M: {orders: [...]} hoặc note "Khách chưa có đơn hàng online nào"
```

## SD6. Công cụ `track_order` (hành trình GHN)

```mermaid
sequenceDiagram
    participant M as Gemini (mô hình)
    participant B as ChatBot
    participant R as ChatRepository
    participant H as GhnClient

    M->>B: functionCall track_order(order_number)
    alt order_number rỗng
        B-->>M: {error: "Vui lòng cho biết mã đơn hàng cần tra."}
    else
        B->>R: ownOrder(customerId của cuộc chat, order_number)
        alt Không có (sai mã hoặc đơn của người khác)
            R-->>B: empty
            B-->>M: {error: "Không tìm thấy đơn <mã> trong các đơn của bạn."}
        else
            R-->>B: đơn (trạng thái, carrier, mã vận đơn, shipment)
            alt carrier = GHN, có mã vận đơn, GHN chưa cấu hình
                Note over B: note "Chưa lấy được hành trình từ GHN..."
            else carrier = GHN, có mã vận đơn, GHN đã cấu hình
                B->>H: journey(mã vận đơn)
                alt GHN lỗi
                    H-->>B: ApiException
                    Note over B: note "Chưa lấy được hành trình từ GHN..."
                else
                    H-->>B: các bước (status, thời điểm)
                    Note over B: Đổi sang tiếng Việt, giờ VN
                end
            else carrier = SELF
                Note over B: note "Đơn do cửa hàng tự giao..."
            else Chưa có vận chuyển
                Note over B: note "Đơn chưa được giao cho đơn vị vận chuyển."
            end
            B-->>M: {order_number, status, shipping_status?, journey?, note?}
        end
    end
```

## SD7. Thử lại khi Gemini quá tải — `GeminiClient.retryOn503(call, sleep)`

```mermaid
sequenceDiagram
    participant C as ChatBot / ChatKnowledge
    participant G as GeminiClient
    participant API as Gemini API

    C->>G: generate(...) / embed(...)
    G->>API: POST (lần 1)
    alt Thành công
        API-->>G: 200
        G-->>C: kết quả
    else HTTP 503 (quá tải)
        API-->>G: 503
        Note over G: chờ 3 giây
        G->>API: POST (lần 2)
        alt Thành công
            API-->>G: 200
            G-->>C: kết quả
        else Lỗi
            API-->>G: lỗi
            G-->>C: ném GeminiException của lần 2
        end
    else Lỗi khác (429, 400, mất kết nối)
        G-->>C: ném GeminiException (không thử lại)
    end
```
