package com.thors.module.shippingaddress.controller;

import com.thors.module.shippingaddress.dto.ShippingAddressRequest;
import com.thors.module.shippingaddress.dto.ShippingAddressResponse;
import com.thors.module.shippingaddress.service.ShippingAddressService;
import com.thors.security.SessionAccess;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/customer/addresses")
public class ShippingAddressController {

    private final ShippingAddressService service;
    private final SessionAccess sessions;

    public ShippingAddressController(ShippingAddressService service, SessionAccess sessions) {
        this.service = service;
        this.sessions = sessions;
    }

    @GetMapping
    public List<ShippingAddressResponse> list() {
        return service.list(sessions.current());
    }

    @GetMapping("/{addressId}")
    public ShippingAddressResponse detail(@PathVariable int addressId) {
        return service.detail(sessions.current(), addressId);
    }

    @PostMapping
    public ResponseEntity<ShippingAddressResponse> create(@RequestBody ShippingAddressRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(sessions.current(), request));
    }

    @PutMapping("/{addressId}")
    public ShippingAddressResponse update(@PathVariable int addressId,
                                           @RequestBody ShippingAddressRequest request) {
        return service.update(sessions.current(), addressId, request);
    }

    @RequestMapping(value = "/{addressId}/default", method = {RequestMethod.PATCH, RequestMethod.PUT})
    public ShippingAddressResponse setDefault(@PathVariable int addressId) {
        return service.setDefault(sessions.current(), addressId);
    }

    @DeleteMapping("/{addressId}")
    public ResponseEntity<Void> delete(@PathVariable int addressId) {
        service.delete(sessions.current(), addressId);
        return ResponseEntity.noContent().build();
    }
}
