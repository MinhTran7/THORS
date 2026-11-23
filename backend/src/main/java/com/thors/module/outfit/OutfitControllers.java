package com.thors.module.outfit;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import com.thors.module.outfit.OutfitDtos.Alternative;
import com.thors.module.outfit.OutfitDtos.AlternativesRequest;
import com.thors.module.outfit.OutfitDtos.OutfitOptions;
import com.thors.module.outfit.OutfitDtos.OutfitRequest;
import com.thors.module.outfit.OutfitDtos.OutfitResponse;
import com.thors.module.outfit.OutfitDtos.ProductStyle;
import com.thors.module.outfit.OutfitDtos.ProductStyleRequest;
import com.thors.module.outfit.OutfitDtos.StyleProfile;
import com.thors.security.SessionAccess;
import java.util.List;
import org.springframework.web.bind.annotation.*;

/**
 * API phối đồ. Quyền theo SecurityConfig có sẵn:
 * /api/shop/** công khai; GET /api/products/** Owner + Family Member, PUT chỉ Owner; /api/body-profile/** cần đăng nhập.
 */
public final class OutfitControllers {

    private OutfitControllers() {
    }

    /** Cửa hàng: phối đồ (khách vãng lai cũng dùng được; đã đăng nhập thì dùng số đo + phong cách đã lưu). */
    @RestController
    @RequestMapping("/api/shop/outfits")
    public static class ShopOutfitController {
        private final OutfitService service;
        private final SessionAccess sessions;

        public ShopOutfitController(OutfitService service, SessionAccess sessions) {
            this.service = service;
            this.sessions = sessions;
        }

        @GetMapping("/options")
        public OutfitOptions options() {
            return new OutfitOptions(OutfitTags.OCCASIONS, OutfitTags.STYLES);
        }

        @PostMapping("/suggest")
        public OutfitResponse suggest(@RequestBody OutfitRequest request) {
            Account actor;
            try {
                actor = sessions.current();
            } catch (ApiException e) {
                actor = null;
            }
            return service.suggest(request, actor);
        }

        /** "Đổi món": danh sách món thay thế cho một vai trò để khách tự chọn. */
        @PostMapping("/alternatives")
        public List<Alternative> alternatives(@RequestBody AlternativesRequest request) {
            Account actor;
            try {
                actor = sessions.current();
            } catch (ApiException e) {
                actor = null;
            }
            return service.alternatives(request.outfit(), request.role(), request.currentProductId(), actor);
        }
    }

    /** Quản trị: thẻ dịp mặc / phong cách của sản phẩm. */
    @RestController
    @RequestMapping("/api/products/{productId}/style")
    public static class ProductStyleController {
        private final OutfitStyleService service;

        public ProductStyleController(OutfitStyleService service) {
            this.service = service;
        }

        @GetMapping
        public ProductStyle get(@PathVariable int productId) {
            return service.productStyle(productId);
        }

        @PutMapping
        public ProductStyle save(@PathVariable int productId, @RequestBody ProductStyleRequest request) {
            return service.saveProductStyle(productId, request);
        }
    }

    /** Khách: hồ sơ phong cách (năm sinh, nghề nghiệp, phong cách thích, màu tránh). */
    @RestController
    @RequestMapping("/api/body-profile/me/style")
    public static class StyleProfileController {
        private final OutfitStyleService service;
        private final SessionAccess sessions;

        public StyleProfileController(OutfitStyleService service, SessionAccess sessions) {
            this.service = service;
            this.sessions = sessions;
        }

        @GetMapping
        public StyleProfile get() {
            return service.styleProfile(sessions.current());
        }

        @PutMapping
        public StyleProfile save(@RequestBody StyleProfile profile) {
            return service.saveStyleProfile(sessions.current(), profile);
        }
    }
}
