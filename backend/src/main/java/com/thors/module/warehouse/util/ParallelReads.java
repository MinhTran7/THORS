package com.thors.module.warehouse.util;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Chạy song song các truy vấn CHỈ ĐỌC, độc lập nhau của màn hình kho. DB ở cloud nên mỗi câu SQL tốn
 * ~0,1 giây đi về; chạy cùng lúc thì cả nhóm chỉ tốn khoảng thời gian của câu lâu nhất.
 *
 * <p>An toàn:
 * <ul>
 *   <li>Đang ở trong một giao dịch thật (vd hàm ghi gọi lại hàm đọc) → chạy ngay trên luồng hiện tại,
 *       dùng chung kết nối của giao dịch để thấy cả dữ liệu vừa ghi (giống hệt trước đây).
 *   <li>Đang ở trên luồng của chính bộ chạy song song → cũng chạy ngay, không lồng thêm (tránh các
 *       luồng chờ nhau mãi).
 *   <li>Tối đa 5 luồng cho cả kho, nên không chiếm hết kết nối DB của các phần khác trong web.
 * </ul>
 * Lỗi trong tác vụ được ném lại nguyên bản (ApiException, lỗi SQL...) khi gọi {@code get()}.
 */
public final class ParallelReads {
  private ParallelReads() {}

  private static final AtomicInteger COUNTER = new AtomicInteger();
  private static final ThreadLocal<Boolean> WORKER = ThreadLocal.withInitial(() -> false);
  private static final ExecutorService POOL =
          Executors.newFixedThreadPool(5, r -> {
            var t = new Thread(() -> {
              WORKER.set(true);
              r.run();
            }, "warehouse-read-" + COUNTER.incrementAndGet());
            t.setDaemon(true);
            return t;
          });

  /** Bắt đầu chạy {@code task}; gọi {@code get()} trên kết quả để lấy giá trị (đợi nếu chưa xong). */
  public static <T> Supplier<T> start(Supplier<T> task) {
    if (WORKER.get() || TransactionSynchronizationManager.isActualTransactionActive()) {
      T value = task.get();
      return () -> value;
    }
    var future = CompletableFuture.supplyAsync(task, POOL);
    return () -> {
      try {
        return future.join();
      } catch (CompletionException e) {
        if (e.getCause() instanceof RuntimeException r) throw r;
        if (e.getCause() instanceof Error er) throw er;
        throw e;
      }
    };
  }
}
