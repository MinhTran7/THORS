
package com.thors.module.product.service;

import com.thors.module.product.dto.CreateProductRequest;
import com.thors.module.product.dto.BatchCreateProductRequest;
import com.thors.module.product.entity.Product;
import com.thors.module.product.repository.ProductRepository;
import com.thors.module.product.repository.ProductImageRepository;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.BadSqlGrammarException;
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
    // Mã sản phẩm (SKU) + mã biến thể
    private final ProductCodes codes;

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
        this.codes = new ProductCodes(jdbcTemplate);
    }

    // ==========================================
    // GỢI Ý MÃ SẢN PHẨM (SKU)
    // ==========================================

    /** SKU kế tiếp theo danh mục (vd "Giày nam" -> GN-0004), dùng cho nút "Tạo tự động". */
    @Transactional(readOnly = true)
    public String suggestSku(Integer categoryId) {
        if (!codes.supportsSku()) {
            throw new ApiException(
                    409,
                    "SKU_UNAVAILABLE",
                    "Cơ sở dữ liệu chưa hỗ trợ mã sản phẩm (SKU). Hãy chạy migration database/migrations/2026-11-10_product_sku.sql."
            );
        }
        return codes.suggestSku(categoryId);
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
                    "Mã sản phẩm không hợp lệ."
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

        // Ngưỡng tồn tối thiểu từng biến thể (null = chưa đặt) để trang chi tiết báo "sắp hết"
        // đúng như màn hình Tồn kho
        Map<Integer, Integer> minStock = productRepository.findMinStockByProductId(productId);
        for (Map<String, Object> variant : variants) {
            Object id = variant.get("detailId");
            variant.put("minStockQuantity", id instanceof Number n ? minStock.get(n.intValue()) : null);
        }

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
            throw new IllegalArgumentException("Danh sách sản phẩm trống.");
        }

        List<CreateProductRequest> products = batchRequest.getProducts();
        if (products.size() > 500) {
            throw new IllegalArgumentException("Mỗi lần nhập tối đa 500 sản phẩm.");
        }

        // Validate all products first before inserting
        for (int i = 0; i < products.size(); i++) {
            CreateProductRequest req = products.get(i);
            try {
                validateProduct(req);
            } catch (IllegalArgumentException ex) {
                String name = req != null && req.getProductName() != null ? req.getProductName() : ("#" + (i + 1));
                throw new IllegalArgumentException("Sản phẩm [" + name + "]: " + ex.getMessage());
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
        result.put("message", "Nhập sản phẩm thành công.");
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
                    "Thiếu thông tin sản phẩm."
            );
        }

        // Validate product name
        String productName = request.getProductName();

        if (productName == null || productName.isBlank()) {
            throw new IllegalArgumentException(
                    "Vui lòng nhập tên sản phẩm."
            );
        }

        productName = productName.trim();

        if (productName.length() > 200) {
            throw new IllegalArgumentException(
                    "Tên sản phẩm không được vượt quá 200 ký tự."
            );
        }

        // Validate category
        if (request.getCategoryId() == null) {
            throw new IllegalArgumentException(
                    "Vui lòng chọn danh mục cho sản phẩm."
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
                    "Danh mục được chọn không tồn tại hoặc đã ngưng hoạt động."
            );
        }

        requireLeafCategory(request.getCategoryId());

        // Validate variants
        List<CreateProductRequest.VariantRequest> variants =
                request.getVariants();

        if (variants == null || variants.isEmpty()) {
            throw new IllegalArgumentException(
                    "Sản phẩm phải có ít nhất một biến thể."
            );
        }

        Set<String> combinations = new HashSet<>();
        Set<String> variantCodes = new HashSet<>();

        for (CreateProductRequest.VariantRequest variant : variants) {

            if (variant == null) {
                throw new IllegalArgumentException(
                        "Biến thể sản phẩm không hợp lệ."
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
                        "Kích thước (size) là bắt buộc và không quá 10 ký tự."
                );
            }

            // Validate color
            if (color == null
                    || color.isBlank()
                    || color.trim().length() > 30) {
                throw new IllegalArgumentException(
                        "Màu sắc là bắt buộc và không quá 30 ký tự."
                );
            }

            // Validate price: cho phép 0 vì Kho (WarehouseCatalog quick-create) gửi 0 làm giá tạm
            // khi chưa có giá bán rồi đặt lại NULL; form Thêm sản phẩm tự bắt giá > 0 ở frontend.
            if (price == null
                    || price.compareTo(BigDecimal.ZERO) < 0
                    || price.stripTrailingZeros().scale() > 0
                    || price.compareTo(MAX_PRICE) > 0) {
                throw new IllegalArgumentException(
                        "Giá bán phải là số nguyên không âm (VNĐ)."
                );
            }

            // Normalize size and color
            size = size.trim();
            color = color.trim();

            variant.setSize(size);
            variant.setColor(color);

            // Check duplicate size + color (không phân biệt hoa/thường và dấu: "Đen" trùng "Den",
            // giống cách DB so khóa uq_product_detail_1)
            String combination = ProductCodes.variantKey(size, color);

            if (!combinations.add(combination)) {
                throw new IllegalArgumentException(
                        "Biến thể size \"" + size + "\" và màu \"" + color
                                + "\" bị trùng (không phân biệt hoa/thường và dấu)."
                );
            }

            // Mã biến thể nhập tay (để trống = tự tạo)
            String code = ProductCodes.normalizeVariantCode(variant.getCode());
            if (code != null && !variantCodes.add(code)) {
                throw new IllegalArgumentException("Mã biến thể \"" + code + "\" bị trùng trong sản phẩm.");
            }
            variant.setCode(code);
        }

        // Mã sản phẩm (SKU) nhập tay (để trống = tự tạo khi lưu)
        request.setSku(ProductCodes.normalizeSku(request.getSku()));

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
                throw new IllegalArgumentException("Đường dẫn ảnh không được vượt quá 500 ký tự.");
            }
            if (!url.startsWith("http://") && !url.startsWith("https://")) {
                throw new IllegalArgumentException("Đường dẫn ảnh phải bắt đầu bằng http:// hoặc https://");
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

        // Mã sản phẩm (SKU): để trống -> tự tạo theo danh mục; DB chưa có cột sku -> bỏ qua
        String sku = null;
        if (codes.supportsSku()) {
            sku = request.getSku();
            if (sku == null) {
                sku = codes.suggestSku(request.getCategoryId());
            } else if (codes.skuExists(sku, null)) {
                throw new ApiException(409, "SKU_EXISTS",
                        "Mã sản phẩm \"" + sku + "\" đã được dùng cho sản phẩm khác.");
            }
        }
        request.setSku(sku);

        // Mã biến thể: mã nhập tay phải chưa ai dùng; còn lại tự tạo SKU-SIZE-MÀU
        Set<String> takenCodes = new HashSet<>();
        for (CreateProductRequest.VariantRequest variant : request.getVariants()) {
            String code = variant.getCode();
            if (code == null) continue;
            if (codes.variantCodeExists(code)) {
                throw new ApiException(409, "VARIANT_CODE_EXISTS",
                        "Mã biến thể \"" + code + "\" đã được dùng cho biến thể khác.");
            }
            takenCodes.add(code);
        }
        for (CreateProductRequest.VariantRequest variant : request.getVariants()) {
            if (variant.getCode() == null && sku != null) {
                variant.setCode(codes.uniqueVariantCode(sku, variant.getSize(), variant.getColor(), takenCodes));
            }
        }

        // Save product
        int productId;
        try {
            productId = productRepository.insertProduct(request);

            // Save product variants
            for (CreateProductRequest.VariantRequest variant
                    : request.getVariants()) {

                productRepository.insertVariant(
                        productId,
                        variant
                );
            }
        } catch (org.springframework.dao.DuplicateKeyException e) {
            // Hai người tạo cùng lúc lấy trùng mã, hoặc biến thể trùng theo cách so của DB
            throw new ApiException(409, "PRODUCT_CODE_CONFLICT",
                    "Mã sản phẩm, mã biến thể hoặc biến thể (size + màu) bị trùng. Vui lòng thử lại.");
        }

        // Mở bán online ngay (chỉ biến thể đã có giá)
        if (Boolean.TRUE.equals(request.getOnlineSalesEnabled())) {
            productRepository.updateProductOnline(productId, true);
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
                    "Vui lòng tải lên ít nhất một hình ảnh cho sản phẩm."
            );
        }

        if (images.size() > 10) {
            throw new IllegalArgumentException(
                    "Mỗi sản phẩm tối đa 10 hình ảnh."
            );
        }

        // Check transaction synchronization
        if (!TransactionSynchronizationManager
                .isSynchronizationActive()) {
            throw new IllegalStateException(
                    "Thiếu giao dịch cơ sở dữ liệu."
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

        // 3c. Mã sản phẩm (SKU): rỗng = giữ nguyên
        String requestedSku = ProductCodes.normalizeSku(request.getSku());

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

            requireLeafCategory(categoryId);
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

            String combination = ProductCodes.variantKey(size, color);

            if (!combinations.add(combination)) {
                throw badRequest(
                        "VARIANT_DUPLICATE",
                        "Biến thể size \"" + size + "\" và màu \"" + color
                                + "\" bị trùng lặp (không phân biệt hoa/thường và dấu)."
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

            String combination = ProductCodes.variantKey(
                    String.valueOf(existing.get("size")),
                    String.valueOf(existing.get("color")));

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

        // 8b. Mã sản phẩm (SKU): đổi nếu nhập mã mới; sản phẩm cũ chưa có mã thì tự tạo
        String productSku = null;
        if (codes.supportsSku()) {
            productSku = existingProduct.getSku();
            String nextSku = requestedSku != null ? requestedSku
                    : productSku == null ? codes.suggestSku(categoryId) : null;
            if (nextSku != null && !nextSku.equals(productSku)) {
                if (codes.skuExists(nextSku, productId)) {
                    throw new ApiException(409, "SKU_EXISTS",
                            "Mã sản phẩm \"" + nextSku + "\" đã được dùng cho sản phẩm khác.");
                }
                productRepository.updateProductSku(productId, nextSku);
                productSku = nextSku;
            }
        }
        Set<String> takenCodes = new HashSet<>();

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

                // Biến thể mới: tự tạo mã SKU-SIZE-MÀU (sản phẩm có SKU)
                productRepository.insertNewVariant(
                        productId,
                        variant.getSize(),
                        variant.getColor(),
                        variant.getPrice(),
                        productSku == null ? null
                                : codes.uniqueVariantCode(productSku, variant.getSize(), variant.getColor(), takenCodes)
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

    /**
     * Danh mục cha (đang có danh mục con, vd "Giày") không gắn trực tiếp sản phẩm:
     * phải chọn danh mục con (vd "Giày nam"). DB chưa chạy migration danh mục 2 cấp thì bỏ qua.
     */
    private void requireLeafCategory(Integer categoryId) {
        Integer children;
        try {
            children = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM category WHERE parent_id = ?",
                    Integer.class,
                    categoryId
            );
        } catch (BadSqlGrammarException e) {
            return;
        }
        if (children != null && children > 0) {
            throw badRequest(
                    "CATEGORY_HAS_CHILDREN",
                    "Danh mục này đang có danh mục con. Hãy chọn một danh mục con (ví dụ Giày nam, Giày nữ)."
            );
        }
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

    // ==========================================
    // CHANGE PRODUCT STATUS
    // ==========================================

    @Transactional
    public void changeProductStatus(int productId, String newStatus) {

        // 1. Validate requested status
        if (newStatus == null ||
                (!newStatus.equals("ACTIVE") &&
                        !newStatus.equals("INACTIVE"))) {
            throw badRequest("PRODUCT_STATUS", "Trạng thái sản phẩm chỉ được là Hoạt động hoặc Đã ẩn.");
        }

        // 2. Check whether product exists
        Product product = requireProduct(productId);

        // 3. Đã đúng trạng thái yêu cầu (vd. bấm 2 lần, hoặc người khác vừa đổi) => coi như xong
        if (newStatus.equals(product.getStatus())) {
            return;
        }

        // 4. Update product status
        int updatedRows = productRepository.updateProductStatus(
                productId,
                newStatus
        );

        if (updatedRows != 1) {
            throw new ApiException(500, "PRODUCT_STATUS_FAILED", "Không đổi được trạng thái sản phẩm. Vui lòng thử lại.");
        }
    }

    // ==========================================
    // BÁN ONLINE (bật/tắt nhanh trên danh sách và từng biến thể ở trang chi tiết)
    // ==========================================

    /** Bật/tắt bán online cho cả sản phẩm (mọi biến thể đang hoạt động). Trả về số biến thể đang bật. */
    @Transactional
    public Map<String, Object> setProductOnline(int productId, boolean enabled) {
        Product product = requireProduct(productId);

        if (enabled) {
            if (!"ACTIVE".equals(product.getStatus())) {
                throw badRequest(
                        "PRODUCT_INACTIVE",
                        "Sản phẩm đang ẩn. Hãy kích hoạt sản phẩm trước khi bật bán online."
                );
            }
            if (productRepository.countSellableVariants(productId) == 0) {
                throw badRequest(
                        "NO_SELLABLE_VARIANT",
                        "Sản phẩm chưa có biến thể đang hoạt động và có giá bán để bật bán online."
                );
            }
        }

        productRepository.updateProductOnline(productId, enabled);
        return onlineSummary(productId);
    }

    /** Bật/tắt bán online một biến thể. */
    @Transactional
    public Map<String, Object> setVariantOnline(int productId, int detailId, boolean enabled) {
        Product product = requireProduct(productId);

        Map<String, Object> variant = productRepository.findVariantsByProductId(productId).stream()
                .filter(v -> v.get("detailId") instanceof Number n && n.intValue() == detailId)
                .findFirst()
                .orElseThrow(() -> new ApiException(404, "VARIANT_NOT_FOUND", "Không tìm thấy biến thể #" + detailId + " của sản phẩm."));

        if (enabled) {
            if (!"ACTIVE".equals(product.getStatus())) {
                throw badRequest("PRODUCT_INACTIVE", "Sản phẩm đang ẩn. Hãy kích hoạt sản phẩm trước khi bật bán online.");
            }
            if (!"ACTIVE".equals(variant.get("status"))) {
                throw badRequest("VARIANT_INACTIVE", "Biến thể #" + detailId + " đang ngưng, không bật bán online được.");
            }
            if (variant.get("price") == null) {
                throw badRequest("VARIANT_NO_PRICE", "Biến thể #" + detailId + " chưa có giá bán.");
            }
        }

        productRepository.updateVariantOnline(productId, detailId, enabled);
        return onlineSummary(productId);
    }

    private Map<String, Object> onlineSummary(int productId) {
        Product updated = productRepository.findById(productId);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("productId", productId);
        result.put("onlineVariantCount", updated != null ? updated.getOnlineVariantCount() : 0);
        result.put("variantCount", updated != null ? updated.getVariantCount() : 0);
        return result;
    }

    // ==========================================
    // DELETE PRODUCT (SAFE DELETE)
    // ==========================================

    @Transactional
    public void deleteProduct(int productId) {

        // 1. Check whether product exists
        requireProduct(productId);

        // 2. Đã phát sinh dữ liệu khác (đơn, phiếu kho, vị trí, kiểm kê...) => không xóa, gợi ý ẩn
        List<String> blockers = productRepository.findDeleteBlockers(productId);
        if (!blockers.isEmpty()) {
            throw new ApiException(
                    409,
                    "PRODUCT_IN_USE",
                    "Sản phẩm đã có " + String.join(", ", blockers)
                            + " nên không thể xóa vĩnh viễn. Hãy chuyển sang Ẩn để ngừng bán và giữ lịch sử."
            );
        }

        // 3. Lấy danh sách ảnh trước khi xóa dữ liệu
        List<String> publicIds = productRepository.findCloudinaryPublicIds(productId);

        // 4. Cascade delete all product data
        productRepository.deleteProductCascaded(productId);

        // 5. Chỉ xóa ảnh trên Cloudinary SAU KHI database đã lưu thành công: nếu xóa DB thất bại
        // (transaction rollback) thì ảnh vẫn còn, sản phẩm không bị mất ảnh
        Runnable cleanup = () -> {
            for (String pid : publicIds) {
                if (pid == null || pid.isBlank()) continue;
                try {
                    productImageService.deleteImage(pid);
                } catch (Exception e) {
                    logger.warn("Failed to delete Cloudinary image {}: {}", pid, e.getMessage());
                }
            }
        };

        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    cleanup.run();
                }
            });
        } else {
            cleanup.run();
        }

        logger.info("Product {} deleted successfully", productId);
    }
}
