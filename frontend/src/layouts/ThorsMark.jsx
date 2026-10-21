// Biểu tượng THORS tạm thời theo thiết kế (thẻ hồng có chân). Thay bằng logo chính thức khi có.
export default function ThorsMark({ height = 30 }) {
  return (
    <svg height={height} viewBox="0 0 28 32" role="img" aria-label="THORS">
      <rect x="1" y="1" width="26" height="24" rx="5" fill="#F4A0BC" />
      <rect x="5" y="5" width="18" height="4" rx="2" fill="#fff" opacity="0.4" />
      <path d="M9 25v5.5" stroke="#1F2937" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}