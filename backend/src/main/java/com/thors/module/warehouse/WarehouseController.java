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

    public WarehouseController(
            SessionAccess sessions,
            WarehouseDocuments docs,
            WarehouseLayout layout,
            WarehousePhotos photos,
            WarehousePolicy policy,
            WarehouseBarcodes barcodes) {
        this.sessions = sessions;
        this.docs = docs;
        this.layout = layout;
        this.photos = photos;
        this.policy = policy;
        this.barcodes = barcodes;
    }

    @GetMapping("/snapshot")
    public Object snapshot() {
        return layout.snapshot(sessions.current());
    }

    @PostMapping("/barcodes/generate")
    public Object generateBarcodes() {
        return barcodes.generate(sessions.current());
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
    public Object confirm(@PathVariable int id) {
        return docs.confirm(sessions.current(), id);
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

    @PatchMapping("/locations/{id}")
    public Object metadata(
            @PathVariable int id,
            @Valid @RequestBody Metadata r) {
        return layout.metadata(sessions.current(), id, r);
    }

    @GetMapping("/history/{detail}")
    public Object history(@PathVariable int detail) {
        return layout.history(sessions.current(), detail);
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
        policy.owner(sessions.current());
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
