import { useState, useRef } from 'react';
import PropTypes from 'prop-types';
import * as XLSX from 'xlsx';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
  Paper
} from '@mui/material';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DownloadOutlined,
  FileExcelOutlined,
  PictureOutlined,
  UploadOutlined,
  WarningOutlined
} from '@ant-design/icons';
import { createProductsBatch } from '../../services/productService';

const COLORS = {
  text: '#202D42',
  muted: '#75869F',
  border: '#E5EBF2',
  cyan: '#8DE9F2',
  cyanLight: '#EAFBFD',
  green: '#25856A',
  red: '#D04D4D',
  yellow: '#E6A23C'
};

export default function ProductExcelDialog({ open, onClose, categories = [], onSuccess }) {
  const fileInputRef = useRef(null);
  const [activeTab, setActiveTab] = useState(0);
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [parsedRows, setParsedRows] = useState([]);
  const [groupedProducts, setGroupedProducts] = useState([]);

  function resetState() {
    setFileName('');
    setParsing(false);
    setImporting(false);
    setErrorMsg('');
    setParsedRows([]);
    setGroupedProducts([]);
    setActiveTab(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function handleClose() {
    if (importing) return;
    resetState();
    onClose();
  }

  // ==========================================
  // 1. TẢI FILE MẪU EXCEL
  // ==========================================
  function handleDownloadTemplate() {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Dữ liệu mẫu (Bổ sung cột Link ảnh)
    const sampleHeaders = ['Tên danh mục', 'Tên sản phẩm', 'Mô tả', 'Kích cỡ', 'Màu sắc', 'Giá bán (VNĐ)', 'Link ảnh (Tùy chọn)'];
    const activeCats = categories.filter((c) => c.status === 'ACTIVE');
    const firstCatName = activeCats.length > 0 ? activeCats[0].categoryName : 'Áo Nam';
    const secondCatName = activeCats.length > 1 ? activeCats[1].categoryName : 'Quần Nam';

    const samplePoloImg = 'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=500';
    const sampleTeeImg = 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=500';
    const samplePantImg = 'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=500';

    const sampleData = [
      sampleHeaders,
      [firstCatName, 'Áo Polo Nam Classic', 'Chất liệu cotton cao cấp co giãn 4 chiều', 'M', 'Đen', 250000, samplePoloImg],
      [firstCatName, 'Áo Polo Nam Classic', 'Chất liệu cotton cao cấp co giãn 4 chiều', 'L', 'Đen', 250000, samplePoloImg],
      [firstCatName, 'Áo Polo Nam Classic', 'Chất liệu cotton cao cấp co giãn 4 chiều', 'M', 'Trắng', 250000, samplePoloImg],
      [firstCatName, 'Áo Polo Nam Classic', 'Chất liệu cotton cao cấp co giãn 4 chiều', 'L', 'Trắng', 250000, samplePoloImg],
      [firstCatName, 'Áo Thun Cổ Tròn Basic', 'Áo phông dáng suông thoáng mát mùa hè', 'S', 'Xám', 180000, sampleTeeImg],
      [firstCatName, 'Áo Thun Cổ Tròn Basic', 'Áo phông dáng suông thoáng mát mùa hè', 'M', 'Xám', 180000, sampleTeeImg],
      [secondCatName, 'Quần Kaki Công Sở', 'Dáng đứng trẻ trung, chống nhăn', '30', 'Be', 350000, samplePantImg],
      [secondCatName, 'Quần Kaki Công Sở', 'Dáng đứng trẻ trung, chống nhăn', '31', 'Be', 350000, samplePantImg]
    ];
    const wsData = XLSX.utils.aoa_to_sheet(sampleData);
    wsData['!cols'] = [{ wch: 18 }, { wch: 25 }, { wch: 35 }, { wch: 10 }, { wch: 12 }, { wch: 15 }, { wch: 55 }];
    XLSX.utils.book_append_sheet(wb, wsData, 'DuLieuSanPham');

    // Sheet 2: Danh sách danh mục tham khảo
    const catHeaders = ['ID', 'Tên danh mục', 'Mô tả', 'Trạng thái'];
    const catData = [
      catHeaders,
      ...categories.map((c) => [c.categoryId, c.categoryName, c.description || '', c.status === 'ACTIVE' ? 'Hoạt động' : 'Đã ẩn'])
    ];
    const wsCat = XLSX.utils.aoa_to_sheet(catData);
    wsCat['!cols'] = [{ wch: 8 }, { wch: 22 }, { wch: 35 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, wsCat, 'DanhSachDanhMuc');

    // Sheet 3: Hướng dẫn
    const guideData = [
      ['HƯỚNG DẪN NHẬP DỮ LIỆU SẢN PHẨM HÀNG LOẠT VÀO HỆ THỐNG THORS'],
      [''],
      ['1. Tên danh mục: Bắt buộc. Phải trùng khớp với tên danh mục đang "Hoạt động" ở sheet DanhSachDanhMuc.'],
      ['2. Tên sản phẩm: Bắt buộc, tối đa 200 ký tự. Các dòng cùng Tên sản phẩm và Danh mục sẽ tự động được gom thành 1 sản phẩm cha.'],
      ['3. Mô tả: Tùy chọn, mô tả sản phẩm.'],
      ['4. Kích cỡ: Bắt buộc, tối đa 10 ký tự (Ví dụ: S, M, L, XL, 29, 30, 31...).'],
      ['5. Màu sắc: Bắt buộc, tối đa 30 ký tự (Ví dụ: Đen, Trắng, Xanh navy, Xám tiêu...).'],
      ['6. Giá bán (VNĐ): Bắt buộc, số nguyên không âm (Ví dụ: 250000).'],
      ['7. Link ảnh (URL): Tùy chọn. Dán đường dẫn ảnh công khai trên mạng (bắt đầu bằng http:// hoặc https://) để làm ảnh chính.'],
      ['8. Cặp (Kích cỡ, Màu sắc) trong cùng một sản phẩm không được trùng nhau.'],
      ['9. Sau khi nhập thành công vào Catalog, tồn kho ban đầu của từng biến thể là 0. Bạn có thể tạo Phiếu Nhập Kho để nhập tồn vật lý.']
    ];
    const wsGuide = XLSX.utils.aoa_to_sheet(guideData);
    wsGuide['!cols'] = [{ wch: 110 }];
    XLSX.utils.book_append_sheet(wb, wsGuide, 'HuongDan');

    XLSX.writeFile(wb, 'THORS_Mau_Nhap_San_Pham.xlsx');
  }

  // ==========================================
  // 2. ĐỌC VÀ PARSE FILE EXCEL
  // ==========================================
  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg('');
    setParsing(true);
    setFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });

      // Lấy sheet đầu tiên hoặc sheet tên 'DuLieuSanPham'
      const sheetName = wb.SheetNames.includes('DuLieuSanPham') ? 'DuLieuSanPham' : wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rawData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      if (!rawData || rawData.length < 2) {
        throw new Error('File Excel không có dữ liệu hoặc sai định dạng mẫu.');
      }

      // Xác định dòng header
      const headerRowIndex = rawData.findIndex((row) =>
        row.some((cell) => {
          const str = String(cell).toLowerCase().trim();
          return str.includes('danh mục') || str.includes('sản phẩm') || str.includes('product');
        })
      );

      if (headerRowIndex === -1) {
        throw new Error('Không tìm thấy dòng tiêu đề cột hợp lệ (Cần có cột Tên danh mục, Tên sản phẩm, Kích cỡ, Màu sắc, Giá bán).');
      }

      const headers = rawData[headerRowIndex].map((h) => String(h).toLowerCase().trim());
      const findCol = (...keywords) => headers.findIndex((h) => keywords.some((k) => h.includes(k)));

      const colCat = findCol('danh mục', 'category');
      const colProd = findCol('tên sản phẩm', 'product', 'tên sp');
      const colDesc = findCol('mô tả', 'description');
      const colSize = findCol('kích cỡ', 'size', 'cỡ');
      const colColor = findCol('màu', 'color');
      const colPrice = findCol('giá', 'price');
      const colImage = findCol('link ảnh', 'ảnh', 'image', 'url', 'hình', 'photo');

      if (colCat === -1 || colProd === -1 || colSize === -1 || colColor === -1 || colPrice === -1) {
        throw new Error(
          'Thiếu cột bắt buộc trong file. Cần đủ các cột: Tên danh mục, Tên sản phẩm, Kích cỡ, Màu sắc, Giá bán.'
        );
      }

      // Xây dựng map danh mục để tra cứu nhanh
      const activeCatMap = new Map();
      categories.forEach((c) => {
        if (c.status === 'ACTIVE') {
          activeCatMap.set(c.categoryName.trim().toLowerCase(), c);
        }
      });

      const parsed = [];
      const dataRows = rawData.slice(headerRowIndex + 1);

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        // Bỏ qua dòng hoàn toàn rỗng
        if (!row.some((c) => String(c).trim() !== '')) continue;

        const rowNum = headerRowIndex + 2 + i;
        const catName = String(row[colCat] || '').trim();
        const prodName = String(row[colProd] || '').trim();
        const desc = colDesc !== -1 ? String(row[colDesc] || '').trim() : '';
        const size = String(row[colSize] || '').trim();
        const color = String(row[colColor] || '').trim();
        const rawPrice = String(row[colPrice] || '').trim();
        const rawImageUrl = colImage !== -1 ? String(row[colImage] || '').trim() : '';

        const errors = [];

        // Validate Category
        let matchedCat = null;
        if (!catName) {
          errors.push('Thiếu tên danh mục');
        } else {
          matchedCat = activeCatMap.get(catName.toLowerCase());
          if (!matchedCat) {
            errors.push(`Danh mục "${catName}" không tồn tại hoặc đã bị ẩn`);
          }
        }

        // Validate Product Name
        if (!prodName) {
          errors.push('Thiếu tên sản phẩm');
        } else if (prodName.length > 200) {
          errors.push('Tên sản phẩm vượt quá 200 ký tự');
        }

        // Validate Size
        if (!size) {
          errors.push('Thiếu kích cỡ (Size)');
        } else if (size.length > 10) {
          errors.push('Kích cỡ vượt quá 10 ký tự');
        }

        // Validate Color
        if (!color) {
          errors.push('Thiếu màu sắc');
        } else if (color.length > 30) {
          errors.push('Màu sắc vượt quá 30 ký tự');
        }

        // Validate Price
        const cleanPriceStr = rawPrice.replace(/[,.₫đ\s]/g, '');
        const numPrice = Number(cleanPriceStr);
        if (rawPrice === '' || isNaN(numPrice) || numPrice < 0 || !Number.isInteger(numPrice)) {
          errors.push('Giá bán phải là số nguyên không âm');
        } else if (numPrice > 999999999999) {
          errors.push('Giá bán vượt quá 999 tỷ VNĐ');
        }

        // Validate Image URL (Tùy chọn)
        let validImageUrl = null;
        if (rawImageUrl) {
          if (rawImageUrl.length > 500) {
            errors.push('Link ảnh vượt quá 500 ký tự');
          } else if (!rawImageUrl.startsWith('http://') && !rawImageUrl.startsWith('https://')) {
            errors.push('Link ảnh phải bắt đầu bằng http:// hoặc https://');
          } else {
            validImageUrl = rawImageUrl;
          }
        }

        parsed.push({
          rowNum,
          categoryName: catName,
          categoryId: matchedCat?.categoryId || null,
          productName: prodName,
          description: desc,
          size,
          color,
          price: isNaN(numPrice) ? 0 : numPrice,
          imageUrl: validImageUrl,
          errors,
          isValid: errors.length === 0
        });
      }

      if (parsed.length === 0) {
        throw new Error('Không tìm thấy dòng dữ liệu nào trong file.');
      }

      // Gom nhóm theo Sản phẩm cha (cùng danh mục + cùng tên sản phẩm)
      const groupMap = new Map();

      parsed.forEach((item) => {
        if (!item.isValid) return;

        const groupKey = `${item.categoryId}|||${item.productName.toLowerCase()}`;
        if (!groupMap.has(groupKey)) {
          groupMap.set(groupKey, {
            categoryId: item.categoryId,
            categoryName: item.categoryName,
            productName: item.productName,
            description: item.description,
            imageUrl: item.imageUrl || null,
            variants: [],
            variantKeys: new Set()
          });
        }

        const group = groupMap.get(groupKey);

        // Kế thừa link ảnh đầu tiên tìm thấy của sản phẩm
        if (!group.imageUrl && item.imageUrl) {
          group.imageUrl = item.imageUrl;
        }

        const variantKey = `${item.size.toLowerCase()}___${item.color.toLowerCase()}`;

        if (group.variantKeys.has(variantKey)) {
          item.errors.push(`Trùng lặp biến thể Size "${item.size}" và Màu "${item.color}" trong cùng sản phẩm`);
          item.isValid = false;
        } else {
          group.variantKeys.add(variantKey);
          group.variants.push({
            size: item.size,
            color: item.color,
            price: item.price
          });
        }
      });

      // Lọc lại các nhóm sản phẩm có ít nhất 1 biến thể hợp lệ
      const finalGroups = Array.from(groupMap.values()).filter((g) => g.variants.length > 0);

      setParsedRows(parsed);
      setGroupedProducts(finalGroups);

      const hasErrors = parsed.some((r) => !r.isValid);
      if (hasErrors) {
        setActiveTab(1); // Mở tab chi tiết dòng để người dùng thấy lỗi ngay
      } else {
        setActiveTab(0);
      }
    } catch (err) {
      console.error('Parse Excel failed:', err);
      setErrorMsg(err.message || 'Không thể đọc file Excel. Vui lòng kiểm tra định dạng.');
    } finally {
      setParsing(false);
    }
  }

  // ==========================================
  // 3. XÁC NHẬN GỬI LÊN BACKEND
  // ==========================================
  async function handleConfirmImport() {
    if (groupedProducts.length === 0) return;

    setImporting(true);
    setErrorMsg('');

    try {
      const payload = groupedProducts.map((p) => ({
        categoryId: p.categoryId,
        productName: p.productName,
        description: p.description,
        imageUrl: p.imageUrl || null,
        variants: p.variants
      }));

      const res = await createProductsBatch(payload);

      if (onSuccess) {
        onSuccess(res?.message || `Đã nhập thành công ${groupedProducts.length} sản phẩm!`);
      }
      handleClose();
    } catch (err) {
      console.error('Batch import failed:', err);
      setErrorMsg(err.message || 'Nhập sản phẩm theo lô thất bại. Vui lòng thử lại.');
    } finally {
      setImporting(false);
    }
  }

  const errorRowCount = parsedRows.filter((r) => !r.isValid).length;
  const totalVariantsCount = groupedProducts.reduce((sum, p) => sum + p.variants.length, 0);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, color: COLORS.text, pb: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <FileExcelOutlined style={{ color: COLORS.green, fontSize: 22 }} />
          <span>Nhập sản phẩm hàng loạt từ Excel</span>
        </Stack>
      </DialogTitle>

      <Divider />

      <DialogContent sx={{ pt: 2.5 }}>
        {/* Nút tải mẫu & chọn file */}
        <Paper
          variant="outlined"
          sx={{
            p: 2.5,
            mb: 2.5,
            bgcolor: '#F9FAFC',
            borderRadius: 2,
            border: `1px dashed ${COLORS.border}`,
            textAlign: 'center'
          }}
        >
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center" alignItems="center">
            <Button
              variant="outlined"
              color="primary"
              startIcon={<DownloadOutlined />}
              onClick={handleDownloadTemplate}
              sx={{ textTransform: 'none' }}
            >
              Tải file mẫu Excel (.xlsx)
            </Button>

            <Button
              variant="contained"
              component="label"
              startIcon={<UploadOutlined />}
              disabled={parsing || importing}
              sx={{
                textTransform: 'none',
                bgcolor: COLORS.green,
                '&:hover': { bgcolor: '#1e6b55' }
              }}
            >
              {fileName ? 'Chọn file khác' : 'Chọn file Excel để tải lên'}
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                hidden
                onChange={handleFileChange}
              />
            </Button>
          </Stack>

          {fileName && (
            <Typography variant="body2" sx={{ mt: 1.5, color: COLORS.muted }}>
              Đang chọn: <strong>{fileName}</strong>
            </Typography>
          )}
        </Paper>

        {parsing && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={28} sx={{ mr: 1.5, color: COLORS.green }} />
            <Typography color={COLORS.muted}>Đang đọc và kiểm tra dữ liệu file Excel...</Typography>
          </Box>
        )}

        {errorMsg && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {errorMsg}
          </Alert>
        )}

        {/* Thống kê sau khi parse */}
        {parsedRows.length > 0 && !parsing && (
          <Box sx={{ mb: 2 }}>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }} flexWrap="wrap">
              <Chip
                icon={<CheckCircleOutlined />}
                label={`${groupedProducts.length} sản phẩm hợp lệ (${totalVariantsCount} biến thể)`}
                color="success"
                variant="outlined"
              />
              {errorRowCount > 0 && (
                <Chip
                  icon={<CloseCircleOutlined />}
                  label={`${errorRowCount} dòng lỗi cần xử lý`}
                  color="error"
                  variant="outlined"
                />
              )}
              <Chip label={`Tổng số dòng: ${parsedRows.length}`} variant="outlined" />
            </Stack>

            {errorRowCount > 0 && (
              <Alert severity="warning" icon={<WarningOutlined />} sx={{ mb: 2 }}>
                Có <strong>{errorRowCount}</strong> dòng dữ liệu bị lỗi. Nếu bấm Xác nhận nhập, hệ thống sẽ{' '}
                <strong>bỏ qua các dòng lỗi</strong> và chỉ tạo <strong>{groupedProducts.length}</strong> sản phẩm hợp lệ.
              </Alert>
            )}

            <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)} sx={{ mb: 1.5, borderBottom: 1, borderColor: 'divider' }}>
              <Tab label={`Sản phẩm sẽ tạo (${groupedProducts.length})`} sx={{ textTransform: 'none', fontWeight: 600 }} />
              <Tab
                label={`Chi tiết từng dòng (${parsedRows.length}) ${errorRowCount > 0 ? `(${errorRowCount} lỗi)` : ''}`}
                sx={{ textTransform: 'none', fontWeight: 600, color: errorRowCount > 0 ? COLORS.red : undefined }}
              />
            </Tabs>

            {/* TAB 0: Danh sách sản phẩm cha gom nhóm */}
            {activeTab === 0 && (
              <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 360 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700, bgcolor: '#F4F6F8', width: 64 }}>Ảnh</TableCell>
                      <TableCell sx={{ fontWeight: 700, bgcolor: '#F4F6F8' }}>Tên sản phẩm</TableCell>
                      <TableCell sx={{ fontWeight: 700, bgcolor: '#F4F6F8' }}>Danh mục</TableCell>
                      <TableCell sx={{ fontWeight: 700, bgcolor: '#F4F6F8' }}>Số biến thể</TableCell>
                      <TableCell sx={{ fontWeight: 700, bgcolor: '#F4F6F8' }}>Chi tiết (Size / Màu / Giá)</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {groupedProducts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} align="center" sx={{ py: 3, color: COLORS.muted }}>
                          Không có sản phẩm hợp lệ nào để tạo.
                        </TableCell>
                      </TableRow>
                    ) : (
                      groupedProducts.map((p, idx) => (
                        <TableRow key={idx} hover>
                          <TableCell>
                            {p.imageUrl ? (
                              <Box
                                component="img"
                                src={p.imageUrl}
                                alt={p.productName}
                                sx={{
                                  width: 44,
                                  height: 44,
                                  objectFit: 'cover',
                                  borderRadius: 1.5,
                                  border: `1px solid ${COLORS.border}`
                                }}
                              />
                            ) : (
                              <Box
                                sx={{
                                  width: 44,
                                  height: 44,
                                  borderRadius: 1.5,
                                  bgcolor: '#F0F2F5',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: COLORS.muted,
                                  fontSize: 10,
                                  fontWeight: 600
                                }}
                              >
                                <PictureOutlined style={{ fontSize: 18 }} />
                              </Box>
                            )}
                          </TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>{p.productName}</TableCell>
                          <TableCell>
                            <Chip size="small" label={p.categoryName} sx={{ bgcolor: COLORS.cyanLight, color: COLORS.text }} />
                          </TableCell>
                          <TableCell>{p.variants.length} SKU</TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ py: 0.5 }}>
                              {p.variants.map((v, vIdx) => (
                                <Chip
                                  key={vIdx}
                                  size="small"
                                  variant="outlined"
                                  label={`${v.size} - ${v.color}: ${v.price.toLocaleString('vi-VN')}₫`}
                                  sx={{ fontSize: 11 }}
                                />
                              ))}
                            </Stack>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            {/* TAB 1: Chi tiết từng dòng từ Excel */}
            {activeTab === 1 && (
              <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 360 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700, bgcolor: '#F4F6F8', width: 55 }}>Dòng</TableCell>
                      <TableCell sx={{ fontWeight: 700, bgcolor: '#F4F6F8', width: 55 }}>Ảnh</TableCell>
                      <TableCell sx={{ fontWeight: 700, bgcolor: '#F4F6F8' }}>Danh mục</TableCell>
                      <TableCell sx={{ fontWeight: 700, bgcolor: '#F4F6F8' }}>Tên sản phẩm</TableCell>
                      <TableCell sx={{ fontWeight: 700, bgcolor: '#F4F6F8', width: 65 }}>Size</TableCell>
                      <TableCell sx={{ fontWeight: 700, bgcolor: '#F4F6F8', width: 85 }}>Màu</TableCell>
                      <TableCell sx={{ fontWeight: 700, bgcolor: '#F4F6F8', width: 95 }}>Giá (VNĐ)</TableCell>
                      <TableCell sx={{ fontWeight: 700, bgcolor: '#F4F6F8' }}>Trạng thái / Lỗi</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {parsedRows.map((r, idx) => (
                      <TableRow key={idx} sx={{ bgcolor: r.isValid ? 'inherit' : '#FFF2F0' }}>
                        <TableCell>{r.rowNum}</TableCell>
                        <TableCell>
                          {r.imageUrl ? (
                            <Tooltip title={r.imageUrl}>
                              <Box
                                component="img"
                                src={r.imageUrl}
                                alt="preview"
                                sx={{
                                  width: 34,
                                  height: 34,
                                  objectFit: 'cover',
                                  borderRadius: 1,
                                  border: `1px solid ${COLORS.border}`
                                }}
                              />
                            </Tooltip>
                          ) : (
                            <Typography variant="caption" color="text.secondary">
                              —
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>{r.categoryName || '—'}</TableCell>
                        <TableCell sx={{ fontWeight: 500 }}>{r.productName || '—'}</TableCell>
                        <TableCell>{r.size || '—'}</TableCell>
                        <TableCell>{r.color || '—'}</TableCell>
                        <TableCell>{r.price > 0 ? r.price.toLocaleString('vi-VN') : '—'}</TableCell>
                        <TableCell>
                          {r.isValid ? (
                            <Chip size="small" color="success" label="Hợp lệ" variant="outlined" />
                          ) : (
                            <Typography variant="caption" color="error" sx={{ fontWeight: 600 }}>
                              {r.errors.join('; ')}
                            </Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        )}
      </DialogContent>

      <Divider />

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={handleClose} disabled={importing} sx={{ textTransform: 'none', color: COLORS.muted }}>
          Hủy bỏ
        </Button>

        <Button
          variant="contained"
          onClick={handleConfirmImport}
          disabled={importing || groupedProducts.length === 0}
          startIcon={importing ? <CircularProgress size={16} color="inherit" /> : <CheckCircleOutlined />}
          sx={{
            textTransform: 'none',
            bgcolor: COLORS.green,
            '&:hover': { bgcolor: '#1e6b55' }
          }}
        >
          {importing
            ? 'Đang nhập...'
            : `Xác nhận nhập ${groupedProducts.length > 0 ? `(${groupedProducts.length} sản phẩm)` : ''}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

ProductExcelDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  categories: PropTypes.array,
  onSuccess: PropTypes.func
};
