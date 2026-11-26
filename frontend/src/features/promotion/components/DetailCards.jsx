import { Fragment } from 'react';
import { Box, Card, CircularProgress, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { PictureOutlined } from '@ant-design/icons';
import { categoryFullName } from 'services/categoryService';
import { useCategories, useProducts } from '../hooks';
import { C, cardSx, tableSx } from '../theme';
import { capText, discountText, formatDate, formatTime, money, priceRange, productNameOf } from '../utils';
import { ScheduleBadge } from './PromotionTable';

const labelSx = { fontSize: 12, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 };

function Column({ label, children }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={labelSx}>{label}</Typography>
      <Box sx={{ mt: 1 }}>{children}</Box>
    </Box>
  );
}

// Tên, mức giảm, thời hạn, lịch
export function OverviewCard({ promotion: p }) {
  return (
    <Card sx={cardSx}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 3 }}>
        <Column label="Tên chương trình">
          <Box
            sx={{
              display: 'inline-block',
              px: 2,
              py: 0.6,
              borderRadius: 2.5,
              fontWeight: 800,
              fontSize: 15,
              bgcolor: C.cream,
              color: C.creamText
            }}
          >
            {p.name}
          </Box>
          {p.description && (
            <Typography sx={{ mt: 0.75, fontSize: 13, color: C.muted, lineHeight: 1.5, maxWidth: 360 }}>{p.description}</Typography>
          )}
        </Column>
        <Column label="Mức giảm giá">
          <Typography sx={{ fontSize: 18, fontWeight: 800, color: C.text }}>{discountText(p)}</Typography>
          {capText(p) && <Typography sx={{ fontSize: 12.5, color: C.muted }}>{capText(p)}</Typography>}
        </Column>
        <Column label="Thời hạn áp dụng">
          <Box sx={{ display: 'grid', gridTemplateColumns: 'auto auto auto', columnGap: 1.5, rowGap: 0.75, alignItems: 'center' }}>
            {[
              ['Bắt đầu', p.startDate],
              ['Kết thúc', p.endDate]
            ].map(([label, value]) => (
              <Fragment key={label}>
                <Typography sx={{ fontSize: 12.5, color: C.muted }}>{label}</Typography>
                <Typography sx={{ fontSize: 14, fontWeight: 700, color: C.text }}>{formatDate(value)}</Typography>
                <Box component="span" sx={{ px: 1, py: 0.25, borderRadius: 1.5, bgcolor: C.borderLight, fontSize: 13, fontWeight: 600 }}>
                  {formatTime(value)}
                </Box>
              </Fragment>
            ))}
          </Box>
        </Column>
        <Column label="Trạng thái">
          <ScheduleBadge schedule={p.schedule} sx={{ px: 1.5, py: 0.4, borderRadius: 1.75, fontSize: 13, fontWeight: 600 }} />
        </Column>
      </Box>
    </Card>
  );
}

// Điều kiện của mã giảm giá online
export function ConditionCard({ promotion: p }) {
  const items = [
    ['Loại giảm giá', p.discountType === 'PERCENT' ? 'Theo phần trăm (%)' : 'Số tiền cố định (VNĐ)'],
    ['Đơn hàng tối thiểu', money(p.minOrderValue)],
    p.discountType === 'PERCENT' && ['Giảm tối đa', p.maxDiscountAmount ? money(p.maxDiscountAmount) : 'Không giới hạn'],
    ['Lượt dùng', `${p.usedCount || 0}/${p.usageLimit} lượt`]
  ].filter(Boolean);
  return (
    <Card sx={cardSx}>
      <Typography sx={{ fontWeight: 800, fontSize: 16, color: C.text, mb: 2.5 }}>Điều kiện áp dụng</Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {items.map(([label, value]) => (
          <Box key={label}>
            <Typography sx={{ fontSize: 12.5, color: C.muted, fontWeight: 600 }}>{label}</Typography>
            <Typography sx={{ mt: 0.75, fontSize: 15, fontWeight: 700, color: C.text }}>{value}</Typography>
          </Box>
        ))}
      </Box>
    </Card>
  );
}

function ProductTable({ products, categoryName }) {
  return (
    <TableContainer sx={{ border: `1px solid ${C.borderLight}`, borderRadius: 2.5, overflow: 'hidden' }}>
      <Table sx={tableSx}>
        <TableHead>
          <TableRow>
            <TableCell align="center" sx={{ width: 64, pl: 3 }}>
              STT
            </TableCell>
            <TableCell sx={{ width: 72 }} />
            <TableCell>Sản phẩm</TableCell>
            <TableCell>Danh mục</TableCell>
            <TableCell align="center" sx={{ width: 120 }}>
              Tồn kho
            </TableCell>
            <TableCell align="right" sx={{ width: 200, pr: 3 }}>
              Giá bán
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {products.map((product, index) => (
            <TableRow key={product.productId} hover sx={{ '&:hover': { bgcolor: '#FAFCFE' } }}>
              <TableCell align="center" sx={{ pl: 3, color: `${C.muted} !important` }}>
                {index + 1}
              </TableCell>
              <TableCell>
                <Box
                  sx={{
                    width: 48,
                    height: 48,
                    borderRadius: 2,
                    border: `1px solid ${C.borderLight}`,
                    bgcolor: C.bg,
                    display: 'grid',
                    placeItems: 'center',
                    overflow: 'hidden'
                  }}
                >
                  {product.primaryImageUrl ? (
                    <Box component="img" src={product.primaryImageUrl} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <PictureOutlined style={{ fontSize: 18, color: C.subtle }} />
                  )}
                </Box>
              </TableCell>
              <TableCell>
                <Typography sx={{ fontWeight: 600, color: C.text, fontSize: 14 }}>{productNameOf(product)}</Typography>
                <Typography sx={{ fontSize: 12, color: C.muted }}>{product.sku || '—'}</Typography>
              </TableCell>
              <TableCell sx={{ color: `${C.muted} !important` }}>{categoryName(product)}</TableCell>
              <TableCell align="center" sx={{ color: Number(product.totalStock) > 0 ? undefined : `${C.error} !important` }}>
                {Number(product.totalStock || 0).toLocaleString('vi-VN')}
              </TableCell>
              <TableCell align="right" sx={{ pr: 3, fontWeight: '700 !important' }}>
                {priceRange(product)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

// Phạm vi của khuyến mãi sản phẩm: toàn bộ cửa hàng hoặc bảng sản phẩm được chọn
export function ProductScopeCard({ promotion: p }) {
  const selectedScope = p.applyScope === 'SELECTED';
  const { products, loading } = useProducts(selectedScope);
  const categories = useCategories();
  const ids = new Set((p.productIds || []).map(String));
  const selected = products.filter((product) => ids.has(String(product.productId)));
  const categoryName = (product) => {
    const found = categories.find((c) => String(c.categoryId) === String(product.categoryId));
    return found ? categoryFullName(found) : product.categoryName || 'Chưa phân loại';
  };

  return (
    <Card sx={cardSx}>
      <Typography sx={{ fontWeight: 800, fontSize: 16, color: C.text, mb: 2 }}>Phạm vi áp dụng</Typography>
      {!selectedScope ? (
        <Box sx={{ p: 2.5, borderRadius: 2.5, bgcolor: C.bg, border: `1px solid ${C.borderLight}` }}>
          <Typography sx={{ fontWeight: 700, fontSize: 14, color: C.text }}>Toàn bộ sản phẩm trong cửa hàng</Typography>
          <Typography sx={{ mt: 0.5, fontSize: 13, color: C.muted }}>
            Khuyến mãi được tự động áp dụng cho tất cả sản phẩm trong cửa hàng.
          </Typography>
        </Box>
      ) : (
        <>
          <Typography sx={{ fontSize: 13.5, color: C.muted, mb: 2 }}>
            Khuyến mãi chỉ áp dụng cho {ids.size} sản phẩm được chọn dưới đây:
          </Typography>
          {loading ? (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <CircularProgress size={30} sx={{ color: C.cyan }} />
            </Box>
          ) : selected.length === 0 ? (
            <Typography sx={{ fontSize: 13.5, color: C.muted, py: 2 }}>Không tìm thấy thông tin sản phẩm.</Typography>
          ) : (
            <ProductTable products={selected} categoryName={categoryName} />
          )}
        </>
      )}
    </Card>
  );
}
