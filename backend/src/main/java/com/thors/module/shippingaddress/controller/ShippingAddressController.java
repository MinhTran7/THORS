package com.thors.module.shippingaddress.controller;

import com.thors.module.shippingaddress.dto.ShippingAddressRequest;
import com.thors.module.shippingaddress.dto.ShippingAddressResponse;
import com.thors.module.shippingaddress.service.ShippingAddressService;
import com.thors.security.SessionAccess;
import org.springframework.http.HttpStatus;
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
    @ResponseStatus(HttpStatus.CREATED)
    public ShippingAddressResponse create(@RequestBody ShippingAddressRequest request) {
        return service.create(sessions.current(), request);
    }

    @PutMapping("/{addressId}")
    public ShippingAddressResponse update(@PathVariable int addressId, @RequestBody ShippingAddressRequest request) {
        return service.update(sessions.current(), addressId, request);
    }

    @DeleteMapping("/{addressId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable int addressId) {
        service.delete(sessions.current(), addressId);
    }
}
