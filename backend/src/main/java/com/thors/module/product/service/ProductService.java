
package com.thors.module.product.service;

import com.thors.module.product.dto.CreateProductRequest;
import com.thors.module.product.dto.BatchCreateProductRequest;
import com.thors.module.product.entity.Product;
import com.thors.module.product.repository.ProductRepository;
import com.thors.module.product.repository.ProductImageRepository;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import com.thors.module.product.dto.UpdateProductRequest;

import com.thors.common.ApiException;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;


@Service
public class ProductService {

    private static final Logger logger =
            LoggerFactory.getLogger(ProductService.class);

    private static final BigDecimal MAX_PRICE =
            new BigDecimal("999999999999");

    // Tối đa số ảnh đang dùng của một sản phẩm
    private static final int MAX_IMAGES = 10;

    // Tiền tố size tạm khi đổi size/màu biến thể (xem updateProduct bước 9a)
    private static final String TEMP_SIZE_PREFIX = "~";

    private final ProductRepository productRepository;
    private final JdbcTemplate jdbcTemplate;
    private final ProductImageService productImageService;
    private final ProductImageRepository productImageRepository;

    public ProductService(
            ProductRepository productRepository,
            JdbcTemplate jdbcTemplate,
            ProductImageService productImageService,
            ProductImageRepository productImageRepository
    ) {
        this.productRepository = productRepository;
        this.jdbcTemplate = jdbcTemplate;
        this.productImageService = productImageService;
        this.productImageRepository = productImageRepository;
    }

    // ==========================================
    // VIEW PRODUCT LIST
    // ==========================================

    @Transactional(readOnly = true)
    public List<Product> getAllProducts() {
        return productRepository.findAll();
    }

    // ==========================================
    // VIEW PRODUCT DETAIL
    // ==========================================

    @Transactional(readOnly = true)
    public Map<String, Object> getProductById(int productId) {

        // Validate product ID
        if (productId <= 0) {
            throw new IllegalArgumentException(
                    "Invalid product ID."
            );
        }

        // Get product information
        Product product = productRepository.findById(productId);

        // Check whether product exists
        if (product == null) {
            throw new ApiException(404, "PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm.");
        }

        // Get product variants
        List<Map<String, Object>> variants =
                productRepository.findVariantsByProductId(productId);

        // Get product images
        List<Map<String, Object>> images =
                productRepository.findImagesByProductId(productId);

        // Build response
        Map<String, Object> result = new LinkedHashMap<>();

        result.put("product", product);
        result.put("variants", variants);
        result.put("images", images);
        // Gửi lại khi lưu chỉnh sửa để phát hiện người khác đã sửa trong lúc đó
        result.put("version", computeVersion(product, variants));

        return result;
    }

    // ==========================================
    // ADD PRODUCT - JSON
    // ==========================================

    @Transactional
    public int createProduct(CreateProductRequest request) {

        validateProduct(request);

        return saveProductAndVariants(request);
    }

    // ==========================================
    // BATCH CREATE PRODUCTS
    // ==========================================

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> createProductsBatch(
            BatchCreateProductRequest batchRequest
    ) {
        if (batchRequest == null || batchRequest.getProducts() == null || batchRequest.getProducts().isEmpty()) {
            throw new IllegalArgumentException("Product list must not be empty.");
        }

        List<CreateProductRequest> products = batchRequest.getProducts();
        if (products.size() > 500) {
            throw new IllegalArgumentException("Maximum 500 products per batch import.");
        }

        // Validate all products first before inserting
        for (int i = 0; i < products.size(); i++) {
            CreateProductRequest req = products.get(i);
            try {
                validateProduct(req);
            } catch (IllegalArgumentException ex) {
                String name = req != null && req.getProductName() != null ? req.getProductName() : ("#" + (i + 1));
                throw new IllegalArgumentException("Product [" + name + "]: " + ex.getMessage());
            }
        }

        int totalCreated = 0;
        int totalVariants = 0;
        List<Integer> createdProductIds = new ArrayList<>();

        for (CreateProductRequest req : products) {
            int productId = saveProductAndVariants(req);
            createdProductIds.add(productId);
            totalCreated++;
            totalVariants += req.getVariants().size();
        }

        logger.info("Batch created {} products with {} total variants", totalCreated, totalVariants);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("message", "Batch import completed successfully.");
        result.put("totalProducts", totalCreated);
        result.put("totalVariants", totalVariants);
        result.put("productIds", createdProductIds);

        return result;
    }

    // ==========================================
    // VALIDATE PRODUCT
    // ==========================================

    private void validateProduct(CreateProductRequest request) {

        if (request == null) {
            throw new IllegalArgumentException(
                    "Product information is required."
            );
        }

        // Validate product name
        String productName = request.getProductName();

        if (productName == null || productName.isBlank()) {
            throw new IllegalArgumentException(
                    "Product name is required."
            );
        }

        productName = productName.trim();

        if (productName.length() > 200) {
            throw new IllegalArgumentException(
                    "Product name must not exceed 200 characters."
            );
        }

        // Validate category
        if (request.getCategoryId() == null) {
            throw new IllegalArgumentException(
                    "Category is required."
            );
        }

        Integer activeCategoryCount = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                FROM category
                WHERE category_id = ?
                  AND status = 'ACTIVE'
                """,
                Integer.class,
                request.getCategoryId()
        );

        if (activeCategoryCount == null
                || activeCategoryCount == 0) {
            throw new IllegalArgumentException(
                    "Please select an active category."
            );
        }

        // Validate variants
        List<CreateProductRequest.VariantRequest> variants =
                request.getVariants();

        if (variants == null || variants.isEmpty()) {
            throw new IllegalArgumentException(
                    "At least one product variant is required."
            );
        }

        Set<String> combinations = new HashSet<>();

        for (CreateProductRequest.VariantRequest variant : variants) {

            if (variant == null) {
                throw new IllegalArgumentException(
                        "Invalid product variant."
                );
            }

            String size = variant.getSize();
            String color = variant.getColor();
            BigDecimal price = variant.getPrice();

            // Validate size
            if (size == null
                    || size.isBlank()
                    || size.trim().length() > 10) {
                throw new IllegalArgumentException(
                        "Size is required and must not exceed 10 characters."
                );
            }

            // Validate color
            if (color == null
                    || color.isBlank()
                    || color.trim().length() > 30) {
                throw new IllegalArgumentException(
                        "Color is required and must not exceed 30 characters."
                );
            }

            // Validate price
            if (price == null
                    || price.compareTo(BigDecimal.ZERO) < 0
                    || price.scale() > 0
                    || price.compareTo(MAX_PRICE) > 0) {
                throw new IllegalArgumentException(
                        "Price must be a valid non-negative VND amount."
                );
            }

            // Normalize size and color
            size = size.trim();
            color = color.trim();

            variant.setSize(size);
            variant.setColor(color);

            // Check duplicate size + color
            String combination =
                    size.toLowerCase(Locale.ROOT)
                            + "\u0000"
                            + color.toLowerCase(Locale.ROOT);

            if (!combinations.add(combination)) {
                throw new IllegalArgumentException(
                        "Duplicate size and color combination."
                );
            }
        }

        // Normalize product data
        request.setProductName(productName);

        if (request.getDescription() != null) {
            request.setDescription(
                    request.getDescription().trim()
            );
        }

        if (request.getImageUrl() != null && !request.getImageUrl().isBlank()) {
            String url = request.getImageUrl().trim();
            if (url.length() > 500) {
                throw new IllegalArgumentException("Image URL must not exceed 500 characters.");
            }
            if (!url.startsWith("http://") && !url.startsWith("https://")) {
                throw new IllegalArgumentException("Image URL must start with http:// or https://");
            }
            request.setImageUrl(url);
        }
    }

    // ==========================================
    // SAVE PRODUCT AND VARIANTS
    // ==========================================

    private int saveProductAndVariants(
            CreateProductRequest request
    ) {

        // Save product
        int productId =
                productRepository.insertProduct(request);

        // Save product variants
        for (CreateProductRequest.VariantRequest variant
                : request.getVariants()) {

            productRepository.insertVariant(
                    productId,
                    variant
            );
        }

        // Save primary image if imageUrl is provided (e.g. from Excel batch import)
        if (request.getImageUrl() != null && !request.getImageUrl().isBlank()) {
            productImageRepository.insertImage(
                    productId,
                    request.getImageUrl().trim(),
                    null,
                    true
            );
        }

        return productId;
    }

    // ==========================================
    // ADD PRODUCT WITH IMAGES
    // ==========================================

    @Transactional(rollbackFor = Exception.class)
    public int createProductWithImages(
            CreateProductRequest request,
            List<MultipartFile> images
    ) throws IOException {

        // Validate product before uploading
        validateProduct(request);

        // Validate image list
        if (images == null || images.isEmpty()) {
            throw new IllegalArgumentException(
                    "At least one product image is required."
            );
        }

        if (images.size() > 10) {
            throw new IllegalArgumentException(
                    "Maximum 10 images per product."
            );
        }

        // Check transaction synchronization
        if (!TransactionSynchronizationManager
                .isSynchronizationActive()) {
            throw new IllegalStateException(
                    "Database transaction is required."
            );
        }

        List<String> uploadedPublicIds = new ArrayList<>();

        List<Map<String, String>> uploadedImages =
                new ArrayList<>();

        // Cleanup Cloudinary images if transaction fails
        TransactionSynchronizationManager.registerSynchronization(
                new TransactionSynchronization() {

                    @Override
                    public void afterCompletion(int status) {

                        if (status != STATUS_COMMITTED) {
                            cleanupImages(uploadedPublicIds);
                        }
                    }
                }
        );

        // Upload images to Cloudinary
        for (MultipartFile image : images) {

            Map<String, String> result =
                    productImageService.uploadImage(image);

            uploadedImages.add(result);
            uploadedPublicIds.add(result.get("publicId"));
        }

        // Save product and variants to MySQL
        int productId = saveProductAndVariants(request);

        // Save image information to MySQL
        for (int i = 0; i < uploadedImages.size(); i++) {

            Map<String, String> image = uploadedImages.get(i);

            productImageRepository.insertImage(
                    productId,
                    image.get("imageUrl"),
                    image.get("publicId"),
                    i == 0
            );
        }

        logger.info(
                "Product {} created with {} images",
                productId,
                uploadedImages.size()
        );

        return productId;
    }

    // ==========================================
    // CLEAN UP CLOUDINARY IMAGES
    // ==========================================

    private void cleanupImages(List<String> publicIds) {

        for (String publicId : publicIds) {

            try {

                productImageService.deleteImage(publicId);

                logger.info(
                        "Deleted Cloudinary image: {}",
                        publicId
                );

            } catch (Exception cleanupEx) {

                logger.error(
                        "Failed to delete Cloudinary image: {}",
                        publicId,
                        cleanupEx
                );
            }
        }
    }

    public Map<String, Object> getProductStatistics() {
        int lowStockThreshold = 5;

        return productRepository.getProductStatistics(lowStockThreshold);
    }

    // ==========================================
    // UPDATE PRODUCT
    // ==========================================

    @Transactional
    public void updateProduct(
            int productId,
            UpdateProductRequest request
    ) {

        // 1. Validate product ID
        if (productId <= 0) {
            throw badRequest("PRODUCT_ID", "Mã sản phẩm không hợp lệ.");
        }

        // 2. Check product existence
        Product existingProduct =
                productRepository.findById(productId);

        if (existingProduct == null) {
            throw new ApiException(404, "PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm.");
        }

        // 3. Validate request
        if (request == null) {
            throw badRequest("PRODUCT_REQUIRED", "Thiếu thông tin sản phẩm.");
        }

        // Existing variants in database
        List<Map<String, Object>> existingVariants =
                productRepository.findVariantsByProductId(productId);

        // 3b. Chống ghi đè: dữ liệu đã đổi kể từ lúc mở form => từ chối, yêu cầu tải lại
        String expectedVersion = request.getVersion();

        if (expectedVersion != null && !expectedVersion.isBlank()) {
            String currentVersion = computeVersion(existingProduct, existingVariants);

            if (!currentVersion.equals(expectedVersion)) {
                throw new ApiException(
                        409,
                        "PRODUCT_VERSION_CONFLICT",
                        "Sản phẩm vừa được người khác cập nhật. "
                                + "Vui lòng tải lại trang để xem dữ liệu mới nhất trước khi lưu."
                );
            }
        }

        String productName = request.getProductName();

        if (productName == null || productName.isBlank()) {
            throw badRequest("PRODUCT_NAME", "Vui lòng nhập tên sản phẩm.");
        }

        productName = productName.trim();

        if (productName.length() > 200) {
            throw badRequest("PRODUCT_NAME", "Tên sản phẩm không được vượt quá 200 ký tự.");
        }

        // 4. Validate category
        Integer categoryId = request.getCategoryId();

        if (categoryId == null) {
            throw badRequest("CATEGORY_REQUIRED", "Vui lòng chọn danh mục cho sản phẩm.");
        }

        // Giữ nguyên danh mục cũ thì luôn cho lưu (kể cả khi danh mục đó đã ngưng hoạt động),
        // để Owner vẫn sửa được giá/tên. Chỉ khi chuyển SANG danh mục khác mới yêu cầu danh mục đó đang hoạt động.
        boolean categoryChanged =
                !categoryId.equals(existingProduct.getCategoryId());

        if (categoryChanged) {
            Integer activeCategoryCount =
                    jdbcTemplate.queryForObject(
                            """
                            SELECT COUNT(*)
                            FROM category
                            WHERE category_id = ?
                              AND status = 'ACTIVE'
                            """,
                            Integer.class,
                            categoryId
                    );

            if (activeCategoryCount == null
                    || activeCategoryCount == 0) {
                throw badRequest(
                        "CATEGORY_INACTIVE",
                        "Danh mục được chọn không tồn tại hoặc đã ngưng hoạt động."
                );
            }
        }

        // 5. Validate variants
        List<UpdateProductRequest.VariantRequest> variants =
                request.getVariants();

        if (variants == null || variants.isEmpty()) {
            throw badRequest("VARIANT_REQUIRED", "Sản phẩm phải có ít nhất một biến thể.");
        }

        Map<Integer, Map<String, Object>> existingById = new LinkedHashMap<>();

        for (Map<String, Object> existing : existingVariants) {
            existingById.put(
                    ((Number) existing.get("detailId")).intValue(),
                    existing
            );
        }

        Set<Integer> submittedVariantIds = new HashSet<>();
        Set<String> combinations = new HashSet<>();

        // 6. Validate every submitted variant
        for (UpdateProductRequest.VariantRequest variant : variants) {

            if (variant == null) {
                throw badRequest("VARIANT_INVALID", "Biến thể sản phẩm không hợp lệ.");
            }

            Integer detailId = variant.getDetailId();

            // Existing variant must belong to this product
            if (detailId != null) {

                if (!existingById.containsKey(detailId)) {
                    throw badRequest("VARIANT_NOT_IN_PRODUCT", "Biến thể #" + detailId + " không thuộc sản phẩm này.");
                }

                if (!submittedVariantIds.add(detailId)) {
                    throw badRequest("VARIANT_DUPLICATE_ID", "Biến thể #" + detailId + " bị gửi trùng.");
                }
            }

            String size = variant.getSize();
            String color = variant.getColor();
            BigDecimal price = variant.getPrice();

            // Validate size
            if (size == null
                    || size.isBlank()
                    || size.trim().length() > 10) {
                throw badRequest("VARIANT_SIZE", "Kích thước (size) là bắt buộc và không quá 10 ký tự.");
            }

            // Ký tự "~" dành cho bước đổi tên tạm thời bên dưới
            if (size.trim().startsWith(TEMP_SIZE_PREFIX)) {
                throw badRequest("VARIANT_SIZE", "Kích thước không được bắt đầu bằng ký tự \"~\".");
            }

            // Validate color
            if (color == null
                    || color.isBlank()
                    || color.trim().length() > 30) {
                throw badRequest("VARIANT_COLOR", "Màu sắc là bắt buộc và không quá 30 ký tự.");
            }

            // Validate price
            if (price == null
                    || price.compareTo(BigDecimal.ZERO) < 0
                    || price.stripTrailingZeros().scale() > 0
                    || price.compareTo(MAX_PRICE) > 0) {
                throw badRequest("VARIANT_PRICE", "Giá bán phải là số nguyên không âm hợp lệ (VNĐ).");
            }

            size = size.trim();
            color = color.trim();

            variant.setSize(size);
            variant.setColor(color);

            // Biến thể đã có tồn kho / lịch sử bán, nhập, xếp kệ: không cho đổi size, màu
            // (hàng thật trên kệ, mã vạch đã in và lịch sử sẽ bị lệch). Chỉ được sửa giá.
            if (detailId != null) {
                Map<String, Object> existing = existingById.get(detailId);

                boolean renamed =
                        !size.equals(String.valueOf(existing.get("size")).trim())
                                || !color.equals(String.valueOf(existing.get("color")).trim());

                if (renamed && isTrue(existing.get("locked"))) {
                    throw badRequest(
                            "VARIANT_LOCKED",
                            "Biến thể #" + detailId + " (" + existing.get("size") + " / " + existing.get("color")
                                    + ") đã có tồn kho hoặc lịch sử bán/nhập kho nên không thể đổi kích thước "
                                    + "hoặc màu sắc. Chỉ được sửa giá; hãy thêm biến thể mới nếu cần."
                    );
                }
            }

            String combination =
                    size.toLowerCase(Locale.ROOT)
                            + "\u0000"
                            + color.toLowerCase(Locale.ROOT);

            if (!combinations.add(combination)) {
                throw badRequest(
                        "VARIANT_DUPLICATE",
                        "Biến thể size \"" + size + "\" và màu \"" + color + "\" bị trùng lặp."
                );
            }
        }

        // 7. Check against existing variants omitted from request
        // Omitted variants are retained, not deleted.
        for (Map<String, Object> existing : existingVariants) {

            int existingId =
                    ((Number) existing.get("detailId")).intValue();

            if (submittedVariantIds.contains(existingId)) {
                continue;
            }

            String existingSize =
                    String.valueOf(existing.get("size"))
                            .trim()
                            .toLowerCase(Locale.ROOT);

            String existingColor =
                    String.valueOf(existing.get("color"))
                            .trim()
                            .toLowerCase(Locale.ROOT);

            String combination =
                    existingSize + "\u0000" + existingColor;

            if (!combinations.add(combination)) {
                throw badRequest(
                        "VARIANT_DUPLICATE",
                        "Biến thể size \"" + existing.get("size") + "\" và màu \""
                                + existing.get("color") + "\" đã tồn tại trong sản phẩm."
                );
            }
        }

        // 8. Update product information
        String description = request.getDescription();

        if (description != null) {
            description = description.trim();
        }

        int updatedRows = productRepository.updateProduct(
                productId,
                categoryId,
                productName,
                description
        );

        if (updatedRows != 1) {
            throw new ApiException(500, "PRODUCT_UPDATE_FAILED", "Không cập nhật được sản phẩm. Vui lòng thử lại.");
        }

        // 9a. Biến thể đổi size/màu: chuyển sang tên tạm trước (size = "~<detailId>", luôn duy nhất)
        // để hoán đổi size/màu giữa hai biến thể (M <-> L) không vướng UNIQUE (product_id, size, color)
        // giữa chừng. Cả hai bước chạy trong cùng transaction.
        for (UpdateProductRequest.VariantRequest variant : variants) {

            Integer detailId = variant.getDetailId();

            if (detailId == null) {
                continue;
            }

            Map<String, Object> existing = existingById.get(detailId);

            boolean renamed =
                    !variant.getSize().equals(String.valueOf(existing.get("size")).trim())
                            || !variant.getColor().equals(String.valueOf(existing.get("color")).trim());

            if (renamed) {
                updateVariantOrFail(
                        productId,
                        detailId,
                        TEMP_SIZE_PREFIX + detailId,
                        variant.getColor(),
                        variant.getPrice()
                );
            }
        }

        // 9b. Update existing variants or insert new ones
        for (UpdateProductRequest.VariantRequest variant : variants) {

            Integer detailId = variant.getDetailId();

            if (detailId != null) {

                updateVariantOrFail(
                        productId,
                        detailId,
                        variant.getSize(),
                        variant.getColor(),
                        variant.getPrice()
                );

            } else {

                productRepository.insertNewVariant(
                        productId,
                        variant.getSize(),
                        variant.getColor(),
                        variant.getPrice()
                );
            }
        }

        logger.info(
                "Product {} updated successfully",
                productId
        );
    }

    private void updateVariantOrFail(
            int productId,
            int detailId,
            String size,
            String color,
            BigDecimal price
    ) {
        int rows = productRepository.updateVariant(
                productId,
                detailId,
                size,
                color,
                price
        );

        if (rows != 1) {
            throw new ApiException(
                    500,
                    "VARIANT_UPDATE_FAILED",
                    "Không cập nhật được biến thể #" + detailId + ". Vui lòng thử lại."
            );
        }
    }

    private static ApiException badRequest(String code, String message) {
        return new ApiException(400, code, message);
    }

    private static boolean isTrue(Object value) {
        if (value instanceof Boolean b) {
            return b;
        }
        if (value instanceof Number n) {
            return n.intValue() != 0;
        }
        return false;
    }

    /**
     * Phiên bản nội dung sửa được của sản phẩm (tên, danh mục, mô tả, size/màu/giá từng biến thể).
     * Không tính tồn kho để bán hàng/nhập kho trong lúc Owner đang sửa không làm hỏng việc lưu.
     */
    String computeVersion(
            Product product,
            List<Map<String, Object>> variants
    ) {
        StringBuilder raw = new StringBuilder()
                .append(product.getCategoryId()).append('|')
                .append(product.getProductName()).append('|')
                .append(product.getDescription());

        for (Map<String, Object> v : variants) {
            Object price = v.get("price");
            String priceText = price instanceof BigDecimal p
                    ? p.stripTrailingZeros().toPlainString()
                    : String.valueOf(price);

            raw.append('#').append(v.get("detailId"))
                    .append('|').append(v.get("size"))
                    .append('|').append(v.get("color"))
                    .append('|').append(priceText);
        }

        try {
            byte[] hash = MessageDigest.getInstance("SHA-256")
                    .digest(raw.toString().getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash, 0, 16);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    // ==========================================
    // PRODUCT IMAGES (thêm / xóa / chọn ảnh chính khi chỉnh sửa)
    // ==========================================

    private Product requireProduct(int productId) {
        Product product = productId > 0 ? productRepository.findById(productId) : null;

        if (product == null) {
            throw new ApiException(404, "PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm.");
        }

        return product;
    }

    @Transactional(rollbackFor = Exception.class)
    public List<Map<String, Object>> addProductImages(
            int productId,
            List<MultipartFile> images
    ) throws IOException {

        requireProduct(productId);

        if (images == null || images.isEmpty()) {
            throw badRequest("IMAGE_REQUIRED", "Vui lòng chọn ít nhất một ảnh.");
        }

        int current = productImageRepository.countActiveImages(productId);

        if (current + images.size() > MAX_IMAGES) {
            throw badRequest(
                    "IMAGE_LIMIT",
                    "Mỗi sản phẩm tối đa " + MAX_IMAGES + " ảnh (hiện có " + current + " ảnh)."
            );
        }

        List<String> uploadedPublicIds = new ArrayList<>();

        // Lưu DB thất bại thì xóa các ảnh vừa tải lên Cloudinary
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(
                    new TransactionSynchronization() {
                        @Override
                        public void afterCompletion(int status) {
                            if (status != STATUS_COMMITTED) {
                                cleanupImages(uploadedPublicIds);
                            }
                        }
                    }
            );
        }

        for (int i = 0; i < images.size(); i++) {
            Map<String, String> uploaded = productImageService.uploadImage(images.get(i));
            uploadedPublicIds.add(uploaded.get("publicId"));

            productImageRepository.insertImage(
                    productId,
                    uploaded.get("imageUrl"),
                    uploaded.get("publicId"),
                    current == 0 && i == 0
            );
        }

        productImageRepository.ensurePrimaryImage(productId);

        return productRepository.findImagesByProductId(productId);
    }

    @Transactional
    public List<Map<String, Object>> deleteProductImage(
            int productId,
            int imageId
    ) {
        requireProduct(productId);

        if (!productImageRepository.existsActiveImage(productId, imageId)) {
            throw new ApiException(404, "IMAGE_NOT_FOUND", "Không tìm thấy ảnh của sản phẩm.");
        }

        if (productImageRepository.countActiveImages(productId) <= 1) {
            throw badRequest("IMAGE_LAST", "Sản phẩm phải còn ít nhất một ảnh.");
        }

        // Xóa mềm (giữ lịch sử, không xóa file trên Cloudinary)
        productImageRepository.softDeleteImage(productId, imageId);
        productImageRepository.ensurePrimaryImage(productId);

        return productRepository.findImagesByProductId(productId);
    }

    @Transactional
    public List<Map<String, Object>> setPrimaryProductImage(
            int productId,
            int imageId
    ) {
        requireProduct(productId);

        if (!productImageRepository.existsActiveImage(productId, imageId)) {
            throw new ApiException(404, "IMAGE_NOT_FOUND", "Không tìm thấy ảnh của sản phẩm.");
        }

        productImageRepository.setPrimaryImage(productId, imageId);

        return productRepository.findImagesByProductId(productId);
    }

    @Transactional
    public void changeProductStatus(int productId, String newStatus) {

        // 1. Validate product ID
        if (productId <= 0) {
            throw new IllegalArgumentException(
                    "Invalid product ID."
            );
        }

        // 2. Validate requested status
        if (newStatus == null ||
                (!newStatus.equals("ACTIVE") &&
                        !newStatus.equals("INACTIVE"))) {

            throw new IllegalArgumentException(
                    "Product status must be ACTIVE or INACTIVE."
            );
        }

        // 3. Check whether product exists
        Map<String, Object> productDetail =
                getProductById(productId);

        if (productDetail == null ||
                productDetail.get("product") == null) {

            throw new IllegalArgumentException(
                    "Product not found."
            );
        }

        // 4. Check current status
        Object productObject = productDetail.get("product");

        if (!(productObject instanceof Product product)) {
            throw new IllegalStateException(
                    "Invalid product data."
            );
        }

        String currentStatus = product.getStatus();

        if (newStatus.equals(currentStatus)) {
            throw new IllegalArgumentException(
                    "Product already has the requested status."
            );
        }

        // 5. Update product status
        int updatedRows = productRepository.updateProductStatus(
                productId,
                newStatus
        );

        if (updatedRows != 1) {
            throw new IllegalStateException(
                    "Unable to update product status."
            );
        }
    }

    // ==========================================
    // DELETE PRODUCT (SAFE DELETE)
    // ==========================================

    @Transactional
    public void deleteProduct(int productId) {

        // 1. Validate product ID
        if (productId <= 0) {
            throw new IllegalArgumentException(
                    "Invalid product ID."
            );
        }

        // 2. Check whether product exists
        Product product = productRepository.findById(productId);
        if (product == null) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Product not found."
            );
        }

        // 3. Check for transaction constraints (orders, receipts, shelves, adjustments)
        int transactionCount = productRepository.countTransactionsByProductId(productId);
        if (transactionCount > 0) {
            throw new IllegalArgumentException(
                    "Sản phẩm đã có lịch sử giao dịch (đơn hàng, nhập kho hoặc vị trí kệ), không thể xóa vĩnh viễn. Vui lòng chuyển trạng thái sang Ẩn (INACTIVE)."
            );
        }

        // 4. Clean up Cloudinary images if any
        try {
            List<String> publicIds = productRepository.findCloudinaryPublicIds(productId);
            for (String pid : publicIds) {
                if (pid != null && !pid.isBlank()) {
                    try {
                        productImageService.deleteImage(pid);
                    } catch (Exception e) {
                        logger.warn("Failed to delete Cloudinary image {}: {}", pid, e.getMessage());
                    }
                }
            }
        } catch (Exception e) {
            logger.warn("Failed to clean up Cloudinary images for product {}: {}", productId, e.getMessage());
        }

        // 5. Cascade delete all product data
        productRepository.deleteProductCascaded(productId);
        logger.info("Product {} deleted successfully", productId);
    }

}
