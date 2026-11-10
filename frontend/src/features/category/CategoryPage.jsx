import { useEffect, useMemo, useRef, useState } from 'react';

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Select,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import { Pager } from 'features/account/components/Blocks';

import {
  AppstoreOutlined,
  CheckCircleOutlined,
  DownOutlined,
  EditOutlined,
  EllipsisOutlined,
  EyeOutlined,
  FolderAddOutlined,
  ManOutlined,
  ShoppingOutlined,
  SmileOutlined,
  TagOutlined,
  TeamOutlined,
  WomanOutlined,
  PlusOutlined,
  RightOutlined,
  SearchOutlined,
  TagsOutlined,
  WarningOutlined
} from '@ant-design/icons';

import {
  getCategories,
  createCategory,
  updateCategory,
  changeCategoryStatus,
  TARGET_GROUPS,
  targetGroupLabel
} from 'services/categoryService';

import { getProducts } from 'services/productService';
import { C, cardSx, outlineButtonSx, primaryButtonSx } from '../customer/theme';

const PAGE_SIZE = 5;

const emptyForm = {
  categoryName: '',
  description: '',
  parentId: '',
  targetGroup: ''
};

// Màu nhãn đối tượng (Nam / Nữ / Trẻ em / Nam & Nữ)
const TARGET_BADGE = {
  MEN: { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' },
  WOMEN: { bg: '#FDF2F8', color: '#BE185D', border: '#FBCFE8' },
  KIDS: { bg: '#FFF7AE', color: '#713F12', border: '#FDE047' },
  UNISEX: { bg: '#F0FCFE', color: '#0E7490', border: '#8EECF5' }
};

const selectSx = {
  bgcolor: C.surface,
  borderRadius: 2.5,
  height: 44,
  fontSize: 13.5,
  '& .MuiOutlinedInput-notchedOutline': { borderColor: C.border },
  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: C.cyan },
  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: C.cyan }
};

const inputSx = (hasError) => ({
  '& .MuiOutlinedInput-root': {
    borderRadius: 2.5,
    minHeight: 44,
    fontSize: 13.5,
    '& fieldset': { borderColor: hasError ? C.error : C.border },
    '&:hover fieldset, &.Mui-focused fieldset': { borderColor: hasError ? C.error : C.cyan }
  }
});

const linkButtonSx = (color, hoverBg) => ({
  textTransform: 'none',
  fontSize: 13,
  fontWeight: 600,
  color,
  borderRadius: 1.5,
  px: 1.25,
  py: 0.5,
  '&:hover': { bgcolor: hoverBg }
});

const badgeSx = (bg, color, border) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 0.6,
  bgcolor: bg,
  color: color,
  border: `1px solid ${border}`,
  borderRadius: 99,
  px: 1.4,
  py: 0.35,
  fontSize: 12,
  fontWeight: 700,
  flexShrink: 0
});

// Icon danh mục con theo đối tượng (cùng tông màu với nhãn ở cột Đối tượng)
const TARGET_ICON = {
  MEN: ManOutlined,
  WOMEN: WomanOutlined,
  KIDS: SmileOutlined,
  UNISEX: TeamOutlined
};

// Danh mục gốc (có hay chưa có danh mục con) dùng chung icon túi mua sắm
function CategoryIcon({ category }) {
  if (category.isChild) {
    const Icon = TARGET_ICON[category.targetGroup] || TagOutlined;
    return <Icon />;
  }
  return <ShoppingOutlined />;
}

// Màu nền ô icon: danh mục con lấy theo đối tượng
function iconTone(category) {
  const tone = category.isChild && TARGET_BADGE[category.targetGroup];
  if (tone) return { bgcolor: tone.bg, color: tone.color, borderColor: tone.border };
  // Danh mục gốc: ô icon xanh cyan đậm hơn để nổi bật so với danh mục con
  if (!category.isChild) return { bgcolor: '#E3FAFD', color: '#0E7490', borderColor: C.cyan };
  return { bgcolor: C.surface, color: C.muted, borderColor: C.border };
}

function TargetBadge({ value }) {
  const label = targetGroupLabel(value);
  if (!label) {
    return <Typography sx={{ fontSize: 13, color: '#94A3B8' }}>—</Typography>;
  }
  const tone = TARGET_BADGE[value];
  return <Box sx={badgeSx(tone.bg, tone.color, tone.border)}>{label}</Box>;
}

function StatisticCard({
  label,
  value,
  note,
  icon,
  highlight
}) {
  return (
    <Card
      sx={{
        ...cardSx,
        height: '100%',
        bgcolor: highlight ? '#F0FCFE' : C.surface,
        border: `1.5px solid ${highlight ? C.cyan : C.border}`,
        transition: 'all 0.2s ease',
        '&:hover': {
          boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
          borderColor: highlight ? C.cyanHover : '#CBD5E1'
        }
      }}
    >
      <CardContent
        sx={{
          p: { xs: 2.5, sm: 3 },
          '&:last-child': { pb: { xs: 2.5, sm: 3 } }
        }}
      >
        <Stack
          direction="row"
          sx={{ justifyContent: 'space-between', alignItems: 'center' }}
        >
          <Typography
            sx={{
              fontSize: 13,
              fontWeight: 700,
              color: C.muted
            }}
          >
            {label}
          </Typography>

          <Box
            sx={{
              width: 38,
              height: 38,
              borderRadius: 2.5,
              bgcolor: highlight ? C.cyan : C.borderLight,
              color: '#0F172A',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 17
            }}
          >
            {icon}
          </Box>
        </Stack>

        <Typography
          sx={{
            fontSize: 28,
            fontWeight: 800,
            color: '#0F172A',
            mt: 1.25,
            letterSpacing: -0.5
          }}
        >
          {value}
        </Typography>

        <Typography
          sx={{
            fontSize: 12.5,
            color: C.muted,
            mt: 0.75,
            lineHeight: 1.5
          }}
        >
          {note}
        </Typography>
      </CardContent>
    </Card>
  );
}

export default function CategoryPage() {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);

  const [loading, setLoading] = useState(true);
  const [productsLoaded, setProductsLoaded] = useState(false);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [targetFilter, setTargetFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  // Danh mục cha đang mở (xổ danh mục con)
  const [expanded, setExpanded] = useState(() => new Set());

  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [statusDialog, setStatusDialog] = useState(null);
  const [changingStatus, setChangingStatus] = useState(false);

  const [viewCategory, setViewCategory] = useState(null);

  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuCategory, setMenuCategory] = useState(null);

  // ==========================================
  // LOAD DATA
  // ==========================================

  async function loadCategories() {
    try {
      const data = await getCategories();
      setCategories(Array.isArray(data) ? data : []);
      setError('');
      return true;
    } catch (e) {
      setError(e?.message || 'Không thể tải danh sách danh mục.');
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function loadProducts() {
    try {
      const data = await getProducts();
      if (!Array.isArray(data)) {
        throw new Error('Dữ liệu sản phẩm không hợp lệ.');
      }
      setProducts(data);
      setProductsLoaded(true);
    } catch (e) {
      console.error('Không thể tải số lượng sản phẩm:', e);
      setProductsLoaded(false);
    }
  }

  useEffect(() => {
    loadCategories();
    loadProducts();
  }, []);

  // ==========================================
  // REAL STATISTICS
  // ==========================================

  const activeCategories = useMemo(
    () => categories.filter((item) => item.status === 'ACTIVE').length,
    [categories]
  );

  const productCountMap = useMemo(() => {
    const counts = new Map();
    for (const product of products) {
      const categoryId = Number(product.categoryId);
      counts.set(categoryId, (counts.get(categoryId) || 0) + 1);
    }
    return counts;
  }, [products]);

  const categorizedProducts = productsLoaded ? products.length : null;

  // Danh mục gốc / danh mục con
  const rootCategories = useMemo(() => categories.filter((item) => !item.parentId), [categories]);
  const childCount = categories.length - rootCategories.length;
  const childrenOf = useMemo(() => {
    const map = new Map();
    for (const item of categories) {
      if (!item.parentId) continue;
      const list = map.get(item.parentId) || [];
      list.push(item);
      map.set(item.parentId, list);
    }
    return map;
  }, [categories]);

  // Số sản phẩm gắn trực tiếp vào danh mục
  function getDirectProductCount(categoryId) {
    if (!productsLoaded) return null;
    return productCountMap.get(Number(categoryId)) || 0;
  }

  // Danh mục cha: cộng cả sản phẩm của các danh mục con
  function getProductCount(categoryId) {
    if (!productsLoaded) return null;
    const children = childrenOf.get(categoryId) || [];
    return children.reduce(
      (sum, child) => sum + (productCountMap.get(Number(child.categoryId)) || 0),
      getDirectProductCount(categoryId)
    );
  }

  // ==========================================
  // SEARCH / FILTER / PAGINATION
  // ==========================================

  // Hiển thị dạng cây: danh mục con nằm ngay dưới danh mục cha.
  // Danh mục cha luôn hiện khi có danh mục con khớp bộ lọc (để biết con thuộc cha nào).
  const filteredCategories = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    const matches = (category) => {
      const name = (category.categoryName || '').toLowerCase();
      const description = (category.description || '').toLowerCase();

      const matchesSearch =
        name.includes(keyword) || description.includes(keyword);

      const matchesStatus =
        statusFilter === 'ALL' || category.status === statusFilter;

      const matchesTarget =
        targetFilter === 'ALL' ||
        (targetFilter === 'NONE' ? !category.targetGroup : category.targetGroup === targetFilter);

      return matchesSearch && matchesStatus && matchesTarget;
    };

    const ids = new Set(categories.map((item) => item.categoryId));
    const groups = [];
    for (const root of categories) {
      // Danh mục con mất cha (không có trong danh sách) được coi như danh mục gốc
      if (root.parentId && ids.has(root.parentId)) continue;
      const children = (childrenOf.get(root.categoryId) || []).filter(matches);
      if (matches(root) || children.length > 0) {
        groups.push({
          root: { ...root, isChild: false, contextOnly: !matches(root) },
          children: children.map((child) => ({ ...child, isChild: true }))
        });
      }
    }
    return groups;
  }, [categories, childrenOf, search, statusFilter, targetFilter]);

  // Đang tìm kiếm / lọc thì tự mở các nhóm có danh mục con khớp
  const isFiltering = Boolean(search.trim()) || statusFilter !== 'ALL' || targetFilter !== 'ALL';

  function isExpanded(categoryId) {
    return isFiltering || expanded.has(categoryId);
  }

  function toggleExpanded(categoryId) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }

  const pageCount = Math.max(
    1,
    Math.ceil(filteredCategories.length / PAGE_SIZE)
  );

  const currentPage = Math.min(page, pageCount);

  // Các dòng hiển thị: danh mục cha + danh mục con (nếu đang mở)
  const paginatedCategories = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredCategories
      .slice(start, start + PAGE_SIZE)
      .flatMap((group) => [
        { ...group.root, visibleChildren: group.children.length },
        ...(isFiltering || expanded.has(group.root.categoryId)
          ? group.children.map((child, index) => ({ ...child, isLastChild: index === group.children.length - 1 }))
          : [])
      ]);
  }, [filteredCategories, currentPage, expanded, isFiltering]);

  function handleSearchChange(value) {
    setSearch(value);
    setPage(1);
  }

  function handleFilterChange(value) {
    setStatusFilter(value);
    setPage(1);
  }

  function handleTargetFilterChange(value) {
    setTargetFilter(value);
    setPage(1);
  }

  // ==========================================
  // CREATE / EDIT DIALOG
  // ==========================================

  // parent: mở từ "Thêm danh mục con" -> chọn sẵn danh mục cha
  function openCreateDialog(parent) {
    if (parent?.categoryId) {
      setExpanded((prev) => new Set(prev).add(parent.categoryId));
    }
    setForm({ ...emptyForm, parentId: parent?.categoryId ? String(parent.categoryId) : '' });
    setFormError('');
    setSuccess('');
    setDialog({ mode: 'create' });
  }

  function openEditDialog(category) {
    setForm({
      categoryName: category.categoryName,
      description: category.description || '',
      parentId: category.parentId ? String(category.parentId) : '',
      targetGroup: category.targetGroup || ''
    });

    setFormError('');
    setSuccess('');

    setDialog({
      mode: 'edit',
      item: category
    });
  }

  // Danh mục cha hợp lệ: danh mục gốc, khác chính nó, đang hoạt động (giữ lại cha hiện tại dù đã ngưng)
  const editingId = dialog?.mode === 'edit' ? dialog.item.categoryId : null;
  const editingHasChildren = dialog?.mode === 'edit' && dialog.item.childCount > 0;
  const parentOptions = rootCategories.filter(
    (item) =>
      item.categoryId !== editingId &&
      (item.status === 'ACTIVE' || String(item.categoryId) === form.parentId)
  );

  // Đổi danh mục cha / đối tượng khi thêm mới: tự gợi ý tên danh mục con (vd "Giày" + Trẻ em -> "Giày trẻ em").
  // Gõ tên trùng một danh mục gốc (vd "Giày") rồi chọn đối tượng -> tự chọn "Giày" làm danh mục cha.
  const TARGET_SUFFIX = { MEN: 'nam', WOMEN: 'nữ', KIDS: 'trẻ em', UNISEX: 'unisex' };
  const lastSuggestion = useRef('');

  function changeHierarchy(patch) {
    const next = { ...form, ...patch };
    if (dialog?.mode === 'create') {
      const typed = form.categoryName.trim();
      if (!next.parentId && next.targetGroup) {
        const sameRoot = rootCategories.find(
          (item) => item.status === 'ACTIVE' && item.categoryName.trim().toLowerCase() === typed.toLowerCase()
        );
        if (sameRoot) next.parentId = String(sameRoot.categoryId);
      }
      const parent = rootCategories.find((item) => String(item.categoryId) === next.parentId);
      const canReplace =
        !typed ||
        typed === lastSuggestion.current ||
        rootCategories.some((item) => item.categoryName.trim().toLowerCase() === typed.toLowerCase());
      if (parent && canReplace) {
        const suggestion = next.targetGroup
          ? `${parent.categoryName} ${TARGET_SUFFIX[next.targetGroup]}`
          : '';
        next.categoryName = suggestion || (typed === lastSuggestion.current ? '' : form.categoryName);
        lastSuggestion.current = suggestion;
      }
    }
    setForm(next);
  }

  function closeDialog() {
    if (saving) return;
    setDialog(null);
    setFormError('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!dialog || saving) return;

    const categoryName = form.categoryName.trim();
    const description = form.description.trim();

    if (!categoryName) {
      setFormError('Vui lòng nhập tên danh mục.');
      return;
    }

    if (categoryName.length > 100) {
      setFormError('Tên danh mục không được vượt quá 100 ký tự.');
      return;
    }

    if (description.length > 255) {
      setFormError('Mô tả không được vượt quá 255 ký tự.');
      return;
    }

    const isCreate = dialog.mode === 'create';
    setSaving(true);
    setFormError('');
    setError('');

    try {
      const data = {
        categoryName,
        description,
        parentId: form.parentId,
        targetGroup: form.targetGroup
      };

      if (isCreate) {
        await createCategory(data);
      } else {
        await updateCategory(dialog.item.categoryId, data);
      }

      setDialog(null);
      const parentName = form.parentId
        ? categories.find((item) => String(item.categoryId) === form.parentId)?.categoryName
        : '';
      setSuccess(
        isCreate
          ? parentName
            ? `Đã thêm danh mục con "${categoryName}" vào "${parentName}".`
            : 'Tạo danh mục mới thành công.'
          : 'Cập nhật danh mục thành công.'
      );
      await loadCategories();
    } catch (e) {
      setFormError(e?.message || 'Không thể lưu danh mục.');
    } finally {
      setSaving(false);
    }
  }

  // ==========================================
  // CHANGE CATEGORY STATUS
  // ==========================================

  function openStatusDialog(category) {
    setSuccess('');
    setStatusDialog(category);
  }

  async function handleChangeStatus() {
    if (!statusDialog || changingStatus) return;

    const category = statusDialog;
    const newStatus = category.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

    setChangingStatus(true);
    setError('');
    setSuccess('');

    try {
      await changeCategoryStatus(category.categoryId, newStatus);
      setStatusDialog(null);
      setSuccess(
        newStatus === 'ACTIVE'
          ? 'Đã kích hoạt danh mục thành công.'
          : 'Đã ngưng hoạt động danh mục thành công.'
      );
      await loadCategories();
    } catch (e) {
      setError(e?.message || 'Không thể thay đổi trạng thái danh mục.');
      setStatusDialog(null);
    } finally {
      setChangingStatus(false);
    }
  }

  // ==========================================
  // ACTION MENU
  // ==========================================

  function openActionMenu(event, category) {
    setMenuAnchor(event.currentTarget);
    setMenuCategory(category);
  }

  function closeActionMenu() {
    setMenuAnchor(null);
    setMenuCategory(null);
  }

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <Box sx={{ maxWidth: 1440, mx: 'auto', pb: 6, color: C.text }}>
      {/* PAGE HEADER */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 2,
          mb: 3.5
        }}
      >
        <Box>
          <Typography
            variant="h3"
            sx={{
              fontWeight: 800,
              color: '#0F172A',
              fontSize: { xs: 22, sm: 26 }
            }}
          >
            Danh mục sản phẩm
          </Typography>
          <Typography sx={{ fontSize: 13.5, color: C.muted, mt: 0.5, lineHeight: 1.6 }}>
            Tổ chức và quản lý danh mục giúp khách hàng dễ dàng tìm kiếm sản phẩm
          </Typography>
        </Box>

        <Button
          startIcon={<PlusOutlined />}
          onClick={() => openCreateDialog()}
          sx={primaryButtonSx}
        >
          Thêm danh mục
        </Button>
      </Box>

      {/* MESSAGES */}
      {error && (
        <Alert
          severity="error"
          onClose={() => setError('')}
          sx={{ mb: 2.5, borderRadius: 2.5, fontSize: 13.5, fontWeight: 600 }}
        >
          {error}
        </Alert>
      )}

      {success && (
        <Alert
          severity="success"
          onClose={() => setSuccess('')}
          sx={{ mb: 2.5, borderRadius: 2.5, fontSize: 13.5, fontWeight: 600 }}
        >
          {success}
        </Alert>
      )}

      {/* STATISTICS */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <StatisticCard
            label="Tổng số danh mục"
            value={loading ? '—' : categories.length}
            note={
              loading
                ? 'Phân loại rõ ràng cho toàn bộ cửa hàng'
                : `${rootCategories.length} danh mục gốc · ${childCount} danh mục con`
            }
            icon={<TagsOutlined />}
          />
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <StatisticCard
            label="Đang hoạt động"
            value={loading ? '—' : activeCategories}
            note="Hiển thị và phục vụ bán hàng"
            icon={<CheckCircleOutlined />}
          />
        </Grid>

        <Grid size={{ xs: 12, sm: 12, md: 4 }}>
          <StatisticCard
            label="Sản phẩm đã phân loại"
            value={categorizedProducts === null ? '—' : categorizedProducts}
            note={
              productsLoaded
                ? 'Tổng số sản phẩm có danh mục'
                : 'Đang kết nối dữ liệu'
            }
            icon={<AppstoreOutlined />}
            highlight
          />
        </Grid>
      </Grid>

      {/* SEARCH AND FILTER */}
      <Box
        sx={{
          mb: 3,
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'minmax(200px, 1.8fr) 200px 200px auto'
          },
          gap: { xs: 1.5, lg: 2 },
          alignItems: 'flex-end'
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: C.text, mb: 0.75 }}>
            Tìm kiếm danh mục
          </Typography>
          <TextField
            fullWidth
            size="small"
            value={search}
            onChange={(event) => handleSearchChange(event.target.value)}
            placeholder="Tìm theo tên danh mục hoặc mô tả..."
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlined style={{ color: '#94A3B8', fontSize: 16 }} />
                </InputAdornment>
              )
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                bgcolor: C.surface,
                borderRadius: 2.5,
                height: 44,
                fontSize: 13.5,
                '& fieldset': { borderColor: C.border },
                '&:hover fieldset': { borderColor: C.cyan },
                '&.Mui-focused fieldset': { borderColor: C.cyan }
              }
            }}
          />
        </Box>

        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: C.text, mb: 0.75 }}>
            Trạng thái
          </Typography>
          <Select
            fullWidth
            size="small"
            value={statusFilter}
            onChange={(event) => handleFilterChange(event.target.value)}
            sx={{
              bgcolor: C.surface,
              borderRadius: 2.5,
              height: 44,
              fontSize: 13.5,
              '& .MuiOutlinedInput-notchedOutline': { borderColor: C.border },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: C.cyan },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: C.cyan }
            }}
          >
            <MenuItem value="ALL">Tất cả trạng thái</MenuItem>
            <MenuItem value="ACTIVE">Đang hoạt động</MenuItem>
            <MenuItem value="INACTIVE">Đã ngưng</MenuItem>
          </Select>
        </Box>

        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: C.text, mb: 0.75 }}>
            Đối tượng
          </Typography>
          <Select
            fullWidth
            size="small"
            value={targetFilter}
            onChange={(event) => handleTargetFilterChange(event.target.value)}
            sx={selectSx}
          >
            <MenuItem value="ALL">Tất cả đối tượng</MenuItem>
            {TARGET_GROUPS.map((item) => (
              <MenuItem key={item.value} value={item.value}>
                {item.label}
              </MenuItem>
            ))}
            <MenuItem value="NONE">Không áp dụng</MenuItem>
          </Select>
        </Box>

        {/* Nút Bỏ lọc */}
        <Box sx={{ minWidth: 0, display: 'flex' }}>
          <Button
            variant="outlined"
            onClick={() => {
              setSearch('');
              setStatusFilter('ALL');
              setTargetFilter('ALL');
              setPage(1);
            }}
            disableRipple
            sx={{
              height: 44,
              px: 2,
              minWidth: 'unset',
              borderRadius: 2.5,
              textTransform: 'none',
              fontSize: 13,
              fontWeight: 600,
              borderColor: C.border,
              bgcolor: C.surface,
              color: C.text,
              whiteSpace: 'nowrap',
              '&:hover': {
                bgcolor: '#F8FAFC',
                borderColor: C.border,
                color: C.text
              }
            }}
          >
            Bỏ lọc
          </Button>
        </Box>
      </Box>

      {/* ─── KHỐI BẢNG DANH MỤC ─── */}
      <Box
        sx={{
          bgcolor: C.surface,
          borderRadius: 3.5,
          border: `1px solid ${C.border}`,
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          overflow: 'hidden'
        }}
      >
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table
            sx={{
              minWidth: 860,
              '& th': {
                bgcolor: C.surface,
                color: C.muted,
                fontSize: 12,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                py: 1.75,
                borderBottom: `1px solid ${C.borderLight}`
              },
              '& td': {
                borderColor: C.borderLight,
                py: 2,
                fontSize: 13.5,
                color: C.text
              }
            }}
          >
            <TableHead>
              <TableRow>
                <TableCell sx={{ pl: 3 }}>TÊN DANH MỤC</TableCell>
                <TableCell>ĐỐI TƯỢNG</TableCell>
                <TableCell>MÔ TẢ</TableCell>
                <TableCell>SỐ SẢN PHẨM</TableCell>
                <TableCell>TRẠNG THÁI</TableCell>
                <TableCell align="center" sx={{ pr: 3 }}>THAO TÁC</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                    <CircularProgress size={32} sx={{ color: C.cyan }} />
                    <Typography fontSize={13.5} color={C.muted} sx={{ mt: 1.5 }}>
                      Đang tải danh mục...
                    </Typography>
                  </TableCell>
                </TableRow>
              )}

              {!loading &&
                paginatedCategories.map((category) => {
                  const isActive = category.status === 'ACTIVE';
                  const productCount = getProductCount(category.categoryId);
                  const isParent = category.childCount > 0;
                  const canToggle = !category.isChild && category.visibleChildren > 0;
                  const open = canToggle && isExpanded(category.categoryId);
                  // Danh mục cha vẫn còn sản phẩm gắn trực tiếp -> nhắc chuyển sang danh mục con
                  const directCount = isParent ? getDirectProductCount(category.categoryId) : 0;

                  return (
                    <TableRow
                      key={category.categoryId}
                      hover
                      sx={{
                        // Cha đang mở: nền xanh nhạt + vạch trái; con: nền xám rất nhạt
                        bgcolor: category.isChild ? '#FAFBFC' : open ? '#F5FDFE' : '#FFFFFF',
                        boxShadow: !category.isChild && open ? `inset 3px 0 0 ${C.cyanHover}` : 'none',
                        '&:hover': { bgcolor: '#F5FAFC' }
                      }}
                    >
                      {/* CATEGORY NAME */}
                      <TableCell
                        onClick={canToggle && !isFiltering ? () => toggleExpanded(category.categoryId) : undefined}
                        sx={{
                          py: category.isChild ? 1.25 : 1.75,
                          opacity: category.contextOnly ? 0.6 : 1,
                          cursor: canToggle && !isFiltering ? 'pointer' : 'default',
                          userSelect: 'none'
                        }}
                      >
                        <Stack
                          direction="row"
                          spacing={1.5}
                          sx={{ alignItems: 'center', ml: category.isChild ? '58px' : 0 }}
                        >
                          {!category.isChild && (
                            <Box
                              aria-label={open ? 'Thu gọn danh mục con' : 'Xem danh mục con'}
                              sx={{
                                width: 22,
                                height: 22,
                                flexShrink: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: '50%',
                                bgcolor: canToggle ? (open ? '#CFF6FB' : '#F1F5F9') : 'transparent',
                                color: canToggle ? '#0F172A' : 'transparent',
                                fontSize: 10,
                                transition: 'background-color .15s'
                              }}
                            >
                              {open ? <DownOutlined /> : <RightOutlined />}
                            </Box>
                          )}
                          <Box
                            sx={{
                              width: category.isChild ? 28 : 36,
                              height: category.isChild ? 28 : 36,
                              fontSize: category.isChild ? 13 : 16,
                              bgcolor: iconTone(category).bgcolor,
                              border: `1px solid ${iconTone(category).borderColor}`,
                              borderRadius: 2,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: iconTone(category).color,
                              flexShrink: 0
                            }}
                          >
                            <CategoryIcon category={category} />
                          </Box>

                          <Box>
                            <Typography
                              sx={{
                                fontSize: category.isChild ? 13 : 14,
                                fontWeight: category.isChild ? 500 : 700,
                                color: category.isChild ? '#334155' : '#0F172A'
                              }}
                            >
                              {category.categoryName}
                            </Typography>
                            {/* Chỉ hiện tên cho gọn; mã danh mục xem ở nút Xem chi tiết */}
                          </Box>
                        </Stack>
                      </TableCell>

                      {/* TARGET GROUP */}
                      <TableCell>
                        <TargetBadge value={category.targetGroup} />
                      </TableCell>

                      {/* DESCRIPTION */}
                      <TableCell>
                        <Typography
                          sx={{
                            fontSize: 13,
                            color: '#475569',
                            maxWidth: 320,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {category.description || '—'}
                        </Typography>
                      </TableCell>

                      {/* PRODUCT COUNT */}
                      <TableCell>
                        <Typography
                          sx={{
                            fontSize: 13.5,
                            fontWeight: 700,
                            color: '#0F172A'
                          }}
                        >
                          {productCount ?? '—'}
                        </Typography>
                        {directCount > 0 && (
                          <Tooltip title="Danh mục cha không nên chứa sản phẩm trực tiếp. Hãy sửa từng sản phẩm và chọn danh mục con phù hợp.">
                            <Typography sx={{ fontSize: 12, color: '#B45309', fontWeight: 600, mt: 0.25, cursor: 'help' }}>
                              {directCount} chưa chuyển sang danh mục con
                            </Typography>
                          </Tooltip>
                        )}
                      </TableCell>

                      {/* STATUS */}
                      <TableCell>
                        <Stack
                          direction="row"
                          spacing={1.25}
                          sx={{ pt: 0.5, alignItems: 'center' }}
                        >
                          <Tooltip
                            title={
                              isActive
                                ? 'Nhấn để tắt danh mục'
                                : 'Nhấn để kích hoạt danh mục'
                            }
                          >
                            <Switch
                              size="small"
                              checked={isActive}
                              onChange={() => openStatusDialog(category)}
                              sx={{
                                width: 34,
                                height: 18,
                                p: 0,
                                '& .MuiSwitch-switchBase': {
                                  p: '2px',
                                  transitionDuration: '200ms',
                                  '&.Mui-checked': {
                                    transform: 'translateX(16px)',
                                    color: '#67E8F9',
                                    '& + .MuiSwitch-track': {
                                      bgcolor: '#BAF2F8',
                                      opacity: 1,
                                      border: 0
                                    }
                                  }
                                },
                                '& .MuiSwitch-thumb': {
                                  boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                                  width: 14,
                                  height: 14
                                },
                                '& .MuiSwitch-track': {
                                  borderRadius: 9,
                                  bgcolor: '#CBD5E1',
                                  opacity: 1
                                }
                              }}
                            />
                          </Tooltip>

                          <Box
                            sx={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              px: 1.5,
                              py: 0.35,
                              borderRadius: 1.75,
                              fontSize: 13,
                              fontWeight: 600,
                              bgcolor: isActive ? '#E7F6F1' : '#F0F2F4',
                              color: isActive ? '#168B70' : '#75869F'
                            }}
                          >
                            {isActive ? 'Hoạt động' : 'Đã ngưng'}
                          </Box>
                        </Stack>
                      </TableCell>

                      {/* ACTIONS */}
                      <TableCell align="center" sx={{ pr: 3 }}>
                        <Stack
                          direction="row"
                          spacing={0.5}
                          sx={{ alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Tooltip title="Xem chi tiết">
                            <IconButton
                              size="small"
                              onClick={() => setViewCategory(category)}
                              sx={{
                                color: '#64748B',
                                p: 0.75,
                                '&:hover': {
                                  color: '#0F172A',
                                  bgcolor: 'transparent'
                                }
                              }}
                            >
                              <EyeOutlined style={{ fontSize: 17 }} />
                            </IconButton>
                          </Tooltip>

                          <Tooltip title="Chỉnh sửa danh mục">
                            <IconButton
                              size="small"
                              onClick={() => openEditDialog(category)}
                              sx={{
                                color: '#64748B',
                                p: 0.75,
                                '&:hover': {
                                  color: '#0F172A',
                                  bgcolor: 'transparent'
                                }
                              }}
                            >
                              <EditOutlined style={{ fontSize: 17 }} />
                            </IconButton>
                          </Tooltip>

                          <Tooltip title="Tùy chọn khác">
                            <IconButton
                              size="small"
                              onClick={(event) =>
                                openActionMenu(event, category)
                              }
                              sx={{
                                color: '#64748B',
                                p: 0.75,
                                '&:hover': {
                                  color: '#0F172A',
                                  bgcolor: 'transparent'
                                }
                              }}
                            >
                              <EllipsisOutlined style={{ fontSize: 17 }} />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}

              {!loading && filteredCategories.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                    <Typography
                      sx={{
                        fontSize: 14,
                        fontWeight: 800,
                        color: '#0F172A'
                      }}
                    >
                      {categories.length === 0
                        ? 'Chưa có danh mục nào.'
                        : 'Không tìm thấy danh mục phù hợp.'}
                    </Typography>
                    <Typography sx={{ fontSize: 13, color: C.muted, mt: 0.5 }}>
                      Hãy thử tìm kiếm với từ khóa khác hoặc thêm danh mục mới.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Phân trang phía dưới */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr auto 1fr' },
            alignItems: 'center',
            gap: 1.5,
            px: 3,
            py: 2,
            borderTop: `1px solid ${C.borderLight}`
          }}
        >
          <Typography sx={{ fontSize: 13, color: C.muted, textAlign: { xs: 'center', sm: 'left' } }}>
            Hiển thị {filteredCategories.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0}–
            {Math.min(currentPage * PAGE_SIZE, filteredCategories.length)} / {filteredCategories.length} danh mục gốc
          </Typography>
          <Pagination
            count={pageCount}
            page={currentPage}
            onChange={(_, value) => setPage(value)}
            size="small"
            shape="rounded"
            sx={{
              justifySelf: 'center',
              '& .MuiPaginationItem-root': {
                minWidth: 26,
                height: 26,
                fontSize: 12.5,
                borderRadius: 1.5,
                transition: 'none',
                '&:hover': { bgcolor: '#F1F5F9' }
              },
              '& .MuiTouchRipple-root': { display: 'none' },
              '& .MuiPaginationItem-root.Mui-selected': {
                bgcolor: `${C.cyan} !important`,
                color: `${C.text} !important`,
                fontWeight: 700
              }
            }}
          />
        </Box>
      </Box>

      {/* ACTION MENU */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={closeActionMenu}
        PaperProps={{
          sx: { borderRadius: 3, boxShadow: '0 4px 16px rgba(0,0,0,0.08)', p: 0.5 }
        }}
      >
        <MenuItem
          onClick={() => {
            const selected = menuCategory;
            closeActionMenu();
            setViewCategory(selected);
          }}
          sx={{ fontSize: 13.5, fontWeight: 600, py: 1, borderRadius: 1.5 }}
        >
          <EyeOutlined style={{ marginRight: 10, color: C.muted }} />
          Xem chi tiết
        </MenuItem>

        <MenuItem
          onClick={() => {
            const selected = menuCategory;
            closeActionMenu();
            openEditDialog(selected);
          }}
          sx={{ fontSize: 13.5, fontWeight: 600, py: 1, borderRadius: 1.5 }}
        >
          <EditOutlined style={{ marginRight: 10, color: C.muted }} />
          Chỉnh sửa danh mục
        </MenuItem>

        {menuCategory && !menuCategory.parentId && menuCategory.status === 'ACTIVE' && (
          <MenuItem
            onClick={() => {
              const selected = menuCategory;
              closeActionMenu();
              openCreateDialog(selected);
            }}
            sx={{ fontSize: 13.5, fontWeight: 600, py: 1, borderRadius: 1.5 }}
          >
            <FolderAddOutlined style={{ marginRight: 10, color: C.muted }} />
            Thêm danh mục con
          </MenuItem>
        )}

        <MenuItem
          onClick={() => {
            const selected = menuCategory;
            closeActionMenu();
            openStatusDialog(selected);
          }}
          sx={{ fontSize: 13.5, fontWeight: 600, py: 1, borderRadius: 1.5, color: menuCategory?.status === 'ACTIVE' ? '#D97706' : '#059669' }}
        >
          <WarningOutlined style={{ marginRight: 10 }} />
          {menuCategory?.status === 'ACTIVE'
            ? 'Ngưng hoạt động'
            : 'Kích hoạt danh mục'}
        </MenuItem>
      </Menu>

      {/* VIEW CATEGORY DIALOG */}
      <Dialog
        open={Boolean(viewCategory)}
        onClose={() => setViewCategory(null)}
        fullWidth
        maxWidth="sm"
        PaperProps={{ sx: { borderRadius: 3.5, p: 1 } }}
      >
        <DialogTitle sx={{ fontWeight: 800, color: '#0F172A', fontSize: 18 }}>
          Chi tiết danh mục
        </DialogTitle>

        <DialogContent>
          {viewCategory && (
            <Stack spacing={2.5} sx={{ mt: 1 }}>
              <Box>
                <Typography sx={{ fontSize: 12, color: C.muted, fontWeight: 700, letterSpacing: 0.5 }}>
                  TÊN DANH MỤC
                </Typography>
                <Typography sx={{ fontWeight: 800, color: '#0F172A', fontSize: 16, mt: 0.5 }}>
                  {viewCategory.categoryName}
                </Typography>
              </Box>

              <Box>
                <Typography sx={{ fontSize: 12, color: C.muted, fontWeight: 700, letterSpacing: 0.5 }}>
                  MÔ TẢ
                </Typography>
                <Typography sx={{ fontSize: 14, color: '#334155', mt: 0.5, lineHeight: 1.6 }}>
                  {viewCategory.description || 'Chưa có mô tả'}
                </Typography>
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                <Box>
                  <Typography sx={{ fontSize: 12, color: C.muted, fontWeight: 700, letterSpacing: 0.5 }}>
                    DANH MỤC CHA
                  </Typography>
                  <Typography sx={{ fontSize: 14, color: '#334155', mt: 0.5, fontWeight: 600 }}>
                    {viewCategory.parentName || 'Danh mục gốc'}
                  </Typography>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: 12, color: C.muted, fontWeight: 700, letterSpacing: 0.5, mb: 0.75 }}>
                    ĐỐI TƯỢNG
                  </Typography>
                  <TargetBadge value={viewCategory.targetGroup} />
                </Box>
              </Box>

              {(childrenOf.get(viewCategory.categoryId) || []).length > 0 && (
                <Box>
                  <Typography sx={{ fontSize: 12, color: C.muted, fontWeight: 700, letterSpacing: 0.5, mb: 0.75 }}>
                    DANH MỤC CON
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {childrenOf.get(viewCategory.categoryId).map((child) => (
                      <Box
                        key={child.categoryId}
                        sx={badgeSx(
                          child.status === 'ACTIVE' ? '#F8FAFC' : '#F1F5F9',
                          child.status === 'ACTIVE' ? '#0F172A' : '#94A3B8',
                          C.border
                        )}
                      >
                        {child.categoryName}
                        {child.targetGroup ? ` · ${targetGroupLabel(child.targetGroup)}` : ''}
                        {child.status !== 'ACTIVE' ? ' (Đã ngưng)' : ''}
                      </Box>
                    ))}
                  </Box>
                </Box>
              )}

              <Box>
                <Typography sx={{ fontSize: 12, color: C.muted, fontWeight: 700, letterSpacing: 0.5 }}>
                  SỐ LƯỢNG SẢN PHẨM THUỘC DANH MỤC
                </Typography>
                <Typography sx={{ fontSize: 15, fontWeight: 800, color: '#0F172A', mt: 0.5 }}>
                  {getProductCount(viewCategory.categoryId) ?? '—'} sản phẩm
                </Typography>
              </Box>

              <Box>
                <Typography sx={{ fontSize: 12, color: C.muted, fontWeight: 700, letterSpacing: 0.5, mb: 0.75 }}>
                  TRẠNG THÁI
                </Typography>
                <Box
                  sx={
                    viewCategory.status === 'ACTIVE'
                      ? badgeSx('#F0FDF4', '#166534', '#BBF7D0')
                      : badgeSx('#F1F5F9', '#475569', '#E2E8F0')
                  }
                >
                  {viewCategory.status === 'ACTIVE' ? 'Đang hoạt động' : 'Đã ngưng hoạt động'}
                </Box>
              </Box>
            </Stack>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button
            onClick={() => setViewCategory(null)}
            sx={outlineButtonSx}
          >
            Đóng
          </Button>

          <Button
            onClick={() => {
              const selected = viewCategory;
              setViewCategory(null);
              openEditDialog(selected);
            }}
            sx={primaryButtonSx}
          >
            Chỉnh sửa danh mục
          </Button>
        </DialogActions>
      </Dialog>

      {/* ADD / EDIT CATEGORY DIALOG */}
      <Dialog
        open={Boolean(dialog)}
        onClose={closeDialog}
        fullWidth
        maxWidth="sm"
        PaperProps={{ sx: { borderRadius: 3.5, p: 1 } }}
      >
        <Box component="form" onSubmit={handleSubmit}>
          <DialogTitle sx={{ fontWeight: 800, color: '#0F172A', fontSize: 18 }}>
            {dialog?.mode === 'create'
              ? 'Thêm danh mục mới'
              : 'Chỉnh sửa danh mục'}
          </DialogTitle>

          <DialogContent>
            <Stack spacing={2.5} sx={{ mt: 1 }}>
              {formError && (
                <Alert severity="error" sx={{ borderRadius: 2.5, fontSize: 13, fontWeight: 600 }}>
                  {formError}
                </Alert>
              )}

              <Box>
                <Typography sx={{ fontSize: 13, fontWeight: 600, color: C.text, mb: 0.75 }}>
                  Tên danh mục <Box component="span" sx={{ color: C.error }}>*</Box>
                </Typography>
                <TextField
                  fullWidth
                  size="small"
                  required
                  placeholder="Nhập tên danh mục (Ví dụ: Áo sơ mi nam, Giày thể thao...)"
                  value={form.categoryName}
                  slotProps={{
                    htmlInput: {
                      maxLength: 100
                    }
                  }}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      categoryName: event.target.value
                    })
                  }
                  sx={inputSx(Boolean(formError && !form.categoryName))}
                />
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, color: C.text, mb: 0.75 }}>
                    Danh mục cha
                  </Typography>
                  <Select
                    fullWidth
                    size="small"
                    displayEmpty
                    value={form.parentId}
                    disabled={editingHasChildren}
                    onChange={(event) => changeHierarchy({ parentId: event.target.value })}
                    sx={selectSx}
                  >
                    <MenuItem value="">Không có (danh mục gốc)</MenuItem>
                    {parentOptions.map((item) => (
                      <MenuItem key={item.categoryId} value={String(item.categoryId)}>
                        {item.categoryName}
                        {item.status !== 'ACTIVE' ? ' (Đã ngưng)' : ''}
                      </MenuItem>
                    ))}
                  </Select>
                  <Typography sx={{ fontSize: 12, color: C.muted, mt: 0.75, lineHeight: 1.5 }}>
                    {editingHasChildren
                      ? 'Danh mục này đang có danh mục con nên luôn là danh mục gốc.'
                      : 'Ví dụ: "Giày nam" chọn danh mục cha là "Giày".'}
                  </Typography>
                </Box>

                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, color: C.text, mb: 0.75 }}>
                    Đối tượng
                  </Typography>
                  <Select
                    fullWidth
                    size="small"
                    displayEmpty
                    value={form.targetGroup}
                    onChange={(event) => changeHierarchy({ targetGroup: event.target.value })}
                    sx={selectSx}
                  >
                    <MenuItem value="">Không áp dụng</MenuItem>
                    {TARGET_GROUPS.map((item) => (
                      <MenuItem key={item.value} value={item.value}>
                        {item.label}
                      </MenuItem>
                    ))}
                  </Select>
                  <Typography sx={{ fontSize: 12, color: C.muted, mt: 0.75, lineHeight: 1.5 }}>
                    Dùng để lọc Nam / Nữ / Trẻ em trên cửa hàng.
                  </Typography>
                </Box>
              </Box>

              <Box>
                <Typography sx={{ fontSize: 13, fontWeight: 600, color: C.text, mb: 0.75 }}>
                  Mô tả danh mục
                </Typography>
                <TextField
                  fullWidth
                  multiline
                  rows={3}
                  placeholder="Mô tả tóm tắt về loại sản phẩm trong danh mục..."
                  value={form.description}
                  slotProps={{
                    htmlInput: {
                      maxLength: 255
                    }
                  }}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      description: event.target.value
                    })
                  }
                  sx={inputSx(false)}
                />
              </Box>
            </Stack>
          </DialogContent>

          <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
            <Button
              onClick={closeDialog}
              disabled={saving}
              sx={outlineButtonSx}
            >
              Hủy
            </Button>

            <Button
              type="submit"
              disabled={saving}
              sx={primaryButtonSx}
            >
              {saving
                ? 'Đang lưu...'
                : dialog?.mode === 'create'
                  ? 'Tạo danh mục'
                  : 'Lưu thay đổi'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      {/* CHANGE STATUS CONFIRMATION */}
      <Dialog
        open={Boolean(statusDialog)}
        onClose={() => {
          if (!changingStatus) {
            setStatusDialog(null);
          }
        }}
        fullWidth
        maxWidth="xs"
        PaperProps={{ sx: { borderRadius: 3.5, p: 1 } }}
      >
        <DialogTitle sx={{ fontWeight: 800, color: '#0F172A', fontSize: 18 }}>
          Xác nhận đổi trạng thái
        </DialogTitle>

        <DialogContent>
          <Typography sx={{ fontSize: 14, color: C.text, lineHeight: 1.6 }}>
            Bạn có chắc chắn muốn{' '}
            <strong>
              {statusDialog?.status === 'ACTIVE'
                ? 'ngưng hoạt động'
                : 'kích hoạt'}
            </strong>
            {' '}danh mục{' '}
            <strong>{statusDialog?.categoryName}</strong>?
          </Typography>

          {statusDialog?.status === 'ACTIVE' && (
            <Box
              sx={{
                bgcolor: '#FFFDE7',
                border: '1.5px solid #FDE047',
                borderRadius: 2.5,
                p: 2,
                mt: 2
              }}
            >
              <Typography sx={{ fontSize: 12.5, color: '#713F12', lineHeight: 1.6 }}>
                Danh mục này sẽ chuyển sang trạng thái ngưng. Các sản phẩm thuộc danh mục sẽ không bị xóa khỏi hệ thống.
              </Typography>
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button
            disabled={changingStatus}
            onClick={() => setStatusDialog(null)}
            sx={outlineButtonSx}
          >
            Hủy
          </Button>

          <Button
            disabled={changingStatus}
            onClick={handleChangeStatus}
            sx={{
              ...outlineButtonSx,
              border: 'none',
              bgcolor: statusDialog?.status === 'ACTIVE' ? '#FEF3C7' : C.cyan,
              color: statusDialog?.status === 'ACTIVE' ? '#92400E' : '#0F172A',
              fontWeight: 800,
              '&:hover': {
                bgcolor: statusDialog?.status === 'ACTIVE' ? '#FDE68A' : C.cyanHover
              }
            }}
          >
            {changingStatus ? 'Đang xử lý...' : 'Xác nhận'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
