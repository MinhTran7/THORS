package com.thors.module.warehouse;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import com.thors.module.product.dto.CreateProductRequest;
import com.thors.module.product.repository.ProductRepository;
import com.thors.module.product.service.ProductService;
import com.thors.module.warehouse.WarehouseRequests.*;
import static com.thors.module.warehouse.WarehouseStore.copy;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Quick catalogue creation from a purchase-order form. Reuses the product module as-is (its public
 * createProduct validation and insert with stock_quantity=0 and online_sales_enabled=0), so the
 * product, cart, shop and sales modules need no change. The sale price is optional: when given it is
 * written as the catalogue price of the variant, when empty product_detail.price stays NULL (never 0
 * and never the purchase price). The purchase price stays on the order line only.
 *
 * <p>Duplicate protection without extra schema: the warehouse lock serialises calls; a product with
 * the same normalised name requires an explicit allowSimilar=true (so a retry after a lost response
 * surfaces the product that was just created instead of creating a second one); a variant with the
 * same product/color/size is returned as existing instead of inserted again.
 */
@Service
@Transactional(isolation = Isolation.READ_COMMITTED)
public class WarehouseCatalog {
    private final WarehouseStore s;
    private final WarehousePolicy policy;
    private final ProductService products;
    private final ProductRepository productRepository;

    public WarehouseCatalog(
            WarehouseStore s,
            WarehousePolicy policy,
            ProductService products,
            ProductRepository productRepository) {
        this.s = s;
        this.policy = policy;
        this.products = products;
        this.productRepository = productRepository;
    }

    private static String key(String value) {
        return WarehouseOrders.searchKey(value);
    }

    /** Products whose normalised name equals or contains the given name. Same name is a hint only. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> similar(Account a, String name) {
        policy.view(a);
        String wanted = key(name);
        if (wanted.length() < 2) return List.of();
        var result = new ArrayList<Map<String, Object>>();
        for (var p :
                s.jdbc()
                        .queryForList(
                                "SELECT p.product_id,p.product_name,p.status,p.category_id,c.category_name FROM product p"
                                        + " LEFT JOIN category c ON c.category_id=p.category_id ORDER BY p.product_id")) {
            String have = key((String) p.get("product_name"));
            if (!have.equals(wanted) && !have.contains(wanted) && !wanted.contains(have)) continue;
            var row = copy(p);
            row.put("exact", have.equals(wanted));
            row.put(
                    "variants",
                    s.jdbc()
                            .queryForList(
                                    "SELECT detail_id,color,size,price AS sale_price,stock_quantity,status FROM"
                                            + " product_detail WHERE product_id=? ORDER BY color,size",
                                    p.get("product_id")));
            result.add(row);
            if (result.size() >= 10) break;
        }
        return result;
    }

    /** Trim and collapse inner whitespace; accents and wording are kept as typed (no merging). */
    static String clean(String value) {
        return value == null ? "" : value.trim().replaceAll("\\s+", " ");
    }

    private static String variantKey(String color, String size) {
        return clean(color).toLowerCase(Locale.ROOT) + "\u0000" + clean(size).toLowerCase(Locale.ROOT);
    }

    private static List<QuickVariant> checkVariants(List<QuickVariant> variants) {
        var seen = new HashSet<String>();
        var cleaned = new ArrayList<QuickVariant>();
        for (var v : variants) {
            if (clean(v.color()).isEmpty() || clean(v.size()).isEmpty())
                throw new ApiException(400, "CATALOG_INVALID", "Màu và size không được để trống.");
            if (!seen.add(variantKey(v.color(), v.size())))
                throw new ApiException(400, "CATALOG_INVALID", "Có màu/size bị lặp trong danh sách tạo mới.");
            if (v.salePrice() != null && (v.salePrice().signum() < 0 || v.salePrice().scale() > 0))
                throw new ApiException(400, "CATALOG_INVALID", "Giá bán phải là số tiền VNĐ hợp lệ.");
            cleaned.add(new QuickVariant(clean(v.color()), clean(v.size()), v.salePrice()));
        }
        return cleaned;
    }

    public Map<String, Object> createProduct(Account a, QuickProduct r) {
        policy.owner(a);
        s.lock();
        var variants = checkVariants(r.variants());
        if (s.count("SELECT COUNT(*) FROM category WHERE category_id=? AND status='ACTIVE'", r.categoryId()) == 0)
            throw new ApiException(400, "CATALOG_INVALID", "Hãy chọn danh mục đang hoạt động.");
        if (!Boolean.TRUE.equals(r.allowSimilar())) {
            var same = similar(a, r.productName()).stream().filter(p -> Boolean.TRUE.equals(p.get("exact"))).toList();
            if (!same.isEmpty())
                throw new ApiException(
                        409,
                        "SIMILAR_PRODUCT",
                        "Đã có sản phẩm cùng tên trong catalog (" + same.get(0).get("product_name")
                                + ", #" + same.get(0).get("product_id")
                                + "). Hãy chọn hàng có sẵn hoặc xác nhận đây là sản phẩm khác.");
        }
        var request = new CreateProductRequest();
        request.setCategoryId(r.categoryId());
        request.setProductName(r.productName().trim());
        request.setDescription(r.description() == null ? "" : r.description().trim());
        request.setVariants(
                variants.stream()
                        .map(
                                v -> {
                                    var x = new CreateProductRequest.VariantRequest();
                                    x.setColor(v.color());
                                    x.setSize(v.size());
                                    // The product module requires a price; a missing sale price passes its
                                    // check as 0 here and is reset to NULL below in the same transaction.
                                    x.setPrice(v.salePrice() == null ? java.math.BigDecimal.ZERO : v.salePrice());
                                    return x;
                                })
                        .toList());
        int productId;
        try {
            productId = products.createProduct(request);
        } catch (IllegalArgumentException e) {
            throw new ApiException(400, "CATALOG_INVALID", "Thông tin sản phẩm không hợp lệ: " + e.getMessage());
        }
        for (var v : variants)
            if (v.salePrice() == null)
                s.jdbc()
                        .update(
                                "UPDATE product_detail SET price=NULL WHERE product_id=? AND LOWER(color)=LOWER(?)"
                                        + " AND LOWER(size)=LOWER(?)",
                                productId,
                                v.color(),
                                v.size());
        s.audit(a.id(), "CATALOG_QUICK_CREATE", productId, "product with " + variants.size() + " variants");
        return result(productId, variants, Set.of());
    }

    public Map<String, Object> addVariants(Account a, int productId, QuickVariants r) {
        policy.owner(a);
        s.lock();
        var variants = checkVariants(r.variants());
        s.one("SELECT product_id FROM product WHERE product_id=? FOR UPDATE", productId);
        var existing = new HashSet<String>();
        int created = 0;
        for (var v : variants) {
            String color = v.color(), size = v.size();
            if (s.count(
                            "SELECT COUNT(*) FROM product_detail WHERE product_id=? AND LOWER(color)=LOWER(?) AND"
                                    + " LOWER(size)=LOWER(?)",
                            productId,
                            color,
                            size)
                    > 0) {
                existing.add(color.toLowerCase(Locale.ROOT) + "\u0000" + size.toLowerCase(Locale.ROOT));
                continue;
            }
            productRepository.insertNewVariant(productId, size, color, v.salePrice());
            created++;
        }
        if (created > 0)
            s.audit(a.id(), "CATALOG_QUICK_VARIANT", productId, "added " + created + " variants");
        return result(productId, variants, existing);
    }

    private Map<String, Object> result(int productId, List<QuickVariant> asked, Set<String> existing) {
        var product =
                s.one(
                        "SELECT p.product_id,p.product_name,p.category_id,p.status FROM product p WHERE p.product_id=?",
                        productId);
        var rows = new ArrayList<Map<String, Object>>();
        for (var v : asked) {
            var d =
                    s.one(
                            "SELECT detail_id,color,size,price AS sale_price,stock_quantity,online_sales_enabled,status"
                                    + " FROM product_detail WHERE product_id=? AND LOWER(color)=LOWER(?) AND"
                                    + " LOWER(size)=LOWER(?)",
                            productId,
                            v.color().trim(),
                            v.size().trim());
            var row = copy(d);
            row.put("product_id", productId);
            row.put("product_name", product.get("product_name"));
            row.put(
                    "already_existed",
                    existing.contains(
                            v.color().trim().toLowerCase(Locale.ROOT) + "\u0000" + v.size().trim().toLowerCase(Locale.ROOT)));
            rows.add(row);
        }
        var result = copy(product);
        result.put("variants", rows);
        return result;
    }

}
