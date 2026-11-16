package com.thors.module.warehouse;

import static org.junit.jupiter.api.Assertions.*;

import java.util.*;
import org.junit.jupiter.api.Test;

/** Trang Tồn kho gom biến thể theo sản phẩm (tầng 1 = sản phẩm, tầng 2 = biến thể). */
class WarehouseInventoryGroupTest {

    private static Map<String, Object> variant(
            int product, String name, int detail, int stock, int assigned, int held, String state, String... places) {
        var r = new LinkedHashMap<String, Object>();
        r.put("product_id", product);
        r.put("product_code", String.format("SP%05d", product));
        r.put("product_name", name);
        r.put("category_name", "Áo");
        r.put("detail_id", detail);
        r.put("stock_quantity", stock);
        r.put("assigned_quantity", assigned);
        r.put("unassigned_quantity", Math.max(0, stock - assigned));
        r.put("held_quantity", held);
        r.put("available_quantity", Math.max(0, stock - held));
        r.put("incoming_quantity", 1L);
        r.put("stock_state", state);
        var locs = new ArrayList<Map<String, Object>>();
        for (int i = 0; i < places.length; i += 2)
            locs.add(Map.of("label", places[i], "quantity", Integer.parseInt(places[i + 1])));
        r.put("locations", locs);
        return r;
    }

    @Test
    @SuppressWarnings("unchecked")
    void groupsVariantsOfOneProductIntoOneLine() {
        var rows = List.of(
                variant(5, "Áo baby doll", 6, 87, 34, 40, "IN", "A1", "30", "A2", "4"),
                variant(5, "Áo baby doll", 5, 0, 2, 0, "OUT", "B2", "2", "A1", "1"),
                variant(24, "Áo Hooldy", 51, 20, 0, 0, "LOW"));

        var groups = WarehouseInventory.groupByProduct(rows, "");

        assertEquals(2, groups.size());
        var baby = groups.get(0);
        assertEquals(5, baby.get("product_id"));
        assertEquals("SP00005", baby.get("product_code"));
        assertEquals(2, baby.get("variant_count"));
        assertEquals(87L, baby.get("stock_quantity"));
        assertEquals(36L, baby.get("assigned_quantity"));
        assertEquals(40L, baby.get("held_quantity"));
        assertEquals(2L, baby.get("incoming_quantity"));
        assertEquals(1L, baby.get("count_in"));
        assertEquals(1L, baby.get("count_out"));
        assertEquals(0L, baby.get("count_low"));
        // Vị trí trùng tên được cộng dồn, nhiều hàng nhất đứng trước
        var places = (List<Map<String, Object>>) baby.get("locations");
        assertEquals("A1", places.get(0).get("label"));
        assertEquals(31L, places.get(0).get("quantity"));
        assertEquals(3, places.size());
        // Biến thể giữ nguyên thứ tự đã sắp
        var variants = (List<Map<String, Object>>) baby.get("variants");
        assertEquals(List.of(6, 5), variants.stream().map(v -> v.get("detail_id")).toList());
        assertEquals(1L, groups.get(1).get("count_low"));
    }

    @Test
    void stockSortUsesProductTotal() {
        var rows = List.of(
                variant(1, "A", 1, 5, 0, 0, "IN"),
                variant(1, "A", 2, 5, 0, 0, "IN"),
                variant(2, "B", 3, 8, 0, 0, "IN"));

        assertEquals(List.of(2, 1), WarehouseInventory.groupByProduct(rows, "stock_asc").stream()
                .map(g -> g.get("product_id")).toList());
        assertEquals(List.of(1, 2), WarehouseInventory.groupByProduct(rows, "stock_desc").stream()
                .map(g -> g.get("product_id")).toList());
    }
}
