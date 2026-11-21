package com.thors.module.order;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.thors.module.order.repository.DeliveryProofRepository;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** Lưu và đọc lại minh chứng giao hàng; chưa có bảng thì đọc ra rỗng, không lỗi SQL. */
class DeliveryProofRepositoryTest {

    private JdbcTemplate db;

    @BeforeEach
    void setUp() {
        var dataSource = new DriverManagerDataSource(
                "jdbc:h2:mem:proof_" + UUID.randomUUID() + ";MODE=MySQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE", "sa", "");
        db = new JdbcTemplate(dataSource);
        db.execute("CREATE TABLE `user` (user_id INT PRIMARY KEY, full_name VARCHAR(100))");
        db.update("INSERT INTO `user` VALUES (7, 'Chủ shop')");
    }

    /** H2 không khớp information_schema của MySQL, nên giả lập trạng thái đã/chưa chạy migration. */
    private DeliveryProofRepository repo(boolean migrated) {
        return new DeliveryProofRepository(db) {
            @Override
            public boolean ready() {
                return migrated;
            }
        };
    }

    @Test
    void savesAndReadsPhotosNoteAndWhoDelivered() {
        db.execute("""
                CREATE TABLE order_delivery_proof (order_id INT PRIMARY KEY, image_urls TEXT NOT NULL,
                  note VARCHAR(255), created_by INT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""");
        var repo = repo(true);
        repo.insert(42, List.of("https://img/a.jpg", "https://img/b.jpg"), "Gửi bảo vệ", 7);

        var proof = repo.find(42).orElseThrow();
        assertEquals(List.of("https://img/a.jpg", "https://img/b.jpg"), proof.imageUrls());
        assertEquals("Gửi bảo vệ", proof.note());
        assertEquals("Chủ shop", proof.createdByName());
        assertTrue(proof.createdAt() != null);
        assertTrue(repo.find(43).isEmpty());
    }

    @Test
    void beforeMigrationFindsNothingWithoutTouchingTheMissingTable() {
        assertTrue(repo(false).find(42).isEmpty());
    }
}
