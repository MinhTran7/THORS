package com.thors.module.fitting.garment;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import com.thors.module.fitting.garment.GarmentModelDtos.FabricColor;
import com.thors.module.fitting.garment.GarmentModelDtos.SizeMorph;
import com.thors.module.fitting.garment.GarmentModelRepository.Row;
import com.thors.module.fitting.garment.GarmentModelRepository.Variant;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.IntStream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

class GarmentModelServiceTest {

    private static final LocalDateTime T = LocalDateTime.of(2026, 11, 23, 10, 0);
    private static final int PID = 123;
    private static final String SIZES = "{\"S\":{\"up\":0,\"down\":1},\"M\":{\"up\":0,\"down\":0},\"L\":{\"up\":0.5,\"down\":0}}";
    private static final String COLORS = "{\"navy\":{\"hex\":\"#22273c\"}}";
    private static final List<Variant> VARIANTS = List.of(
            new Variant("S", "Navy"), new Variant("M", "Navy"), new Variant("L", "Navy"), new Variant("L", "Trắng"));

    private GarmentModelRepository repo;
    private GarmentModelStore store;
    private GarmentModelService service;

    private static Account account(String role) {
        return new Account(10, role, "User 10", "$2a$10$hash", "u10@shop.com", null, null, null, "ACTIVE", T, T, null, 0, null);
    }

    private static final Account OWNER = account("OWNER");

    private static MockMultipartFile file() {
        return new MockMultipartFile("file", "ao.glb", "model/gltf-binary", GlbInspectorTest.validGarment());
    }

    private static Row row(String publicId, String fabric) {
        return new Row(PID, "https://res.cloudinary.com/x/raw/upload/" + publicId, publicId, 1000, "TOP", "MALE", fabric,
                SIZES, "{\"Navy\":{\"hex\":\"#22273C\"}}", true, T);
    }

    @BeforeEach
    void setUp() {
        repo = mock(GarmentModelRepository.class);
        store = mock(GarmentModelStore.class);
        service = new GarmentModelService(repo, store);
        when(repo.tableReady()).thenReturn(true);
        when(repo.productExists(PID)).thenReturn(true);
        when(repo.variants(PID)).thenReturn(VARIANTS);
    }

    private String code(Runnable r) {
        return assertThrows(ApiException.class, r::run).code;
    }

    private void save(MockMultipartFile f, String slot, String gender, String fabric, String sizes, String colors) {
        service.save(OWNER, PID, f, slot, gender, fabric, sizes, colors);
    }

    // ---------------------------------------------------------------- tạo / thay file

    @Test
    void firstSaveUploadsAndStoresCanonicalSizesAndColors() {
        when(store.upload(eq(PID), any())).thenReturn(new GarmentModelStore.Stored("https://cdn/p123_a.glb", "thors/garments/p123_a.glb"));
        when(repo.find(PID)).thenReturn(Optional.empty(), Optional.of(row("thors/garments/p123_a.glb", "LinenNavy")));

        var view = service.save(OWNER, PID, file(), "top", "male", " LinenNavy ", SIZES, COLORS);

        assertEquals("TOP", view.slot());
        verify(repo).upsert(eq(PID), eq("https://cdn/p123_a.glb"), eq("thors/garments/p123_a.glb"), anyInt(), eq("TOP"), eq("MALE"),
                eq("LinenNavy"), contains("\"L\":{\"up\":0.5"), eq("{\"Navy\":{\"hex\":\"#22273C\"}}"), eq(10));
        verify(store, never()).destroy(anyInt(), any());
    }

    @Test
    void replacingFileDeletesOldFileOnlyAfterSaving() {
        when(store.upload(eq(PID), any())).thenReturn(new GarmentModelStore.Stored("https://cdn/new", "thors/garments/p123_new.glb"));
        when(repo.find(PID)).thenReturn(Optional.of(row("thors/garments/p123_old.glb", "LinenNavy")));

        save(file(), "TOP", "MALE", "LinenNavy", SIZES, null);

        var order = inOrder(repo, store);
        order.verify(store).upload(eq(PID), any());
        order.verify(repo).upsert(eq(PID), any(), eq("thors/garments/p123_new.glb"), anyInt(), any(), any(), any(), any(), any(), any());
        order.verify(store).destroy(PID, "thors/garments/p123_old.glb");
    }

    @Test
    void databaseFailureRemovesTheNewlyUploadedFile() {
        when(store.upload(eq(PID), any())).thenReturn(new GarmentModelStore.Stored("https://cdn/new", "thors/garments/p123_new.glb"));
        when(repo.find(PID)).thenReturn(Optional.of(row("thors/garments/p123_old.glb", "LinenNavy")));
        doThrow(new RuntimeException("db down")).when(repo).upsert(anyInt(), any(), any(), anyInt(), any(), any(), any(), any(), any(), any());

        assertThrows(RuntimeException.class, () -> save(file(), "TOP", "MALE", "LinenNavy", SIZES, null));
        verify(store).destroy(PID, "thors/garments/p123_new.glb");
        verify(store, never()).destroy(PID, "thors/garments/p123_old.glb");
    }

    @Test
    void invalidFileIsRejectedBeforeUpload() {
        when(repo.find(PID)).thenReturn(Optional.empty());
        assertEquals("GLB_FABRIC_NOT_FOUND", code(() -> save(file(), "TOP", "MALE", "ShirtMint", SIZES, null)));
        var notGlb = new MockMultipartFile("file", "a.png", "image/png", new byte[] {1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21});
        assertEquals("GLB_INVALID", code(() -> save(notGlb, "TOP", "MALE", "LinenNavy", SIZES, null)));
        verify(store, never()).upload(anyInt(), any());
    }

    @Test
    void firstSaveNeedsAFile() {
        when(repo.find(PID)).thenReturn(Optional.empty());
        assertEquals("GLB_REQUIRED", code(() -> save(null, "TOP", "MALE", "LinenNavy", SIZES, null)));
    }

    @Test
    void updateWithoutFileKeepsFileButFabricChangeNeedsFile() {
        Row old = row("thors/garments/p123_old.glb", "LinenNavy");
        when(repo.find(PID)).thenReturn(Optional.of(old));

        save(null, "OUTER", "MALE", "LinenNavy", SIZES, null);
        verify(repo).upsert(eq(PID), eq(old.glbUrl()), eq(old.glbPublicId()), eq(1000), eq("OUTER"), any(), any(), any(), any(), any());
        verify(store, never()).upload(anyInt(), any());

        assertEquals("GARMENT_FABRIC_NEEDS_FILE", code(() -> save(null, "TOP", "MALE", "ButtonNavy", SIZES, null)));
    }

    // ---------------------------------------------------------------- quyền / điều kiện

    @Test
    void onlyOwnerCanSave() {
        assertEquals("FORBIDDEN", code(() -> service.save(account("FAMILY_MEMBER"), PID, file(), "TOP", "MALE", "LinenNavy", SIZES, null)));
        assertEquals("FORBIDDEN", code(() -> service.save(null, PID, file(), "TOP", "MALE", "LinenNavy", SIZES, null)));
        assertEquals("FORBIDDEN", code(() -> service.delete(account("CUSTOMER"), PID)));
    }

    @Test
    void tableMissingOrProductMissing() {
        when(repo.tableReady()).thenReturn(false);
        assertEquals("GARMENT_NOT_READY", code(() -> service.get(PID)));
        when(repo.tableReady()).thenReturn(true);
        when(repo.productExists(999)).thenReturn(false);
        assertEquals("PRODUCT_NOT_FOUND", code(() -> service.get(999)));
    }

    @Test
    void slotGenderFabricAreValidated() {
        assertEquals("GARMENT_SLOT", code(() -> save(file(), "HAT", "MALE", "LinenNavy", SIZES, null)));
        assertEquals("GARMENT_GENDER", code(() -> save(file(), "TOP", "KID", "LinenNavy", SIZES, null)));
        assertEquals("GARMENT_FABRIC", code(() -> save(file(), "TOP", "MALE", "  ", SIZES, null)));
        assertEquals("GARMENT_FABRIC", code(() -> save(file(), "TOP", "MALE", "a".repeat(65), SIZES, null)));
    }

    // ---------------------------------------------------------------- bảng size / màu

    @Test
    void sizesMustBelongToProductAndBeInRange() {
        assertEquals("GARMENT_SIZES_REQUIRED", code(() -> GarmentModelService.parseSizes("{}", VARIANTS)));
        assertEquals("GARMENT_SIZES_REQUIRED", code(() -> GarmentModelService.parseSizes(null, VARIANTS)));
        assertEquals("GARMENT_SIZES_FORMAT", code(() -> GarmentModelService.parseSizes("[1]", VARIANTS)));
        assertEquals("SIZE_NOT_IN_PRODUCT", code(() -> GarmentModelService.parseSizes("{\"XXL\":{\"up\":1,\"down\":0}}", VARIANTS)));
        assertEquals("SIZE_MORPH_RANGE", code(() -> GarmentModelService.parseSizes("{\"L\":{\"up\":1.01,\"down\":0}}", VARIANTS)));
        assertEquals("SIZE_MORPH_RANGE", code(() -> GarmentModelService.parseSizes("{\"L\":{\"up\":-0.01,\"down\":0}}", VARIANTS)));
        assertEquals("SIZE_MORPH_RANGE", code(() -> GarmentModelService.parseSizes("{\"L\":{\"up\":0.5,\"down\":0.5}}", VARIANTS)));
        // Biên hợp lệ: 0 và 1; viết thường vẫn khớp size biến thể và lưu theo cách viết của biến thể
        Map<String, SizeMorph> ok = GarmentModelService.parseSizes("{\"s\":{\"up\":0,\"down\":1},\"L\":{\"up\":1,\"down\":0}}", VARIANTS);
        assertEquals(new SizeMorph(0, 1), ok.get("S"));
        assertEquals(new SizeMorph(1, 0), ok.get("L"));
    }

    @Test
    void atMostThirtySizes() {
        List<Variant> many = IntStream.rangeClosed(1, 31).mapToObj(i -> new Variant(String.valueOf(i), "Navy")).toList();
        String json31 = "{" + String.join(",", IntStream.rangeClosed(1, 31).mapToObj(i -> "\"" + i + "\":{\"up\":0,\"down\":0}").toList()) + "}";
        assertEquals("GARMENT_SIZES_TOO_MANY", code(() -> GarmentModelService.parseSizes(json31, many)));
        String json30 = json31.replace(",\"31\":{\"up\":0,\"down\":0}", "");
        assertEquals(30, GarmentModelService.parseSizes(json30, many).size());
    }

    @Test
    void colorsAreOptionalButMustBeValid() {
        assertTrue(GarmentModelService.parseColors(null, VARIANTS).isEmpty());
        assertTrue(GarmentModelService.parseColors(" ", VARIANTS).isEmpty());
        assertEquals("COLOR_NOT_IN_PRODUCT", code(() -> GarmentModelService.parseColors("{\"Đỏ\":{\"hex\":\"#FF0000\"}}", VARIANTS)));
        assertEquals("COLOR_HEX", code(() -> GarmentModelService.parseColors("{\"Navy\":{\"hex\":\"#12345\"}}", VARIANTS)));
        assertEquals("COLOR_HEX", code(() -> GarmentModelService.parseColors("{\"Navy\":{\"hex\":\"navy\"}}", VARIANTS)));
        assertEquals("COLOR_HEX", code(() -> GarmentModelService.parseColors("{\"Navy\":{}}", VARIANTS)));
        assertEquals("GARMENT_COLORS_FORMAT", code(() -> GarmentModelService.parseColors("not json", VARIANTS)));
        Map<String, FabricColor> ok = GarmentModelService.parseColors("{\" trắng \":{\"hex\":\"#f5f3ee\"}}", VARIANTS);
        assertEquals(new FabricColor("#F5F3EE"), ok.get("Trắng"));
    }

    // ---------------------------------------------------------------- bật / tắt, xóa

    @Test
    void setActiveAndDelete() {
        when(repo.setActive(PID, false)).thenReturn(1);
        when(repo.find(PID)).thenReturn(Optional.of(row("thors/garments/p123_a.glb", "LinenNavy")));
        service.setActive(OWNER, PID, false);
        verify(repo).setActive(PID, false);
        assertEquals("GARMENT_ACTIVE", code(() -> service.setActive(OWNER, PID, null)));

        service.delete(OWNER, PID);
        verify(repo).delete(PID);
        verify(store).destroy(PID, "thors/garments/p123_a.glb");

        when(repo.setActive(7, true)).thenReturn(0);
        assertEquals("GARMENT_NOT_FOUND", code(() -> service.setActive(OWNER, 7, true)));
        when(repo.find(7)).thenReturn(Optional.empty());
        assertEquals("GARMENT_NOT_FOUND", code(() -> service.delete(OWNER, 7)));
    }

    // ---------------------------------------------------------------- cửa hàng

    @Test
    void shopModelsFiltersIdsAndHidesWhenTableMissing() {
        when(repo.activeForShop(any())).thenReturn(List.of(row("thors/garments/p123_a.glb", "LinenNavy")));
        var list = service.shopModels(java.util.Arrays.asList(PID, PID, null, -1));
        assertEquals(1, list.size());
        assertEquals("#22273C", list.get(0).colors().get("Navy").hex());
        assertEquals(new SizeMorph(0.5, 0), list.get(0).sizes().get("L"));
        verify(repo).activeForShop(java.util.Set.of(PID));

        assertTrue(service.shopModels(null).isEmpty());
        when(repo.tableReady()).thenReturn(false);
        assertTrue(service.shopModels(List.of(PID)).isEmpty());
    }

    @Test
    void shopModelsAtMostFiftyIds() {
        assertEquals("GARMENT_TOO_MANY_IDS", code(() -> service.shopModels(IntStream.rangeClosed(1, 51).boxed().toList())));
        when(repo.activeForShop(any())).thenReturn(List.of());
        assertDoesNotThrow(() -> service.shopModels(IntStream.rangeClosed(1, 50).boxed().toList()));
    }

    // ---------------------------------------------------------------- dọn file mồ côi

    @Test
    void cleanupDeletesOnlyOldUnusedFiles() {
        when(repo.publicIdsInUse()).thenReturn(List.of("thors/garments/p1_used.glb"));
        Instant old = Instant.now().minusSeconds(3 * 3600);
        when(store.listFiles()).thenReturn(List.of(
                new GarmentModelStore.CloudFile("thors/garments/p1_used.glb", old),
                new GarmentModelStore.CloudFile("thors/garments/p2_orphan.glb", old),
                new GarmentModelStore.CloudFile("thors/garments/p3_new.glb", Instant.now()),
                new GarmentModelStore.CloudFile("thors/garments/p4_unknown.glb", null)));

        service.cleanupOrphans();

        verify(store).destroyOrphan("thors/garments/p2_orphan.glb");
        verify(store, times(1)).destroyOrphan(any());
    }

    @Test
    void storeOnlyTouchesFilesOfTheProduct() {
        assertTrue(GarmentModelStore.belongsTo(123, "thors/garments/p123_abc.glb"));
        assertFalse(GarmentModelStore.belongsTo(12, "thors/garments/p123_abc.glb"));
        assertFalse(GarmentModelStore.belongsTo(123, "thors/tryon/u1_x"));
        assertFalse(GarmentModelStore.belongsTo(123, "thors/garments/p123_../x"));
        assertFalse(GarmentModelStore.belongsTo(123, null));
    }
}
