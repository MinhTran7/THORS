import { Link, Navigate, useLocation } from "react-router-dom";

const money = (n) => `${new Intl.NumberFormat("vi-VN").format(n || 0)} ₫`;

const PAYMENT_LABEL = {
  COD: "Thanh toán khi nhận hàng (COD)",
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
      <circle cx="26" cy="26" r="26" fill="#16a34a" opacity="0.15" />
      <circle cx="26" cy="26" r="20" fill="#16a34a" />
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
      <span style={{ color: "#6b7280", flexShrink: 0 }}>{label}</span>
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
          borderRadius: 12,
          padding: 32,
          textAlign: "center",
          boxShadow: "0 1px 4px rgba(0,0,0,.08)",
        }}
      >
        <SuccessIcon />

        <h1 style={{ margin: "0 0 8px" }}>Đặt hàng thành công!</h1>
        <p style={{ color: "#6b7280", margin: "0 0 24px" }}>
          Cảm ơn bạn đã mua sắm tại THORS. Cửa hàng sẽ sớm xác nhận và giao hàng cho bạn.
        </p>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            textAlign: "left",
            borderTop: "1px solid #eee",
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
                borderTop: "1px solid #eee",
                paddingTop: 12,
              }}
            >
              <span style={{ fontWeight: 600 }}>Tổng thanh toán</span>
              <span style={{ fontSize: 24, fontWeight: 700, color: "#1677ff" }}>
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
              padding: 12,
              borderRadius: 6,
              background: "#1677ff",
              color: "#fff",
              textDecoration: "none",
              fontWeight: 500,
            }}
          >
            Xem đơn hàng
          </Link>
          <Link
            to="/"
            style={{
              flex: 1,
              padding: 12,
              borderRadius: 6,
              border: "1px solid #1677ff",
              color: "#1677ff",
              textDecoration: "none",
              fontWeight: 500,
            }}
          >
            Tiếp tục mua sắm
          </Link>
        </div>
      </div>
    </div>
  );
}