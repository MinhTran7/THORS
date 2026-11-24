package com.thors.module.fitting.garment;

import com.thors.module.fitting.garment.GarmentModelDtos.ActiveRequest;
import com.thors.module.fitting.garment.GarmentModelDtos.GarmentModelView;
import com.thors.module.fitting.garment.GarmentModelDtos.ShopGarmentModel;
import com.thors.security.SessionAccess;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

/** API mô hình 3D quần áo (gom 2 controller: quản trị + cửa hàng). */
public final class GarmentModelControllers {

    private GarmentModelControllers() {
    }

    /**
     * Quản trị: quyền theo SecurityConfig có sẵn cho /api/products/** - GET: Owner + Family Member;
     * PUT / PATCH / DELETE: chỉ Owner (service kiểm tra lại).
     */
    @RestController
    @RequestMapping("/api/products/{productId}/garment-model")
    public static class Admin {

        private final GarmentModelService service;
        private final SessionAccess sessions;

        public Admin(GarmentModelService service, SessionAccess sessions) {
            this.service = service;
            this.sessions = sessions;
        }

        /** 200 + mô hình; 204 khi sản phẩm chưa có mô hình 3D. */
        @GetMapping
        public ResponseEntity<GarmentModelView> get(@PathVariable int productId) {
            return service.get(productId).map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.noContent().build());
        }

        /**
         * Tạo / cập nhật (multipart). file: bắt buộc lần đầu, sau đó chỉ khi thay file;
         * sizes / colors: chuỗi JSON {"S":{"up":0,"down":1}} / {"Navy":{"hex":"#22273C"}}.
         */
        @PutMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
        public GarmentModelView save(@PathVariable int productId,
                                     @RequestParam(required = false) MultipartFile file,
                                     @RequestParam(required = false) String slot,
                                     @RequestParam(required = false) String gender,
                                     @RequestParam(required = false) String fabricMaterial,
                                     @RequestParam(required = false) String sizes,
                                     @RequestParam(required = false) String colors) {
            return service.save(sessions.current(), productId, file, slot, gender, fabricMaterial, sizes, colors);
        }

        /** Bật / tắt cho khách thử (không xóa file). */
        @PatchMapping
        public GarmentModelView setActive(@PathVariable int productId, @RequestBody ActiveRequest request) {
            return service.setActive(sessions.current(), productId, request == null ? null : request.active());
        }

        @DeleteMapping
        @ResponseStatus(HttpStatus.NO_CONTENT)
        public void delete(@PathVariable int productId) {
            service.delete(sessions.current(), productId);
        }
    }

    /** Cửa hàng (công khai, /api/shop/**): Phòng thử đồ hỏi sản phẩm nào có mô hình 3D. */
    @RestController
    @RequestMapping("/api/shop/garment-models")
    public static class Shop {

        private final GarmentModelService service;

        public Shop(GarmentModelService service) {
            this.service = service;
        }

        /** ?productIds=1,2,3 (tối đa 50). Sản phẩm không có trong kết quả = chưa hỗ trợ thử đồ 3D. */
        @GetMapping
        public List<ShopGarmentModel> list(@RequestParam(required = false) List<Integer> productIds) {
            return service.shopModels(productIds);
        }
    }
}
