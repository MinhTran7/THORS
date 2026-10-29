package com.thors.module.warehouse;

import static com.thors.module.warehouse.WarehouseStore.*;

import com.thors.module.account.entity.Account;
import com.thors.module.warehouse.WarehouseRequests.*;
import java.math.BigDecimal;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(isolation = Isolation.READ_COMMITTED)
public class WarehouseLayout {
    private final WarehouseStore s;
    private final WarehousePolicy policy;
    private final WarehousePhotos photos;

    public WarehouseLayout(
            WarehouseStore s,
            WarehousePolicy policy,
            WarehousePhotos photos) {
        this.s = s;
        this.policy = policy;
        this.photos = photos;
    }

    @Transactional(
            readOnly = true,
            isolation = Isolation.REPEATABLE_READ)
    public Map<String, Object> snapshot(Account a) {
        policy.view(a);

        var variants = s.jdbc().queryForList("""
SELECT d.detail_id,d.product_id,d.color,d.size,d.stock_quantity,d.status,p.product_name,
  COALESCE(l.assigned,0) AS assigned_quantity,d.stock_quantity-COALESCE(l.assigned,0) AS unassigned_quantity
FROM product_detail d JOIN product p ON p.product_id=d.product_id
LEFT JOIN (SELECT detail_id,SUM(quantity) AS assigned FROM product_location GROUP BY detail_id) l ON l.detail_id=d.detail_id
ORDER BY p.product_name,d.color,d.size
""");

        var tiers = s.jdbc().queryForList(
                "SELECT * FROM shelf_level ORDER BY rack_id,level_number DESC");

        var racks = RackGeometry.normalize(
                s.jdbc().queryForList("SELECT * FROM rack ORDER BY rack_code"),
                tiers);

        return Map.of(
                "variants", variants,
                "racks", racks,
                "tiers", tiers,
                "locations",
                s.jdbc().queryForList(
                        "SELECT * FROM product_location ORDER BY product_location_id"),
                "images",
                s.jdbc().queryForList(
                        "SELECT * FROM product_location_image WHERE deleted_at IS NULL"));
    }

    public Map<String, Object> saveRack(
            Account a,
            Integer id,
            Rack r) {
        policy.owner(a);
        s.lock();

        if (s.count(
                "SELECT COUNT(*) FROM rack WHERE LOWER(rack_code)=LOWER(?) AND rack_id<>?",
                r.code().trim(),
                id == null ? 0 : id) > 0) {
            throw invalid(
                    "Mã kệ " + r.code().trim()
                            + " đã tồn tại. Hãy chọn mã khác hoặc sửa kệ hiện có.");
        }

        normalizeStored(a);

        var candidate = new LinkedHashMap<String, Object>();
        candidate.put("rack_id", id == null ? -1 : id);
        candidate.put("rack_code", r.code());
        candidate.put("coordinate_x", r.x());
        candidate.put("coordinate_y", r.y());

        RackGeometry.requireFree(
                candidate,
                s.jdbc().queryForList("SELECT * FROM rack"),
                s.jdbc().queryForList("SELECT * FROM shelf_level"));

        if (id != null) {
            s.one("SELECT * FROM rack WHERE rack_id=?", id);

            if (!r.active()
                    && s.count(
                    "SELECT COALESCE(SUM(p.quantity),0) FROM product_location p "
                            + "JOIN shelf_level l ON l.shelf_level_id=p.shelf_level_id "
                            + "WHERE l.rack_id=?",
                    id) > 0) {
                throw invalid(
                        "Chỉ được ẩn kệ khi đã chuyển hết hàng ra ngoài.");
            }

            s.jdbc().update(
                    "UPDATE rack SET rack_code=?,zone=?,coordinate_x=?,coordinate_y=?,"
                            + "is_active=? WHERE rack_id=?",
                    r.code().trim(),
                    r.zone(),
                    r.x(),
                    r.y(),
                    r.active(),
                    id);
        } else {
            id = s.insert(
                    "INSERT INTO rack(rack_code,zone,coordinate_x,coordinate_y,is_active)"
                            + " VALUES(?,?,?,?,?)",
                    r.code().trim(),
                    r.zone(),
                    r.x(),
                    r.y(),
                    r.active());
        }

        s.audit(a.id(), "RACK_SAVE", id, r.code());
        return s.one("SELECT * FROM rack WHERE rack_id=?", id);
    }

    public Map<String, Object> saveRelativeRack(
            Account a,
            Integer id,
            RelativeRack r) {
        policy.owner(a);
        s.lock();
        normalizeStored(a);

        var racks = s.jdbc().queryForList(
                "SELECT * FROM rack ORDER BY rack_id");
        var tiers = s.jdbc().queryForList(
                "SELECT * FROM shelf_level");

        var current = id == null
                ? null
                : s.one("SELECT * FROM rack WHERE rack_id=?", id);

        var others = racks.stream()
                .filter(v -> id == null || num(v, "rack_id") != id)
                .toList();

        double x;
        double y;

        if (r.direction().equals("KEEP")) {
            if (current == null) {
                throw invalid("Kệ mới cần chọn vị trí đặt.");
            }

            x = ((Number) current.get("coordinate_x")).doubleValue();
            y = ((Number) current.get("coordinate_y")).doubleValue();
        } else if (r.direction().equals("FIRST")) {
            if (!others.isEmpty()) {
                throw invalid(
                        "Kho đã có kệ. Hãy chọn kệ làm mốc và hướng đặt.");
            }

            x = 40;
            y = 40;
        } else {
            var ref = others.stream()
                    .filter(v ->
                            r.referenceRackId() != null
                                    && num(v, "rack_id") == r.referenceRackId())
                    .findFirst()
                    .orElseThrow(() ->
                            invalid("Hãy chọn kệ làm mốc khác kệ đang sửa."));

            var b = RackGeometry.box(ref, tiers);

            double height = current == null
                    ? RackGeometry.height(0)
                    : RackGeometry.box(current, tiers).height();

            x = b.x();
            y = b.y();

            switch (r.direction()) {
                case "RIGHT" ->
                        x += RackGeometry.WIDTH + RackGeometry.GAP;
                case "LEFT" ->
                        x -= RackGeometry.WIDTH + RackGeometry.GAP;
                case "BELOW" ->
                        y += b.height() + RackGeometry.GAP;
                case "ABOVE" ->
                        y -= height + RackGeometry.GAP;
                default ->
                        throw invalid("Hướng đặt kệ không hợp lệ.");
            }
        }

        double dx = Math.max(0, 40 - x);
        double dy = Math.max(0, 40 - y);

        if (r.direction().equals("KEEP")) {
            dx = 0;
            dy = 0;
        }

        x += dx;
        y += dy;

        var shifted = new ArrayList<Map<String, Object>>();

        for (var other : others) {
            var copy = new LinkedHashMap<String, Object>(other);

            copy.put(
                    "coordinate_x",
                    ((Number) other.get("coordinate_x")).doubleValue() + dx);

            copy.put(
                    "coordinate_y",
                    ((Number) other.get("coordinate_y")).doubleValue() + dy);

            shifted.add(copy);
        }

        var candidate = new LinkedHashMap<String, Object>();
        candidate.put("rack_id", id == null ? -1 : id);
        candidate.put("coordinate_x", x);
        candidate.put("coordinate_y", y);

        for (var v : shifted) {
            requireMapBounds(v);
        }

        requireMapBounds(candidate);

        var conflict = RackGeometry.collision(
                RackGeometry.box(candidate, tiers),
                shifted.stream()
                        .map(v -> RackGeometry.box(v, tiers))
                        .toList());

        if (conflict.isPresent()) {
            var code = shifted.stream()
                    .filter(v ->
                            num(v, "rack_id") == conflict.get().id())
                    .findFirst()
                    .orElseThrow()
                    .get("rack_code");

            throw invalid(
                    "Vị trí này đã có kệ " + code
                            + ". Hãy chọn hướng hoặc kệ làm mốc khác.");
        }

        if (dx > 0 || dy > 0) {
            for (var v : shifted) {
                s.jdbc().update(
                        "UPDATE rack SET coordinate_x=?,coordinate_y=? WHERE rack_id=?",
                        v.get("coordinate_x"),
                        v.get("coordinate_y"),
                        v.get("rack_id"));

                s.audit(
                        a.id(),
                        "RACK_LAYOUT_SHIFT",
                        num(v, "rack_id"),
                        "Chừa chỗ đặt kệ");
            }
        }

        if (id != null) {
            s.jdbc().update(
                    "UPDATE rack SET coordinate_x=?,coordinate_y=? WHERE rack_id=?",
                    x,
                    y,
                    id);
        }

        return saveRack(
                a,
                id,
                new Rack(
                        r.code(),
                        r.zone(),
                        BigDecimal.valueOf(x),
                        BigDecimal.valueOf(y),
                        r.active()));
    }

    private void requireMapBounds(Map<String, Object> rack) {
        double x = ((Number) rack.get("coordinate_x")).doubleValue();
        double y = ((Number) rack.get("coordinate_y")).doubleValue();

        if (x < 0 || y < 0
                || x > RackGeometry.MAX
                || y > RackGeometry.MAX) {
            throw invalid(
                    "Không đủ chỗ theo hướng này. Hãy chọn hướng khác hoặc xếp gọn kho.");
        }
    }

    public Map<String, Object> tidyRacks(Account a) {
        policy.owner(a);
        s.lock();

        var racks = s.jdbc().queryForList(
                "SELECT * FROM rack ORDER BY is_active DESC,rack_code,rack_id");
        var tiers = s.jdbc().queryForList(
                "SELECT * FROM shelf_level");

        double y = 40;

        for (int start = 0; start < racks.size(); start += 4) {
            var row = racks.subList(
                    start,
                    Math.min(start + 4, racks.size()));

            if (y > RackGeometry.MAX) {
                throw invalid(
                        "Kho chưa đủ chỗ để xếp tất cả kệ theo hàng. Bố cục cũ được giữ nguyên.");
            }

            double height = 0;

            for (int column = 0; column < row.size(); column++) {
                var rack = row.get(column);

                double x = 40
                        + column * (RackGeometry.WIDTH + RackGeometry.GAP);

                height = Math.max(
                        height,
                        RackGeometry.box(rack, tiers).height());

                s.jdbc().update(
                        "UPDATE rack SET coordinate_x=?,coordinate_y=? WHERE rack_id=?",
                        x,
                        y,
                        rack.get("rack_id"));

                s.audit(
                        a.id(),
                        "RACK_LAYOUT_TIDY",
                        num(rack, "rack_id"),
                        "Xếp gọn theo hàng");
            }

            y += height + RackGeometry.GAP;
        }

        return Map.of("message", "Đã xếp gọn theo hàng.");
    }

    public Map<String, Object> saveTier(
            Account a,
            int rack,
            Integer id,
            Tier r) {
        policy.owner(a);
        s.lock();
        normalizeStored(a);

        s.one("SELECT * FROM rack WHERE rack_id=?", rack);

        if (id != null) {
            s.one(
                    "SELECT * FROM shelf_level WHERE shelf_level_id=? AND rack_id=?",
                    id,
                    rack);

            if (!r.active()
                    && s.count(
                    "SELECT COALESCE(SUM(quantity),0) FROM product_location "
                            + "WHERE shelf_level_id=?",
                    id) > 0) {
                throw invalid(
                        "Chỉ được ẩn tầng khi đã chuyển hết hàng.");
            }

            s.jdbc().update(
                    "UPDATE shelf_level SET level_number=?,status=?,is_active=? "
                            + "WHERE shelf_level_id=?",
                    r.number(),
                    r.status(),
                    r.active(),
                    id);
        } else {
            id = s.insert(
                    "INSERT INTO shelf_level(rack_id,level_number,status,is_active)"
                            + " VALUES(?,?,?,?)",
                    rack,
                    r.number(),
                    r.status(),
                    r.active());
        }

        RackGeometry.requireFree(
                s.one("SELECT * FROM rack WHERE rack_id=?", rack),
                s.jdbc().queryForList("SELECT * FROM rack"),
                s.jdbc().queryForList("SELECT * FROM shelf_level"));

        s.audit(a.id(), "TIER_SAVE", id, r.status());

        return s.one(
                "SELECT * FROM shelf_level WHERE shelf_level_id=?",
                id);
    }

    private void normalizeStored(Account a) {
        var original = s.jdbc().queryForList(
                "SELECT * FROM rack ORDER BY rack_code");
        var tiers = s.jdbc().queryForList(
                "SELECT * FROM shelf_level");

        for (var r : RackGeometry.normalize(original, tiers)) {
            var before = original.stream()
                    .filter(v -> num(v, "rack_id") == num(r, "rack_id"))
                    .findFirst()
                    .orElseThrow();

            double x = ((Number) r.get("coordinate_x")).doubleValue();
            double y = ((Number) r.get("coordinate_y")).doubleValue();

            if (Double.compare(
                    x,
                    ((Number) before.get("coordinate_x")).doubleValue()) != 0
                    || Double.compare(
                    y,
                    ((Number) before.get("coordinate_y")).doubleValue()) != 0) {
                s.jdbc().update(
                        "UPDATE rack SET coordinate_x=?,coordinate_y=? WHERE rack_id=?",
                        x,
                        y,
                        r.get("rack_id"));

                s.audit(
                        a.id(),
                        "RACK_LAYOUT_REPAIR",
                        num(r, "rack_id"),
                        x + "," + y);
            }
        }
    }

    public Map<String, Object> move(Account a, Move r) {
        policy.owner(a);
        s.lock();

        var old = s.jdbc().queryForList(
                "SELECT * FROM stock_adjustment WHERE idempotency_key=?",
                "move:" + r.requestKey());

        if (!old.isEmpty()) {
            var m = old.get(0);
            Integer target = null;

            if (m.get("destination_location_id") != null) {
                target = num(
                        s.one(
                                "SELECT shelf_level_id FROM product_location "
                                        + "WHERE product_location_id=?",
                                m.get("destination_location_id")),
                        "shelf_level_id");
            }

            if (num(m, "detail_id") != r.detailId()
                    || num(m, "movement_quantity") != r.quantity()
                    || !Objects.equals(
                    m.get("source_location_id"),
                    r.fromLocationId())
                    || !Objects.equals(target, r.toShelfId())) {
                throw invalid(
                        "Mã thao tác đã được dùng với nội dung khác.");
            }

            return Map.of("message", "Thao tác đã được xử lý.");
        }

        var variant = s.one(
                "SELECT * FROM product_detail WHERE detail_id=? FOR UPDATE",
                r.detailId());

        long assigned = s.count(
                "SELECT COALESCE(SUM(quantity),0) FROM product_location WHERE detail_id=?",
                r.detailId());

        if (assigned > num(variant, "stock_quantity")) {
            throw invalid(
                    "Tồn vị trí lớn hơn tổng tồn; cần đối soát trước.");
        }

        if (r.fromLocationId() == null) {
            if (r.quantity() > num(variant, "stock_quantity") - assigned) {
                throw invalid("Không đủ hàng chưa xếp vị trí.");
            }

            if (r.toShelfId() == null) {
                throw invalid("Phải chọn vị trí đích.");
            }
        } else {
            var from = s.one(
                    "SELECT * FROM product_location WHERE product_location_id=? FOR UPDATE",
                    r.fromLocationId());

            if (num(from, "detail_id") != r.detailId()
                    || num(from, "quantity") < r.quantity()) {
                throw invalid(
                        "Vị trí nguồn không đủ đúng màu/size đã chọn.");
            }

            if (Objects.equals(
                    from.get("shelf_level_id"),
                    r.toShelfId())) {
                throw invalid(
                        "Vị trí nguồn và đích phải khác nhau.");
            }
        }

        Integer destination = null;

        if (r.toShelfId() != null) {
            var tier = s.one(
                    "SELECT l.*,r.is_active AS rack_active FROM shelf_level l "
                            + "JOIN rack r ON r.rack_id=l.rack_id WHERE l.shelf_level_id=?",
                    r.toShelfId());

            if (num(tier, "is_active") != 1
                    || num(tier, "rack_active") != 1
                    || !is(tier, "status", "AVAILABLE")) {
                throw invalid(
                        "Chỉ được đưa hàng vào tầng đang hoạt động và còn chỗ.");
            }

            var found = s.jdbc().queryForList(
                    "SELECT * FROM product_location WHERE detail_id=? "
                            + "AND shelf_level_id=? FOR UPDATE",
                    r.detailId(),
                    r.toShelfId());

            if (found.isEmpty()) {
                requireMetadata(r.description(), r.photoKeys());

                destination = s.insert(
                        "INSERT INTO product_location(detail_id,shelf_level_id,quantity,description)"
                                + " VALUES(?,?,0,?)",
                        r.detailId(),
                        r.toShelfId(),
                        r.description().trim());
            } else {
                destination = num(
                        found.get(0),
                        "product_location_id");
            }

            if (r.description() != null
                    && !r.description().isBlank()) {
                s.jdbc().update(
                        "UPDATE product_location SET description=? WHERE product_location_id=?",
                        r.description().trim(),
                        destination);
            }

            if (r.photoKeys() != null
                    && !r.photoKeys().isEmpty()) {
                attach(destination, r.photoKeys());
            }

            var dest = s.one(
                    "SELECT * FROM product_location WHERE product_location_id=?",
                    destination);

            if (dest.get("description") == null
                    || dest.get("description").toString().isBlank()
                    || s.count(
                    "SELECT COUNT(*) FROM product_location_image "
                            + "WHERE product_location_id=? AND deleted_at IS NULL",
                    destination) == 0) {
                throw invalid(
                        "Vị trí phải có mô tả và ít nhất một ảnh thực tế.");
            }

            if ((long) num(dest, "quantity")
                    + r.quantity() > Integer.MAX_VALUE) {
                throw invalid(
                        "Số lượng vị trí vượt giới hạn.");
            }

            s.jdbc().update(
                    "UPDATE product_location SET quantity=quantity+?,"
                            + "updated_at=CURRENT_TIMESTAMP WHERE product_location_id=?",
                    r.quantity(),
                    destination);
        }

        if (r.fromLocationId() != null) {
            s.jdbc().update(
                    "UPDATE product_location SET quantity=quantity-?,"
                            + "updated_at=CURRENT_TIMESTAMP WHERE product_location_id=?",
                    r.quantity(),
                    r.fromLocationId());
        }

        int id = s.insert("""
INSERT INTO stock_adjustment(detail_id,quantity_change,reason,adjusted_by,movement_type,movement_quantity,source_location_id,destination_location_id,idempotency_key)
VALUES(?,0,'Sắp xếp vị trí kho',?,'MOVE',?,?,?,?)
""",
                r.detailId(),
                a.id(),
                r.quantity(),
                r.fromLocationId(),
                destination,
                "move:" + r.requestKey());

        s.audit(
                a.id(),
                "LOCATION_MOVE",
                id,
                r.quantity() + " sản phẩm");

        return Map.of(
                "message",
                "Đã cập nhật vị trí; tổng tồn giữ nguyên.");
    }

    private void requireMetadata(
            String description,
            List<String> keys) {
        if (description == null
                || description.isBlank()
                || keys == null
                || keys.isEmpty()) {
            throw invalid(
                    "Lần đầu gán vị trí phải có mô tả và ảnh thực tế.");
        }
    }

    private void attach(
            int location,
            List<String> keys) {
        for (var key : new LinkedHashSet<>(keys)) {
            photos.existing(key);

            String url = "/api/warehouse/photos/" + key;

            if (s.count(
                    "SELECT COUNT(*) FROM product_location_image "
                            + "WHERE product_location_id=? AND image_url=? "
                            + "AND deleted_at IS NULL",
                    location,
                    url) == 0) {
                s.insert(
                        "INSERT INTO product_location_image"
                                + "(product_location_id,image_url,cloud_public_id)"
                                + " VALUES(?,?,?)",
                        location,
                        url,
                        key);
            }
        }

        if (s.count(
                "SELECT COUNT(*) FROM product_location_image "
                        + "WHERE product_location_id=? AND deleted_at IS NULL",
                location) > 8) {
            throw invalid("Mỗi vị trí tối đa 8 ảnh.");
        }
    }

    public Map<String, Object> metadata(
            Account a,
            int id,
            WarehouseRequests.Metadata r) {
        policy.owner(a);
        s.lock();

        var location = s.one(
                "SELECT * FROM product_location WHERE product_location_id=?",
                id);

        var keep = r.keepImageIds() == null
                ? List.<Integer>of()
                : r.keepImageIds();

        for (int image : keep) {
            s.one(
                    "SELECT * FROM product_location_image "
                            + "WHERE product_location_image_id=? "
                            + "AND product_location_id=? AND deleted_at IS NULL",
                    image,
                    id);
        }

        for (var image : s.jdbc().queryForList(
                "SELECT product_location_image_id FROM product_location_image "
                        + "WHERE product_location_id=? AND deleted_at IS NULL",
                id)) {
            if (!keep.contains(num(image, "product_location_image_id"))) {
                s.jdbc().update(
                        "UPDATE product_location_image SET deleted_at=CURRENT_TIMESTAMP "
                                + "WHERE product_location_image_id=?",
                        num(image, "product_location_image_id"));
            }
        }

        if (r.photoKeys() != null) {
            attach(id, r.photoKeys());
        }

        if (num(location, "quantity") > 0
                && s.count(
                "SELECT COUNT(*) FROM product_location_image "
                        + "WHERE product_location_id=? AND deleted_at IS NULL",
                id) == 0) {
            throw invalid(
                    "Vị trí còn hàng phải giữ ít nhất một ảnh.");
        }

        s.jdbc().update(
                "UPDATE product_location SET description=?,updated_at=CURRENT_TIMESTAMP "
                        + "WHERE product_location_id=?",
                r.description().trim(),
                id);

        s.audit(
                a.id(),
                "LOCATION_METADATA",
                id,
                r.description());

        return Map.of(
                "message",
                "Đã cập nhật mô tả và ảnh.");
    }

    public List<Map<String, Object>> history(
            Account a,
            int detail) {
        policy.view(a);

        return s.jdbc().queryForList(
                "SELECT m.*,u.full_name AS actor_name FROM stock_adjustment m "
                        + "JOIN `user` u ON u.user_id=m.adjusted_by "
                        + "WHERE m.detail_id=? ORDER BY m.adjustment_id DESC LIMIT 200",
                detail);
    }

    public List<Map<String, Object>> notices(Account a) {
        policy.view(a);

        return s.jdbc().queryForList(
                "SELECT n.*,un.is_read,un.user_notification_id "
                        + "FROM notification n JOIN user_notification un "
                        + "ON un.notification_id=n.notification_id "
                        + "WHERE un.user_id=? AND n.type LIKE 'WAREHOUSE_%' "
                        + "ORDER BY n.notification_id DESC LIMIT 50",
                a.id());
    }

    public void readNotice(Account a, int id) {
        policy.view(a);

        s.jdbc().update(
                "UPDATE user_notification SET is_read=1,read_at=CURRENT_TIMESTAMP "
                        + "WHERE user_notification_id=? AND user_id=?",
                id,
                a.id());
    }
}