package com.thors.module.warehouse;

import com.thors.module.warehouse.WarehouseRequests.*;
import com.thors.security.SessionAccess;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/warehouse")
public class WarehouseController {
    private final SessionAccess sessions;
    private final WarehouseDocuments docs;
    private final WarehouseLayout layout;
    private final WarehousePhotos photos;
    private final WarehousePolicy policy;
    private final WarehouseBarcodes barcodes;
    private final WarehouseOrders orders;
    private final WarehouseCatalog catalog;
    private final WarehouseSettlements settlements;
    private final WarehouseInventory inventory;
    private final WarehouseCounts counts;
    private final WarehouseMoveRequests moveRequests;

    public WarehouseController(
            SessionAccess sessions,
            WarehouseDocuments docs,
            WarehouseLayout layout,
            WarehousePhotos photos,
            WarehousePolicy policy,
            WarehouseBarcodes barcodes,
            WarehouseOrders orders,
            WarehouseCatalog catalog,
            WarehouseSettlements settlements,
            WarehouseInventory inventory,
            WarehouseCounts counts,
            WarehouseMoveRequests moveRequests) {
        this.sessions = sessions;
        this.docs = docs;
        this.layout = layout;
        this.photos = photos;
        this.policy = policy;
        this.barcodes = barcodes;
        this.orders = orders;
        this.catalog = catalog;
        this.settlements = settlements;
        this.inventory = inventory;
        this.counts = counts;
        this.moveRequests = moveRequests;
    }

    /** Inventory list with metrics over every matching variant; all=true for the Excel export. */
    @GetMapping("/inventory")
    public Object inventory(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String color,
            @RequestParam(required = false) String size,
            @RequestParam(required = false) Integer categoryId,
            @RequestParam(required = false) Integer shelfId,
            @RequestParam(required = false) String state,
            @RequestParam(required = false) Integer slowDays,
            @RequestParam(required = false) String sort,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestParam(defaultValue = "false") boolean all) {
        return inventory.list(sessions.current(), q, color, size, categoryId, shelfId, state, slowDays, sort, page, pageSize, all);
    }

    @GetMapping("/inventory/report")
    public Object inventoryReport(
            @RequestParam @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) java.time.LocalDate from,
            @RequestParam @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) java.time.LocalDate to,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) Integer categoryId,
            @RequestParam(defaultValue = "false") boolean onlyMoving) {
        return inventory.report(sessions.current(), from, to, q, categoryId, onlyMoving);
    }

    @GetMapping("/inventory/{detail}")
    public Object inventoryDetail(@PathVariable int detail) {
        return inventory.detail(sessions.current(), detail);
    }

    @PutMapping("/inventory/{detail}/threshold")
    public Object threshold(@PathVariable int detail, @Valid @RequestBody Threshold r) {
        return inventory.threshold(sessions.current(), detail, r.min());
    }

    @GetMapping("/counts")
    public Object counts(@RequestParam(required = false) Integer detail) {
        return counts.list(sessions.current(), detail);
    }

    @GetMapping("/counts/{id}")
    public Object count(@PathVariable int id) {
        return counts.detail(sessions.current(), id);
    }

    @PostMapping("/counts")
    public Object createCount(@Valid @RequestBody Count r) {
        return counts.create(sessions.current(), r);
    }

    @PutMapping("/counts/{id}")
    public Object editCount(@PathVariable int id, @Valid @RequestBody Count r) {
        return counts.edit(sessions.current(), id, r);
    }

    @PostMapping("/counts/{id}/submit")
    public Object submitCount(@PathVariable int id) {
        return counts.submit(sessions.current(), id);
    }

    @PostMapping("/counts/{id}/confirm")
    public Object confirmCount(@PathVariable int id) {
        return counts.confirm(sessions.current(), id);
    }

    @PostMapping("/counts/{id}/reject")
    public Object rejectCount(@PathVariable int id, @Valid @RequestBody Reason r) {
        return counts.end(sessions.current(), id, "reject", r.reason());
    }

    @PostMapping("/counts/{id}/cancel")
    public Object cancelCount(@PathVariable int id, @Valid @RequestBody Reason r) {
        return counts.end(sessions.current(), id, "cancel", r.reason());
    }

    @GetMapping("/orders")
    public Object orders(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String progress,
            @RequestParam(required = false) String supplier,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return orders.list(sessions.current(), q, status, progress, supplier, page, size);
    }

    @GetMapping("/orders/{id}")
    public Object order(@PathVariable int id) {
        return orders.detail(sessions.current(), id);
    }

    @GetMapping("/suppliers")
    public Object suppliers() {
        return orders.suppliers(sessions.current());
    }

    @GetMapping("/order-variants")
    public Object orderVariants(
            @RequestParam(required = false) String supplier,
            @RequestParam(defaultValue = "history") String scope,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) Integer categoryId,
            @RequestParam(required = false) Integer excludeOrderId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        return orders.variants(sessions.current(), supplier, scope, q, categoryId, excludeOrderId, page, size);
    }

    @GetMapping("/catalog/similar")
    public Object similarProducts(@RequestParam String name) {
        return catalog.similar(sessions.current(), name);
    }

    @PostMapping("/catalog/products")
    public Object quickProduct(@Valid @RequestBody QuickProduct r) {
        return catalog.createProduct(sessions.current(), r);
    }

    @PostMapping("/catalog/products/{id}/variants")
    public Object quickVariants(@PathVariable int id, @Valid @RequestBody QuickVariants r) {
        return catalog.addVariants(sessions.current(), id, r);
    }

    @PostMapping("/documents/{id}/copy")
    public Object copy(@PathVariable int id) {
        return docs.copy(sessions.current(), id);
    }

    @GetMapping("/snapshot")
    public Object snapshot() {
        return layout.snapshot(sessions.current());
    }

    /** Codes only for variants without one; optionally limited to the selected variant ids. */
    @PostMapping("/barcodes/generate")
    public Object generateBarcodes(@Valid @RequestBody(required = false) BarcodeGenerate r) {
        return barcodes.generate(sessions.current(), r == null ? null : r.detailIds());
    }

    @GetMapping("/barcodes/lookup")
    public Object lookupBarcode(@RequestParam String code) {
        return barcodes.lookup(sessions.current(), code);
    }

    @GetMapping("/documents")
    public Object documents() {
        return docs.list(sessions.current());
    }

    @PostMapping("/documents")
    public Object create(@Valid @RequestBody Document r) {
        return docs.create(sessions.current(), r);
    }

    @PutMapping("/documents/{id}")
    public Object edit(
            @PathVariable int id,
            @Valid @RequestBody Document r) {
        return docs.edit(sessions.current(), id, r);
    }

    @PostMapping("/documents/{id}/submit")
    public Object submit(@PathVariable int id) {
        return docs.submit(sessions.current(), id);
    }

    @PostMapping("/documents/{id}/confirm")
    public Object confirm(
            @PathVariable int id,
            @Valid @RequestBody(required = false) Confirm r) {
        return docs.confirm(
                sessions.current(),
                id,
                r == null ? null : r.expectedRemaining(),
                r == null ? null : r.picks());
    }

    /** Owner approves a supplier return (waits for dispatch; stock unchanged). */
    @PostMapping("/documents/{id}/approve")
    public Object approve(@PathVariable int id) {
        return docs.approve(sessions.current(), id);
    }

    /** Refunds, debt offsets, held/used credit and exchanges touching a return or a receipt. */
    @GetMapping("/documents/{id}/settlements")
    public Object documentSettlements(@PathVariable int id) {
        return settlements.forDocument(sessions.current(), id);
    }

    @PostMapping("/settlements")
    public Object settle(@Valid @RequestBody Settlement r) {
        return settlements.record(sessions.current(), r);
    }

    @PostMapping("/settlements/{id}/void")
    public Object voidSettlement(@PathVariable int id, @Valid @RequestBody Reason r) {
        return settlements.voidEntry(sessions.current(), id, r.reason());
    }

    @PostMapping("/documents/{id}/payment-basis")
    public Object paymentBasis(@PathVariable int id, @Valid @RequestBody PaymentBasis r) {
        return settlements.declareBasis(sessions.current(), id, r.paidBefore());
    }

    @GetMapping("/supplier-credits")
    public Object supplierCredits() {
        return settlements.credits(sessions.current());
    }

    @GetMapping("/documents/{id}/history")
    public Object documentHistory(@PathVariable int id) {
        return docs.history(sessions.current(), id);
    }

    @PostMapping("/documents/{id}/reject")
    public Object reject(
            @PathVariable int id,
            @Valid @RequestBody Reason r) {
        return docs.end(sessions.current(), id, "reject", r.reason());
    }

    @PostMapping("/documents/{id}/cancel")
    public Object cancel(
            @PathVariable int id,
            @Valid @RequestBody Reason r) {
        return docs.end(sessions.current(), id, "cancel", r.reason());
    }

    @PostMapping("/documents/{id}/close")
    public Object close(
            @PathVariable int id,
            @Valid @RequestBody Reason r) {
        return docs.end(sessions.current(), id, "close", r.reason());
    }

    @PostMapping("/racks")
    public Object rack(@Valid @RequestBody Rack r) {
        return layout.saveRack(sessions.current(), null, r);
    }

    @PutMapping("/racks/{id}")
    public Object rack(
            @PathVariable int id,
            @Valid @RequestBody Rack r) {
        return layout.saveRack(sessions.current(), id, r);
    }

    @PostMapping("/racks/{rack}/tiers")
    public Object tier(
            @PathVariable int rack,
            @Valid @RequestBody Tier r) {
        return layout.saveTier(sessions.current(), rack, null, r);
    }

    @PostMapping("/racks/relative")
    public Object relativeRack(
            @Valid @RequestBody RelativeRack r) {
        return layout.saveRelativeRack(sessions.current(), null, r);
    }

    @PutMapping("/racks/{id}/relative")
    public Object relativeRack(
            @PathVariable int id,
            @Valid @RequestBody RelativeRack r) {
        return layout.saveRelativeRack(sessions.current(), id, r);
    }

    @PostMapping("/racks/tidy")
    public Object tidyRacks() {
        return layout.tidyRacks(sessions.current());
    }

    @PutMapping("/racks/{rack}/tiers/{id}")
    public Object tier(
            @PathVariable int rack,
            @PathVariable int id,
            @Valid @RequestBody Tier r) {
        return layout.saveTier(sessions.current(), rack, id, r);
    }

    @PostMapping("/moves")
    public Object move(@Valid @RequestBody Move r) {
        return layout.move(sessions.current(), r);
    }

    /** Family: shelving/moving waits for the owner. Owner: applied at once (same as /moves). */
    @PostMapping("/move-requests")
    public Object requestMove(@Valid @RequestBody Move r) {
        return moveRequests.submit(sessions.current(), r);
    }

    @GetMapping("/move-requests")
    public Object moveRequests(@RequestParam(required = false) String status) {
        return moveRequests.list(sessions.current(), status);
    }

    @PostMapping("/move-requests/{id}/approve")
    public Object approveMove(@PathVariable int id) {
        return moveRequests.approve(sessions.current(), id);
    }

    @PostMapping("/move-requests/{id}/reject")
    public Object rejectMove(@PathVariable int id, @Valid @RequestBody Reason r) {
        return moveRequests.end(sessions.current(), id, "reject", r.reason());
    }

    @PostMapping("/move-requests/{id}/cancel")
    public Object cancelMove(@PathVariable int id) {
        return moveRequests.end(sessions.current(), id, "cancel", null);
    }

    @PatchMapping("/locations/{id}")
    public Object metadata(
            @PathVariable int id,
            @Valid @RequestBody Metadata r) {
        return layout.metadata(sessions.current(), id, r);
    }

    /** Stock card: kind=stock (changes of total stock, balance after) or kind=move (location moves). */
    @GetMapping("/history/{detail}")
    public Object history(
            @PathVariable int detail,
            @RequestParam(defaultValue = "stock") String kind,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) java.time.LocalDate from,
            @RequestParam(required = false) @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) java.time.LocalDate to,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return inventory.history(sessions.current(), detail, kind, type, from, to, page, size);
    }

    @GetMapping("/notifications")
    public Object notices() {
        return layout.notices(sessions.current());
    }

    @PostMapping("/notifications/{id}/read")
    public Object read(@PathVariable int id) {
        layout.readNotice(sessions.current(), id);
        return java.util.Map.of("message", "Đã đọc.");
    }

    @PostMapping("/photos")
    public Object upload(
            @RequestPart("file") MultipartFile file) {
        // Family members attach photos to the shelving requests they send the owner.
        policy.view(sessions.current());
        return photos.upload(file);
    }

    @GetMapping("/photos/{key}")
    public ResponseEntity<?> photo(@PathVariable String key) {
        policy.view(sessions.current());

        var resource = photos.resource(key);

        String mime = key.endsWith(".png")
                ? "image/png"
                : key.endsWith(".webp")
                ? "image/webp"
                : "image/jpeg";

        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(mime))
                .header("X-Content-Type-Options", "nosniff")
                .cacheControl(CacheControl.noStore())
                .body(resource);
    }
}
