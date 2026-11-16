package com.thors.module.imagesearch.controller;

import com.thors.common.ApiException;
import com.thors.module.imagesearch.service.ImageSearchResult;
import com.thors.module.imagesearch.service.ImageSearchService;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Map;

/**
 * Tìm sản phẩm bằng ảnh cho khách (không cần đăng nhập, nằm dưới /api/shop/** đã mở sẵn trong SecurityConfig).
 * POST vẫn cần CSRF token như mọi API khác; frontend gửi qua services/http.
 */
@RestController
@RequestMapping("/api/shop/image-search")
public class ImageSearchController {

    private final ImageSearchService service;

    public ImageSearchController(ImageSearchService service) {
        this.service = service;
    }

    @GetMapping("/status")
    public Map<String, Object> status() {
        return service.status();
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ImageSearchResult search(@RequestParam("image") MultipartFile image) {
        try {
            return service.search(image.getBytes());
        } catch (IOException e) {
            throw new ApiException(400, "IMAGE_INVALID", "Không đọc được ảnh gửi lên.");
        }
    }
}
