package com.thors.module.warehouse;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.util.List;

public final class WarehouseRequests {
    private WarehouseRequests() {}

    public record Line(
            @NotNull @Positive Integer detailId,
            @NotNull @Min(1) @Max(1000000) Integer quantity,
            @NotNull
            @DecimalMin("0")
            @DecimalMax("999999999999")
            @Digits(integer = 12, fraction = 0)
            BigDecimal unitPrice,
            @Positive Integer sourceItemId) {}

    public record Document(
            @NotBlank
            @Pattern(regexp = "PURCHASE_ORDER|RECEIPT|SUPPLIER_RETURN")
            String type,
            @Positive Integer sourceId,
            @Size(max = 200) String manufacturer,
            @Size(max = 255) String note,
            @NotEmpty @Size(max = 200)
            List<@NotNull @Valid Line> items) {}

    public record Reason(
            @NotBlank @Size(max = 255) String reason) {}

    public record Rack(
            @NotBlank
            @Pattern(regexp = "[\\p{L}\\p{N}_-]{1,20}")
            String code,
            @Size(max = 50) String zone,
            @NotNull @DecimalMin("0") @DecimalMax("1800")
            BigDecimal x,
            @NotNull @DecimalMin("0") @DecimalMax("1800")
            BigDecimal y,
            @NotNull Boolean active) {}

    public record RelativeRack(
            @NotBlank
            @Pattern(regexp = "[\\p{L}\\p{N}_-]{1,20}")
            String code,
            @Size(max = 50) String zone,
            @NotNull Boolean active,
            @Positive Integer referenceRackId,
            @NotBlank
            @Pattern(regexp = "KEEP|FIRST|RIGHT|LEFT|ABOVE|BELOW")
            String direction) {}

    public record Tier(
            @NotNull @Min(1) @Max(50) Integer number,
            @NotBlank
            @Pattern(regexp = "AVAILABLE|FULL|BLOCKED|MAINTENANCE")
            String status,
            @NotNull Boolean active) {}

    public record Metadata(
            @NotBlank @Size(max = 2000) String description,
            @Size(max = 8) List<@Positive Integer> keepImageIds,
            @Size(max = 8)
            List<@Pattern(regexp = "[a-f0-9]{32}\\.(jpg|png|webp)") String> photoKeys) {}

    public record Move(
            @NotNull @Positive Integer detailId,
            @Positive Integer fromLocationId,
            @Positive Integer toShelfId,
            @NotNull @Min(1) @Max(1000000) Integer quantity,
            @Size(max = 2000) String description,
            @Size(max = 8)
            List<@Pattern(regexp = "[a-f0-9]{32}\\.(jpg|png|webp)") String> photoKeys,
            @NotBlank
            @Pattern(regexp = "[a-f0-9-]{36}")
            String requestKey) {}
}