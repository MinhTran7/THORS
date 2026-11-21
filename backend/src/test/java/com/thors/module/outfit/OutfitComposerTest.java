package com.thors.module.outfit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.thors.module.outfit.OutfitComposer.Candidate;
import com.thors.module.outfit.OutfitComposer.Outfit;
import com.thors.module.outfit.OutfitTags.Role;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

/** Thẻ phối đồ (đoán theo tên, vai trò, màu) + thuật toán ghép bộ trong ngân sách. */
class OutfitComposerTest {

    private static Candidate item(int id, Role role, long price, String color, Set<String> occasions, String size) {
        return new Candidate(id, "SP " + id, null, role, id * 10, "M", color, price, occasions, Set.of("BASIC"), size);
    }

    private static final Set<String> WORK = Set.of("WORK");
    private static final Set<String> CASUAL = Set.of("CASUAL");

    @Test
    void guessTagsFromNames() {
        assertEquals(Role.TOP, OutfitTags.roleOf(List.of("Áo Phông Nam", "Áo")));
        assertEquals(Role.BOTTOM, OutfitTags.roleOf(List.of("Quần Âu Nam", "Quần")));
        assertEquals(Role.SHOES, OutfitTags.roleOf(List.of("Giày Da Nam", "Giày nam", "Giày")));
        assertEquals(Role.ACCESSORY, OutfitTags.roleOf(List.of("Túi Xách Nữ", "Túi xách")));
        assertTrue(OutfitTags.guessOccasions("Áo sơ mi trắng công sở", List.of("Áo")).contains("WORK"));
        assertTrue(OutfitTags.guessOccasions("Giày Thể Thao Đế Cao", List.of("Giày")).contains("SPORT"));
        assertEquals(Set.of("CASUAL"), OutfitTags.guessOccasions("abc", List.of("Áo"))); // không đoán được -> dạo phố
        assertTrue(OutfitTags.isNeutral("Đen"));
        assertFalse(OutfitTags.isNeutral("Đỏ đô"));
        assertTrue(OutfitTags.matchesAny("Đỏ đô", List.of("đỏ")));
        assertEquals(List.of("WORK", "PARTY"), OutfitTags.parseCodes("work, PARTY,xyz,WORK", OutfitTags.OCCASIONS));
    }

    @Test
    void genderFromProductName() {
        assertEquals("UNISEX", OutfitTags.targetFromName("Dép Bánh Mì Nam & Nữ"));
        assertEquals("WOMEN", OutfitTags.targetFromName("Áo baby doll"));
        assertEquals("WOMEN", OutfitTags.targetFromName("Dép Nữ (Quai X)"));
        assertEquals("MEN", OutfitTags.targetFromName("Giày Da Nam Dáng Mũi Nhọn"));
        assertEquals(null, OutfitTags.targetFromName("Quần Kaki Công Sở"));
        // Tên nói rõ thì thắng danh mục; tên không rõ thì theo danh mục
        assertEquals("WOMEN", OutfitTags.resolveTarget("Áo baby doll", "MEN"));
        assertEquals("MEN", OutfitTags.resolveTarget("Áo Thun Cổ Tròn Basic", "MEN"));
    }

    @Test
    void prefersOccasionMatchWithinBudget() {
        List<Candidate> all = List.of(
                item(1, Role.TOP, 300_000, "Trắng", WORK, "HIGH"),
                item(2, Role.TOP, 200_000, "Đen", CASUAL, "HIGH"),
                item(3, Role.BOTTOM, 400_000, "Đen", WORK, "HIGH"),
                item(4, Role.SHOES, 500_000, "Đen", WORK, "HIGH"));
        List<Outfit> outfits = OutfitComposer.compose(all, "WORK", Set.of(), 1_300_000, Map.of(), 5);
        Outfit best = outfits.get(0);
        assertEquals(List.of(1, 3, 4), best.items().stream().map(Candidate::productId).toList());
        assertEquals(1_200_000, best.total());
        assertTrue(outfits.stream().allMatch(o -> o.total() <= 1_300_000));
    }

    @Test
    void dropsShoesOnlyWhenNoFullOutfitFits() {
        List<Candidate> all = List.of(
                item(1, Role.TOP, 300_000, "Trắng", WORK, null),
                item(3, Role.BOTTOM, 400_000, "Đen", WORK, null),
                item(4, Role.SHOES, 900_000, "Đen", WORK, null));
        // 300k + 400k + 900k = 1.6tr > 1tr -> bộ không giày
        Outfit best = OutfitComposer.compose(all, "WORK", Set.of(), 1_000_000, Map.of(), 5).get(0);
        assertEquals(2, best.items().size());
        assertTrue(OutfitComposer.compose(all, "WORK", Set.of(), 500_000, Map.of(), 5).isEmpty());
        assertEquals(700_000, OutfitComposer.cheapestTotal(all, Map.of()));
    }

    @Test
    void lockedItemStaysInEveryOutfit() {
        Candidate keptBottom = item(5, Role.BOTTOM, 450_000, "Xanh than", CASUAL, null);
        List<Candidate> all = List.of(
                item(1, Role.TOP, 300_000, "Trắng", WORK, null),
                item(2, Role.TOP, 250_000, "Be", WORK, null),
                item(3, Role.BOTTOM, 400_000, "Đen", WORK, null),
                item(4, Role.SHOES, 500_000, "Đen", WORK, null));
        List<Outfit> outfits = OutfitComposer.compose(all, "WORK", Set.of(), 2_000_000, Map.of(Role.BOTTOM, keptBottom), 5);
        assertFalse(outfits.isEmpty());
        assertTrue(outfits.stream().allMatch(o -> o.items().stream().anyMatch(c -> c.productId() == 5)));
    }

    @Test
    void colorHarmony() {
        assertEquals(2, OutfitComposer.colorScore(List.of(item(1, Role.TOP, 1, "Đỏ", WORK, null),
                item(2, Role.BOTTOM, 1, "Đen", WORK, null))));
        assertEquals(-2, OutfitComposer.colorScore(List.of(item(1, Role.TOP, 1, "Đỏ", WORK, null),
                item(2, Role.BOTTOM, 1, "Vàng", WORK, null), item(3, Role.SHOES, 1, "Hồng", WORK, null))));
    }
}
