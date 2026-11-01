package com.thors.module.cart.service;

import com.thors.module.cart.repository.CartRepository;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.util.HashSet;
import java.util.List;
import java.util.Map;

@Service
public class CartService {

    private final CartRepository cartRepository;

    public CartService(CartRepository cartRepository) {
        this.cartRepository = cartRepository;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getCart(int userId) {
        return cartRepository.findItems(userId);
    }

    @Transactional
    public void addItem(int userId, Integer detailId, Integer quantity) {
        if (detailId == null || detailId <= 0) {
            throw new IllegalArgumentException("Biến thể sản phẩm không hợp lệ.");
        }
        if (quantity == null || quantity <= 0) {
            throw new IllegalArgumentException("Số lượng phải lớn hơn 0.");
        }

        Map<String, Object> detail = cartRepository.findDetail(detailId);
        if (detail == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy sản phẩm.");
        }
        if (!isTrue(detail.get("available"))) {
            throw new IllegalArgumentException("Sản phẩm hiện không được bán online.");
        }

        int stock = ((Number) detail.get("stock")).intValue();
        int cartId = cartRepository.getOrCreateCartId(userId);
        int newQuantity = cartRepository.findQuantity(cartId, detailId) + quantity;

        if (newQuantity > stock) {
            throw new IllegalArgumentException("Chỉ còn " + stock + " sản phẩm trong kho.");
        }
        cartRepository.upsertItem(cartId, detailId, newQuantity);
    }

    @Transactional
    public void updateQuantity(int userId, int cartItemId, Integer quantity) {
        if (quantity == null || quantity <= 0) {
            throw new IllegalArgumentException("Số lượng phải lớn hơn 0.");
        }

        Map<String, Object> item = cartRepository.findItem(userId, cartItemId);
        if (item == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy sản phẩm trong giỏ.");
        }
        if (!isTrue(item.get("available"))) {
            throw new IllegalArgumentException("Sản phẩm hiện không được bán online.");
        }

        int stock = ((Number) item.get("stock")).intValue();
        if (quantity > stock) {
            throw new IllegalArgumentException("Chỉ còn " + stock + " sản phẩm trong kho.");
        }
        cartRepository.updateQuantity(userId, cartItemId, quantity);
    }

    @Transactional
    public void deleteItems(int userId, List<Integer> cartItemIds) {
        if (cartItemIds == null || cartItemIds.isEmpty()) {
            throw new IllegalArgumentException("Chưa chọn sản phẩm nào để xóa.");
        }
        for (Integer id : new HashSet<>(cartItemIds)) {
            if (id == null || id <= 0) {
                throw new IllegalArgumentException("Mã sản phẩm trong giỏ không hợp lệ.");
            }
            cartRepository.deleteItem(userId, id);
        }
    }

    private boolean isTrue(Object value) {
        if (value instanceof Boolean b) return b;
        return value instanceof Number n && n.intValue() == 1;
    }
}