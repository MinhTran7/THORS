import { Link, Navigate, useLocation } from "react-router-dom";

// Đồng màu với giao diện cửa hàng (features/shop/storeTheme): màu chủ đạo đỏ đô, chữ đen, viền be, nút vuông
const INK = "#111111";
const PRIMARY = "#8A2B2B"; // đỏ đô — màu chủ đạo
const MUTED = "#5C5650";
const LINE = "#E6E3DE";
const SANS = "'Be Vietnam Pro', system-ui, sans-serif";

const money = (n) => `${new Intl.NumberFormat("vi-VN").format(n || 0)} ₫`;

const PAYMENT_LABEL = {
  COD: "Thanh toán khi nhận hàng (COD)",
  ONLINE: "Thanh toán online (PayOS / VietQR)",
  BANK: "Chuyển khoản ngân hàng",
};

// Hiệu ứng: vòng tròn phóng ra, dấu tick được vẽ từ đầu đến cuối nét
const css = `
@keyframes os-pop {
  0%   { transform: scale(0.4); opacity: 0; }
  70%  { transform: scale(1.08); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes os-draw {
  from { stroke-dashoffset: 1; }
  to   { stroke-dashoffset: 0; }
}
.os-icon { animation: os-pop 0.5s ease-out both; }
.os-tick {
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  animation: os-draw 0.45s ease-out 0.35s forwards;
}
`;

// Icon thành công tự vẽ bằng SVG, không dùng thư viện
function SuccessIcon({ size = 88 }) {
  return (
    <svg
      className="os-icon"
      viewBox="0 0 52 52"
      width={size}
      height={size}
      role="img"
      aria-label="Đặt hàng thành công"
      style={{ display: "block", margin: "0 auto 16px" }}
    >
      <circle cx="26" cy="26" r="26" fill="#F6ECEA" />
      <circle cx="26" cy="26" r="20" fill={PRIMARY} />
      <path
        className="os-tick"
        d="M16 27 L23 34 L36 19"
        pathLength="1"
        fill="none"
        stroke="#ffffff"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
      <span style={{ color: MUTED, flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 500, textAlign: "right" }}>{value}</span>
    </div>
  );
}

export default function OrderSuccessPage() {
  const { state } = useLocation();

  // Vào thẳng /order-success hoặc tải lại trang thì không có dữ liệu -> về danh sách đơn
  if (!state) return <Navigate to="/orders" replace />;

  const { orderId, orderCode, total, paymentMethod, receiver, address } = state;

  return (
    <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
      <style>{css}</style>

      <div
        style={{
          maxWidth: 520,
          width: "100%",
          background: "#fff",
          border: `1px solid ${LINE}`,
          padding: 32,
          textAlign: "center",
          color: INK,
        }}
      >
        <SuccessIcon />

        <h1 style={{ margin: "0 0 8px", fontFamily: SANS, fontWeight: 700, fontSize: 30 }}>Đặt hàng thành công!</h1>
        <p style={{ color: MUTED, margin: "0 0 24px", lineHeight: 1.6 }}>
          Cảm ơn bạn đã mua sắm tại THORS. Cửa hàng sẽ sớm xác nhận và giao hàng cho bạn.
        </p>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            textAlign: "left",
            borderTop: `1px solid ${LINE}`,
            paddingTop: 16,
          }}
        >
          {orderCode && <Row label="Mã đơn hàng" value={`#${orderCode}`} />}
          {receiver && <Row label="Người nhận" value={receiver} />}
          {address && <Row label="Địa chỉ" value={address} />}
          {paymentMethod && (
            <Row
              label="Thanh toán"
              value={PAYMENT_LABEL[paymentMethod] ?? paymentMethod}
            />
          )}

          {total != null && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                borderTop: `1px solid ${LINE}`,
                paddingTop: 12,
              }}
            >
              <span style={{ fontWeight: 600 }}>Tổng thanh toán</span>
              <span style={{ fontSize: 24, fontWeight: 700, color: INK }}>
                {money(total)}
              </span>
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
          <Link
            to={orderId ? `/orders/${orderId}` : "/orders"}
            style={{
              flex: 1,
              padding: 14,
              background: PRIMARY,
              color: "#fff",
              textDecoration: "none",
              fontWeight: 600,
              fontSize: 14,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            {paymentMethod === 'ONLINE' && !state?.paid ? 'Thanh toán ngay / Xem đơn' : 'Xem đơn hàng'}
          </Link>
          <Link
            to="/"
            style={{
              flex: 1,
              padding: 13,
              border: `1px solid ${PRIMARY}`,
              color: PRIMARY,
              textDecoration: "none",
              fontWeight: 600,
              fontSize: 14,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            Tiếp tục mua sắm
          </Link>
        </div>
      </div>
    </div>
  );
}
