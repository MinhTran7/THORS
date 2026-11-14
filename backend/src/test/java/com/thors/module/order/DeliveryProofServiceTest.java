package com.thors.module.order;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.cloudinary.Cloudinary;
import com.cloudinary.Uploader;
import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import com.thors.module.order.dto.OrderViews.Detail;
import com.thors.module.order.dto.OrderViews.Shipment;
import com.thors.module.order.repository.DeliveryProofRepository;
import com.thors.module.order.service.DeliveryProofService;
import com.thors.module.order.service.OrderService;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

/** Xác nhận đã giao phải kèm 1–3 ảnh hợp lệ; lỗi giữa chừng thì xóa ảnh đã đẩy lên Cloudinary. */
class DeliveryProofServiceTest {

    private static final int ORDER = 42;

    private DeliveryProofRepository proofs;
    private OrderService orders;
    private Uploader uploader;
    private DeliveryProofService service;
    private Account owner;
    private int uploads;

    @BeforeEach
    void setUp() throws Exception {
        proofs = mock(DeliveryProofRepository.class);
        orders = mock(OrderService.class);
        uploader = mock(Uploader.class);
        Cloudinary cloudinary = mock(Cloudinary.class);
        when(cloudinary.uploader()).thenReturn(uploader);
        when(uploader.upload(any(), anyMap())).thenAnswer(inv -> Map.of(
                "secure_url",
                "https://res.cloudinary.com/demo/image/upload/v1/thors/delivery-proofs/o42_" + (++uploads) + ".jpg"));
        service = new DeliveryProofService(proofs, orders, cloudinary);

        owner = account("OWNER");
        when(proofs.ready()).thenReturn(true);
        order("SHIPPING", "SELF");
    }

    private static Account account(String role) {
        return new Account(7, role, "Tester", null, null, null, null, null, "ACTIVE", null, null, null, 0, null);
    }

    private void order(String status, String carrier) {
        Shipment shipment = carrier == null ? null : new Shipment(carrier, null, null, null, null, null);
        Detail d = new Detail(ORDER, "ORD-42", null, status, null, "COD", "UNPAID", null, 0, null, 0, null, 0, 0, 0,
                null, null, null, null, null, null, null, shipment, null, List.of());
        when(orders.detail(any(), eq(ORDER))).thenReturn(d);
    }

    private static MultipartFile png() throws Exception {
        var out = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(4, 4, BufferedImage.TYPE_INT_RGB), "png", out);
        return new MockMultipartFile("images", "giao.png", "image/png", out.toByteArray());
    }

    private ApiException fails(List<MultipartFile> images) {
        return assertThrows(ApiException.class, () -> service.confirmDelivered(owner, ORDER, images, null));
    }

    @Test
    void plainStatusChangeToDeliveredIsBlockedOnceProofIsRequired() {
        assertThrows(ApiException.class, () -> service.guardStatusChange("DELIVERED"));
        assertDoesNotThrow(() -> service.guardStatusChange("SHIPPING"));
    }

    @Test
    void beforeMigrationDeliveredStillWorksTheOldWay() {
        when(proofs.ready()).thenReturn(false);
        assertDoesNotThrow(() -> service.guardStatusChange("DELIVERED"));
    }

    @Test
    void deliversWithPhotosAndNote() throws Exception {
        service.confirmDelivered(owner, ORDER, List.of(png(), png()), "  Gửi bảo vệ tòa nhà  ");

        verify(uploader, times(2)).upload(any(), anyMap());
        verify(orders).changeStatus(owner, ORDER, "DELIVERED", null, null, null, null, null);
        verify(proofs).insert(eq(ORDER), eq(List.of(
                "https://res.cloudinary.com/demo/image/upload/v1/thors/delivery-proofs/o42_1.jpg",
                "https://res.cloudinary.com/demo/image/upload/v1/thors/delivery-proofs/o42_2.jpg")),
                eq("Gửi bảo vệ tòa nhà"), eq(7));
    }

    @Test
    void familyMemberCanConfirmDeliveryLikeOwner() throws Exception {
        Account family = account("FAMILY_MEMBER");
        service.confirmDelivered(family, ORDER, List.of(png()), null);
        verify(orders).changeStatus(family, ORDER, "DELIVERED", null, null, null, null, null);
    }

    @Test
    void needsAtLeastOneAndAtMostThreePhotos() throws Exception {
        assertEquals("DELIVERY_PROOF_REQUIRED", fails(List.of()).code);
        assertEquals("DELIVERY_PROOF_REQUIRED", fails(null).code);
        assertEquals("DELIVERY_PROOF_COUNT", fails(List.of(png(), png(), png(), png())).code);
        verify(uploader, never()).upload(any(), anyMap());
    }

    @Test
    void rejectsFilesThatAreNotRealImages() throws Exception {
        var fake = new MockMultipartFile("images", "a.png", "image/png", "not an image".getBytes());
        assertEquals("DELIVERY_PROOF_INVALID", fails(List.of(fake)).code);
        verify(uploader, never()).upload(any(), anyMap());
    }

    @Test
    void onlyShippingOrdersNotHandledByGhn() throws Exception {
        order("AWAITING_PICKUP", null);
        assertEquals("ORDER_TRANSITION", fails(List.of(png())).code);
        order("SHIPPING", "GHN");
        assertEquals("CARRIER_MANAGED", fails(List.of(png())).code);
        verify(uploader, never()).upload(any(), anyMap());
    }

    @Test
    void onlyOwnerAndOnlyAfterMigration() throws Exception {
        owner = account("CUSTOMER");
        assertEquals("ROLE", fails(List.of(png())).code);
        owner = account("OWNER");
        when(proofs.ready()).thenReturn(false);
        assertEquals("DELIVERY_PROOF_UNAVAILABLE", fails(List.of(png())).code);
    }

    @Test
    void uploadedPhotosAreRemovedWhenStatusChangeFails() throws Exception {
        when(orders.changeStatus(any(), anyInt(), anyString(), any(), any(), any(), any(), any()))
                .thenThrow(new ApiException(409, "ORDER_STATE", "Trạng thái đơn vừa thay đổi"));
        fails(List.of(png(), png()));
        verify(uploader).destroy(eq("thors/delivery-proofs/o42_1"), anyMap());
        verify(uploader).destroy(eq("thors/delivery-proofs/o42_2"), anyMap());
        verify(proofs, never()).insert(anyInt(), any(), any(), anyInt());
    }

    @Test
    void customerSeesProofWithoutStaffName() {
        when(proofs.find(ORDER)).thenReturn(Optional.of(
                new DeliveryProofRepository.Proof(List.of("https://x/a.jpg"), "ok", null, "Nhân viên A")));
        var view = service.view(account("CUSTOMER"), ORDER);
        assertEquals(null, ((DeliveryProofRepository.Proof) view.get("proof")).createdByName());
        var ownerView = service.view(owner, ORDER);
        assertEquals("Nhân viên A", ((DeliveryProofRepository.Proof) ownerView.get("proof")).createdByName());
    }
}
