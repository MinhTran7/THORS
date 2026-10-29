package com.thors.module.warehouse;

import static com.thors.module.warehouse.WarehouseStore.invalid;
import static com.thors.module.warehouse.WarehouseStore.num;

import java.util.*;

public final class RackGeometry {
    public static final double WIDTH = 190;
    public static final double GAP = 24;
    public static final double MAX = 1800;

    private static final double EPSILON = 0.005;

    private RackGeometry() {}

    public record Box(
            int id,
            double x,
            double y,
            double height) {}

    public static double height(long count) {
        return 2 + 72 + 12 + Math.max(0, count * 44 - 4) + 48;
    }

    private static double coordinate(Object value) {
        double v = value instanceof Number n
                ? n.doubleValue()
                : 40;

        return Math.max(
                0,
                Math.min(MAX, Double.isFinite(v) ? round(v) : 40));
    }

    private static double round(double v) {
        return Math.round(v * 100) / 100.0;
    }

    public static Box box(
            Map<String, Object> rack,
            List<Map<String, Object>> tiers) {
        int id = num(rack, "rack_id");

        return new Box(
                id,
                coordinate(rack.get("coordinate_x")),
                coordinate(rack.get("coordinate_y")),
                height(
                        tiers.stream()
                                .filter(t -> num(t, "rack_id") == id)
                                .count()));
    }

    public static boolean overlap(Box a, Box b) {
        return a.x() < b.x() + WIDTH + GAP - EPSILON
                && a.x() + WIDTH + GAP > b.x() + EPSILON
                && a.y() < b.y() + b.height() + GAP - EPSILON
                && a.y() + a.height() + GAP > b.y() + EPSILON;
    }

    public static Optional<Box> collision(
            Box candidate,
            List<Box> occupied) {
        return occupied.stream()
                .filter(b ->
                        b.id() != candidate.id()
                                && overlap(candidate, b))
                .findFirst();
    }

    private static Box free(
            Box preferred,
            List<Box> occupied) {
        if (collision(preferred, occupied).isEmpty()) {
            return preferred;
        }

        var xs = new LinkedHashSet<Double>(
                List.of(preferred.x(), 0.0, 40.0));
        var ys = new LinkedHashSet<Double>(
                List.of(preferred.y(), 0.0, 40.0));

        for (var r : occupied) {
            xs.add(round(r.x() + WIDTH + GAP));
            xs.add(round(r.x() - WIDTH - GAP));
            ys.add(round(r.y() + r.height() + GAP));
            ys.add(round(r.y() - preferred.height() - GAP));
        }

        Box best = null;
        double bestDistance = Double.POSITIVE_INFINITY;
        double bestRowDistance = Double.POSITIVE_INFINITY;

        for (double x : xs) {
            for (double y : ys) {
                if (x < 0 || y < 0 || x > MAX || y > MAX) {
                    continue;
                }

                var candidate = new Box(
                        preferred.id(),
                        x,
                        y,
                        preferred.height());

                if (collision(candidate, occupied).isPresent()) {
                    continue;
                }

                double distance =
                        Math.pow(x - preferred.x(), 2)
                                + Math.pow(y - preferred.y(), 2);

                double rowDistance = Math.abs(y - preferred.y());

                if (best == null
                        || rowDistance < bestRowDistance - EPSILON
                        || (
                        Math.abs(rowDistance - bestRowDistance) <= EPSILON
                                && (
                                distance < bestDistance - EPSILON
                                        || (
                                        Math.abs(distance - bestDistance) <= EPSILON
                                                && (
                                                y < best.y()
                                                        || (
                                                        y == best.y()
                                                                && x < best.x()
                                                )
                                        )
                                )
                        )
                )) {
                    best = candidate;
                    bestDistance = distance;
                    bestRowDistance = rowDistance;
                }
            }
        }

        if (best == null) {
            throw invalid(
                    "Sơ đồ không còn đủ khoảng trống trong vùng tọa độ 0–1800.");
        }

        return best;
    }

    public static List<Map<String, Object>> normalize(
            List<Map<String, Object>> racks,
            List<Map<String, Object>> tiers) {
        var sorted = racks.stream()
                .map(r -> box(r, tiers))
                .sorted(Comparator.comparingInt(Box::id))
                .toList();

        var placed = new ArrayList<Box>();
        var deferred = new ArrayList<Box>();

        for (var r : sorted) {
            (collision(r, placed).isPresent()
                    ? deferred
                    : placed).add(r);
        }

        for (var r : deferred) {
            placed.add(free(r, placed));
        }

        return racks.stream()
                .map(r -> {
                    var b = placed.stream()
                            .filter(p -> p.id() == num(r, "rack_id"))
                            .findFirst()
                            .orElseThrow();

                    Map<String, Object> copy = new LinkedHashMap<>(r);
                    copy.put("coordinate_x", b.x());
                    copy.put("coordinate_y", b.y());

                    return copy;
                })
                .toList();
    }

    public static void requireFree(
            Map<String, Object> candidate,
            List<Map<String, Object>> racks,
            List<Map<String, Object>> tiers) {
        var conflict = collision(
                box(candidate, tiers),
                racks.stream()
                        .map(r -> box(r, tiers))
                        .toList());

        if (conflict.isPresent()) {
            var other = racks.stream()
                    .filter(r ->
                            num(r, "rack_id") == conflict.get().id())
                    .findFirst()
                    .orElseThrow();

            throw invalid(
                    "Vị trí này chồng lên kệ "
                            + other.get("rack_code")
                            + ". Hãy để cách kệ khác ít nhất 24 px.");
        }
    }
}