// Cỡ chữ chung cho mọi trang quản lý (nhân viên / chủ shop / admin), để các trang đều nhau.
// Trang cửa hàng của khách (storefront) có kiểu chữ riêng, không dùng file này.
// Muốn to/nhỏ cả hệ thống chỉ cần sửa ở đây.
export const PAGE_TYPE = {
  title: { xs: 22, sm: 26 }, // tiêu đề trang (h1)
  titleWeight: 800,
  subtitle: 14, // dòng mô tả dưới tiêu đề
  section: 17, // tiêu đề khối / thẻ trong trang
  // Chữ trong bảng cộng thêm --thors-fs-table (người dùng chỉnh ở nút "Aa" trên header, xem components/FontScale)
  th: 'calc(13px + var(--thors-fs-table, 0px))', // chữ tiêu đề cột bảng
  td: 'calc(13.5px + var(--thors-fs-table, 0px))', // nội dung chính trong ô bảng
  tdSub: 'calc(12.5px + var(--thors-fs-table, 0px))' // dòng phụ trong ô bảng (SĐT dưới tên, giờ dưới ngày…)
};

// sx cho tiêu đề trang và dòng mô tả, dùng khi trang tự dựng phần đầu trang thay vì PageHeader
export const pageTitleSx = { fontSize: PAGE_TYPE.title, fontWeight: PAGE_TYPE.titleWeight, lineHeight: 1.25, letterSpacing: '-0.5px' };
export const pageSubtitleSx = { fontSize: PAGE_TYPE.subtitle, lineHeight: 1.5 };
