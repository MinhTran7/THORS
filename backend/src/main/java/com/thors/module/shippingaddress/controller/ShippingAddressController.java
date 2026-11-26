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
        return service.list(sessions.current().id());
    }

    @GetMapping("/{addressId}")
    public ShippingAddressResponse detail(@PathVariable int addressId) {
        return service.detail(sessions.current().id(), addressId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public void create(@RequestBody ShippingAddressRequest request) {
        service.create(sessions.current().id(), request);
    }

    @PutMapping("/{addressId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void update(@PathVariable int addressId, @RequestBody ShippingAddressRequest request) {
        service.update(sessions.current().id(), addressId, request);
    }

    @PatchMapping("/{addressId}/default")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void setDefault(@PathVariable int addressId) {
        service.setDefault(sessions.current().id(), addressId);
    }

    @DeleteMapping("/{addressId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable int addressId) {
        service.delete(sessions.current().id(), addressId);
    }
}
