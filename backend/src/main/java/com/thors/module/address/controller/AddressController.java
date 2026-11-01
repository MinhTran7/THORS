package com.thors.module.address.controller;

import com.thors.module.address.dto.CreateAddressRequest;
import com.thors.module.address.service.AddressService;
import com.thors.security.SessionUser;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

@RestController
@RequestMapping("/api/addresses")
public class AddressController {

    private final AddressService addressService;

    public AddressController(AddressService addressService) {
        this.addressService = addressService;
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> list() {
        return ResponseEntity.ok(Map.of("items", addressService.list(currentUserId())));
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> create(@RequestBody CreateAddressRequest request) {
        int id = addressService.create(currentUserId(), request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(Map.of("id", id, "message", "Đã lưu địa chỉ."));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> handleValidationError(IllegalArgumentException ex) {
        return ResponseEntity.badRequest().body(Map.of("message", ex.getMessage()));
    }

    /** Lấy user_id từ session đăng nhập (giống CartController). */
    private int currentUserId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof SessionUser user) {
            return Math.toIntExact(user.userId());
        }
        throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Vui lòng đăng nhập.");
    }
}