package com.thors.module.product;

import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/** Thêm/sửa/xóa sản phẩm và danh mục chỉ dành cho Owner; khách hàng và nhân viên bị chặn 403. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ProductEndpointSecurityTest {

    private static final String BODY = "{}";

    @Autowired
    MockMvc mvc;

    @Test
    void customerCannotWriteProducts() throws Exception {
        var customer = user("khach").roles("CUSTOMER");

        mvc.perform(put("/api/products/1").with(customer).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/products").with(customer).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isForbidden());
        mvc.perform(patch("/api/products/1/status").with(customer).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isForbidden());
        mvc.perform(delete("/api/products/1").with(customer).with(csrf()))
                .andExpect(status().isForbidden());
        mvc.perform(delete("/api/products/1/images/2").with(customer).with(csrf()))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/categories").with(customer).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isForbidden());
        mvc.perform(patch("/api/products/1/online").with(customer).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"enabled\":true}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void customerCannotReadAdminProductList() throws Exception {
        var customer = user("khach").roles("CUSTOMER");

        // Khách xem sản phẩm qua /api/shop/**; danh sách quản trị có sản phẩm ẩn và tồn kho thật
        mvc.perform(get("/api/products").with(customer)).andExpect(status().isForbidden());
        mvc.perform(get("/api/products/1").with(customer)).andExpect(status().isForbidden());
        mvc.perform(get("/api/products").with(user("nhanvien").roles("FAMILY_MEMBER")))
                .andExpect(result -> assertNotEquals(403, result.getResponse().getStatus()));
    }

    @Test
    void staffCanOnlyCreateCategories() throws Exception {
        var staff = user("nhanvien").roles("FAMILY_MEMBER");

        // Tạo danh mục được phép (hộp thoại tạo nhanh ở màn hình kho) — không bị chặn quyền
        mvc.perform(post("/api/categories").with(staff).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(result -> assertNotEquals(403, result.getResponse().getStatus()));
        // Sửa danh mục: chỉ Owner
        mvc.perform(put("/api/categories/1").with(staff).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isForbidden());
    }

    @Test
    void anonymousCannotWriteProducts() throws Exception {
        mvc.perform(put("/api/products/1").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isUnauthorized());
    }
}
