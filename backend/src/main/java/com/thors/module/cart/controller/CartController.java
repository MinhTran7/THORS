package com.thors.module.cart.controller;

import com.thors.module.cart.dto.AddCartItemRequest;
import com.thors.module.cart.dto.DeleteCartItemsRequest;
import com.thors.module.cart.dto.UpdateCartItemRequest;
import com.thors.module.cart.service.CartService;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import com.thors.security.SessionUser;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

@RestController
@RequestMapping("/api/cart")
public class CartController {

    private final CartService cartService;

    public CartController(CartService cartService) {
        this.cartService = cartService;
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> getCart() {
        return ResponseEntity.ok(Map.of("items", cartService.getCart(currentUserId())));
    }

    @PostMapping("/items")
    public ResponseEntity<Map<String, Object>> addItem(@RequestBody AddCartItemRequest request) {
        cartService.addItem(currentUserId(), request.detailId(), request.quantity());
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(Map.of("message", "Đã thêm vào giỏ hàng."));
    }

    @PutMapping("/items/{cartItemId}")
    public ResponseEntity<Map<String, Object>> updateQuantity(
            @PathVariable int cartItemId,
            @RequestBody UpdateCartItemRequest request) {
        cartService.updateQuantity(currentUserId(), cartItemId, request.quantity());
        return ResponseEntity.ok(Map.of("message", "Đã cập nhật số lượng."));
    }

    @DeleteMapping("/items/{cartItemId}")
    public ResponseEntity<Map<String, Object>> deleteItem(@PathVariable int cartItemId) {
        cartService.deleteItems(currentUserId(), java.util.List.of(cartItemId));
        return ResponseEntity.ok(Map.of("message", "Đã xóa khỏi giỏ hàng."));
    }

    /** Xóa nhiều món cùng lúc (nút "Xóa các mục đã chọn"). */
    @PostMapping("/items/batch-delete")
    public ResponseEntity<Map<String, Object>> deleteItems(@RequestBody DeleteCartItemsRequest request) {
        cartService.deleteItems(currentUserId(), request.cartItemIds());
        return ResponseEntity.ok(Map.of("message", "Đã xóa các sản phẩm đã chọn."));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> handleValidationError(IllegalArgumentException ex) {
        return ResponseEntity.badRequest().body(Map.of("message", ex.getMessage()));
    }

    /** Lấy user_id từ session đăng nhập (principal là SessionUser, giống AccountStateFilter). */
    private int currentUserId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof SessionUser user) {
            return Math.toIntExact(user.userId());
        }
        throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Vui lòng đăng nhập.");
    }
}