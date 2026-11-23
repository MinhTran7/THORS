package com.thors.module.tryon;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.thors.module.tryon.TryOnModels.BodyType;
import com.thors.module.tryon.TryOnModels.Model;
import java.util.List;
import org.junit.jupiter.api.Test;

class TryOnModelsTest {

    private static final List<Model> MODELS = List.of(
            new Model(1, "FEMALE", BodyType.SLIM, 158, "f-slim"),
            new Model(2, "FEMALE", BodyType.REGULAR, 160, "f-regular-160"),
            new Model(3, "FEMALE", BodyType.REGULAR, 170, "f-regular-170"),
            new Model(4, "FEMALE", BodyType.FULL, 162, "f-full"),
            new Model(5, "MALE", BodyType.REGULAR, 172, "m-regular"));

    @Test
    void bodyTypeFollowsBmi() {
        assertEquals(BodyType.SLIM, TryOnModels.bodyType(165, 48));   // BMI 17.6
        assertEquals(BodyType.REGULAR, TryOnModels.bodyType(165, 58)); // BMI 21.3
        assertEquals(BodyType.FULL, TryOnModels.bodyType(165, 72));    // BMI 26.4
        assertEquals(BodyType.REGULAR, TryOnModels.bodyType(0, 0));
    }

    @Test
    void suggestsSameGenderSameBodyClosestHeight() {
        assertEquals(3, TryOnModels.suggest(MODELS, "FEMALE", 168.0, 60.0).orElseThrow().modelId());
        assertEquals(2, TryOnModels.suggest(MODELS, "FEMALE", 159.0, 52.0).orElseThrow().modelId());
        assertEquals(4, TryOnModels.suggest(MODELS, "FEMALE", 160.0, 75.0).orElseThrow().modelId());
    }

    @Test
    void fallsBackToNearestBodyTypeAndDefaults() {
        // Nam gầy nhưng chỉ có người mẫu nam dáng vừa
        assertEquals(5, TryOnModels.suggest(MODELS, "MALE", 175.0, 52.0).orElseThrow().modelId());
        // Chưa có số đo: dáng vừa, cao 160 (nữ)
        assertEquals(2, TryOnModels.suggest(MODELS, "FEMALE", null, null).orElseThrow().modelId());
        assertTrue(TryOnModels.suggest(MODELS, null, 160.0, 50.0).isEmpty());
        assertTrue(TryOnModels.suggest(List.of(), "MALE", 170.0, 65.0).isEmpty());
    }

    @Test
    void describesPersonForAi() {
        String d = TryOnModels.describe("FEMALE", 158.4, 70);
        assertTrue(d.contains("woman"));
        assertTrue(d.contains("158 cm"));
        assertTrue(d.contains("plus-size"));
    }
}
