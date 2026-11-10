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

    /**
     * Optional body of a confirm call. For a RECEIPT the client sends the "remaining on the purchase
     * order line" it displayed (keyed by source line id). When another receipt was confirmed in
     * between, the backend rejects with the fresh numbers instead of silently re-using the decision.
     */
    public record Confirm(
            java.util.Map<Integer, Integer> expectedRemaining,
            @Size(max = 2000) List<@NotNull @Valid Pick> picks) {}

    /**
     * SUPPLIER_RETURN dispatch: how many units of one return line are physically taken from one
     * product_location (locationId) or from the not-yet-placed stock (locationId = null).
     */
    public record Pick(
            @NotNull @Positive Integer itemId,
            @Positive Integer locationId,
            @NotNull @Min(1) @Max(1000000) Integer quantity) {}

    /**
     * One money/goods movement with a supplier. REFUND, DEBT_OFFSET, CREDIT_HOLD, EXCHANGE settle a
     * dispatched return (returnId); PAYMENT, DEBT_OFFSET and CREDIT_USE reduce the debt of a confirmed
     * purchase receipt (targetReceiptId). EXCHANGE takes itemId + quantity, its amount is computed.
     * date = day the money/decision happened (default today, never in the future).
     */
    public record Settlement(
            @NotBlank
            @Pattern(regexp = "PAYMENT|REFUND|DEBT_OFFSET|CREDIT_HOLD|CREDIT_USE|EXCHANGE")
            String type,
            @Positive Integer returnId,
            @Positive Integer targetReceiptId,
            @Positive Integer itemId,
            @Min(1) @Max(1000000) Integer quantity,
            @DecimalMin("1")
            @DecimalMax("999999999999")
            @Digits(integer = 12, fraction = 0)
            BigDecimal amount,
            @Pattern(regexp = "CASH|BANK_TRANSFER") String method,
            @Size(max = 255) String note,
            @PastOrPresent java.time.LocalDate date,
            @NotBlank
            @Pattern(regexp = "[a-f0-9-]{36}")
            String requestKey) {}

    /** Amount already paid on a receipt confirmed before payment tracking existed (declared by Owner). */
    public record PaymentBasis(
            @NotNull
            @DecimalMin("0")
            @DecimalMax("999999999999")
            @Digits(integer = 12, fraction = 0)
            BigDecimal paidBefore) {}

    public record QuickVariant(
            @NotBlank @Size(max = 30) String color,
            @NotBlank @Size(max = 10) String size,
            // Optional: when given it is written to product_detail.price; empty leaves the price NULL.
            @DecimalMin("0")
            @DecimalMax("999999999999")
            @Digits(integer = 12, fraction = 0)
            BigDecimal salePrice) {}

    public record QuickProduct(
            @NotNull @Positive Integer categoryId,
            @NotBlank @Size(max = 200) String productName,
            @Size(max = 2000) String description,
            @NotEmpty @Size(max = 50) List<@NotNull @Valid QuickVariant> variants,
            Boolean allowSimilar) {}

    public record QuickVariants(
            @NotEmpty @Size(max = 50) List<@NotNull @Valid QuickVariant> variants) {}

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

    /** Stock count line: one variant at one location (locationId null = unplaced part). */
    public record CountLine(
            @NotNull @Positive Integer detailId,
            @Positive Integer locationId,
            @NotNull @Min(0) @Max(1000000) Integer counted,
            @Pattern(regexp = "COUNT_ERROR|DAMAGED|LOST|FOUND|MISSING_DOCUMENT") String reason,
            @Size(max = 255) String note) {}

    public record Count(
            @Size(max = 255) String note,
            @NotNull @Size(min = 1, max = 500) List<@Valid @NotNull CountLine> lines,
            @Pattern(regexp = "[a-f0-9-]{36}") String requestKey) {}

    public record Threshold(@Min(0) @Max(1000000) Integer min) {}

    public record BarcodeGenerate(@Size(max = 500) List<@Positive Integer> detailIds) {}
}
