
package com.thors.module.product.service;

import com.cloudinary.Cloudinary;
import com.cloudinary.utils.ObjectUtils;

import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Map;

@Service
public class ProductImageService {

    private final Cloudinary cloudinary;

    public ProductImageService(Cloudinary cloudinary) {
        this.cloudinary = cloudinary;
    }

    // Upload product image to Cloudinary
    public Map<String, String> uploadImage(
            MultipartFile file
    ) throws IOException {

        // Validate empty file
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException(
                    "Please select an image."
            );
        }

        // Validate file size (maximum 5MB)
        if (file.getSize() > 5 * 1024 * 1024) {
            throw new IllegalArgumentException(
                    "Image size must not exceed 5MB."
            );
        }

        // Validate image type
        String contentType = file.getContentType();

        if (!"image/jpeg".equals(contentType)
                && !"image/png".equals(contentType)
                && !"image/webp".equals(contentType)) {

            throw new IllegalArgumentException(
                    "Only JPG, PNG and WebP images are allowed."
            );
        }

        // Upload image to Cloudinary
        Map<?, ?> result = cloudinary.uploader().upload(
                file.getBytes(),
                ObjectUtils.asMap(
                        "folder", "thors/products",
                        "resource_type", "image"
                )
        );

        // Return image URL and Cloudinary public ID
        return Map.of(
                "imageUrl",
                result.get("secure_url").toString(),

                "publicId",
                result.get("public_id").toString()
        );
    }

    // Delete image from Cloudinary
    public void deleteImage(String publicId)
            throws IOException {

        if (publicId == null || publicId.isBlank()) {
            throw new IllegalArgumentException(
                    "Cloudinary public ID is required."
            );
        }

        cloudinary.uploader().destroy(
                publicId,
                ObjectUtils.emptyMap()
        );
    }
}
