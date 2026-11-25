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
  Grid,
  IconButton,
  InputAdornment,
  ListSubheader,
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
import { FilterResetButton, Pager } from 'features/account/components/Blocks';

import {
  AppstoreOutlined,
  CheckCircleOutlined,
  DownOutlined,
  EditOutlined,
  EllipsisOutlined,
  EyeOutlined,
  FolderAddOutlined,
  PlusOutlined,
  RightOutlined,
  SearchOutlined,
  SwapOutlined,
  TagsOutlined,
  WarningOutlined
} from '@ant-design/icons';

import {
  getCategories,
  createCategory,
  updateCategory,
  changeCategoryStatus,
  transferProducts,
  isAssignableCategory,
  TARGET_GROUPS,
  targetGroupLabel,
  isStandardTarget,
  sortCategoriesAsTree,
  descendantIds
} from 'services/categoryService';

import { C, cardSx, outlineButtonSx, primaryButtonSx } from '../shippingaddress/theme';

const PAGE_SIZE = 5;

const emptyForm = {
  categoryName: '',
  description: '',
  parentId: '',
  targetGroup: '',
  icon: ''
};

// Ô Đối tượng: mục "Khác…" để nhập tên đối tượng mới
const OTHER_TARGET = '__other__';

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

// (Bỏ icon danh mục - ô icon trong bảng, ô "Icon danh mục" trong form, CategoryIconPicker - 24/11/2026.
//  Cột category.icon ở DB / API vẫn giữ, giao diện không dùng nữa.)

// Đối tượng tự nhập (vd "Bé gái"): nhãn màu trung tính
const CUSTOM_TARGET_TONE = { bg: '#F8FAFC', color: '#475569', border: '#E2E8F0' };

// Gõ đúng nhãn chuẩn ("nữ", "Trẻ em") thì quy về mã chuẩn; còn lại giữ nguyên chữ đang gõ (kể cả khoảng trắng)
function toTargetValue(text) {
  if (!text) return '';
  const standard = TARGET_GROUPS.find(
    (item) => item.value === text || item.label.toLowerCase() === text.toLowerCase()
  );
  return standard ? standard.value : text;
}

function TargetBadge({ value }) {
  const label = targetGroupLabel(value);
  if (!label) {
    return <Typography sx={{ fontSize: 13, color: '#94A3B8' }}>—</Typography>;
  }
  const tone = TARGET_BADGE[value] || CUSTOM_TARGET_TONE;
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

  const [loading, setLoading] = useState(true);

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
  // Đang nhập đối tượng mới (đã chọn "Khác…")
  const [targetOther, setTargetOther] = useState(false);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [statusDialog, setStatusDialog] = useState(null);
  const [changingStatus, setChangingStatus] = useState(false);

  // Chuyển nhanh sản phẩm gắn trực tiếp sang danh mục lá: { category, targetCategoryId, error }
  const [transferDialog, setTransferDialog] = useState(null);
  const [transferring, setTransferring] = useState(false);

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

  // Số sản phẩm của từng danh mục do backend đếm sẵn (category.productCount),
  // không còn tải toàn bộ sản phẩm về máy để đếm.
  useEffect(() => {
    loadCategories();
  }, []);

  // ==========================================
  // REAL STATISTICS
  // ==========================================

  const activeCategories = useMemo(
    () => categories.filter((item) => item.status === 'ACTIVE').length,
    [categories]
  );

  // categoryId -> số sản phẩm gắn trực tiếp (backend đếm bằng SQL)
  const productCountMap = useMemo(() => {
    const counts = new Map();
    for (const item of categories) {
      counts.set(Number(item.categoryId), Number(item.productCount) || 0);
    }
    return counts;
  }, [categories]);

  // Tổng sản phẩm có danh mục = cộng số sản phẩm trực tiếp của mọi danh mục (mỗi sản phẩm thuộc đúng 1 danh mục)
  const categorizedProducts = useMemo(
    () => (loading ? null : categories.reduce((sum, item) => sum + (Number(item.productCount) || 0), 0)),
    [categories, loading]
  );

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
    if (loading) return null;
    return productCountMap.get(Number(categoryId)) || 0;
  }

  // Danh mục cha: cộng cả sản phẩm của các danh mục con, cháu…
  function getProductCount(categoryId) {
    if (loading) return null;
    return (childrenOf.get(categoryId) || []).reduce(
      (sum, child) => sum + (getProductCount(child.categoryId) || 0),
      getDirectProductCount(categoryId)
    );
  }

  // Cây đã sắp xếp (có depth + pathName "Giày › Giày nữ › Cao gót") cho ô chọn danh mục cha / xem chi tiết
  const treeCategories = useMemo(() => sortCategoriesAsTree(categories), [categories]);
  const pathNameOf = (categoryId) =>
    treeCategories.find((item) => item.categoryId === categoryId)?.pathName || '';

  // Đối tượng tự nhập đã lưu (lấy từ các danh mục): số danh mục đang dùng, dùng nhiều nhất trước
  const customTargetCount = useMemo(() => {
    const counts = new Map();
    for (const item of categories) {
      if (item.targetGroup && !isStandardTarget(item.targetGroup)) {
        counts.set(item.targetGroup, (counts.get(item.targetGroup) || 0) + 1);
      }
    }
    return counts;
  }, [categories]);
  const customTargets = useMemo(
    () =>
      [...customTargetCount.keys()].sort(
        (a, b) => customTargetCount.get(b) - customTargetCount.get(a) || a.localeCompare(b, 'vi')
      ),
    [customTargetCount]
  );

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

    // Một nút hiện khi chính nó khớp hoặc có con / cháu khớp (để biết con thuộc nhánh nào)
    const seen = new Set();
    const build = (category, depth) => {
      if (seen.has(category.categoryId)) return null;
      seen.add(category.categoryId);
      const children = (childrenOf.get(category.categoryId) || [])
        .map((child) => build(child, depth + 1))
        .filter(Boolean);
      const self = matches(category);
      if (!self && children.length === 0) return null;
      return { category: { ...category, depth, isChild: depth > 0, contextOnly: !self }, children };
    };

    const ids = new Set(categories.map((item) => item.categoryId));
    const groups = [];
    for (const root of categories) {
      // Danh mục con mất cha (không có trong danh sách) được coi như danh mục gốc
      if (root.parentId && ids.has(root.parentId)) continue;
      const node = build(root, 0);
      if (node) groups.push(node);
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

  // Các dòng hiển thị: duyệt cây, chỉ đi xuống nhánh đang mở (đang lọc thì mở hết)
  const paginatedCategories = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    const rows = [];
    const walk = (node) => {
      rows.push({ ...node.category, visibleChildren: node.children.length });
      if (isFiltering || expanded.has(node.category.categoryId)) node.children.forEach(walk);
    };
    filteredCategories.slice(start, start + PAGE_SIZE).forEach(walk);
    return rows;
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
    setTargetOther(false);
    setFormError('');
    setSuccess('');
    setDialog({ mode: 'create' });
  }

  function openEditDialog(category) {
    setForm({
      categoryName: category.categoryName,
      description: category.description || '',
      parentId: category.parentId ? String(category.parentId) : '',
      targetGroup: category.targetGroup || '',
      icon: category.icon || ''
    });
    setTargetOther(false);

    setFormError('');
    setSuccess('');

    setDialog({
      mode: 'edit',
      item: category
    });
  }

  // Danh mục cha hợp lệ: mọi cấp, trừ chính nó và con / cháu của nó (tránh vòng lặp);
  // đang hoạt động (giữ lại cha hiện tại dù đã ngưng)
  const editingId = dialog?.mode === 'edit' ? dialog.item.categoryId : null;
  const blockedParentIds = useMemo(
    () => (editingId ? new Set([editingId, ...descendantIds(categories, editingId)]) : new Set()),
    [categories, editingId]
  );
  const parentOptions = treeCategories.filter(
    (item) =>
      !blockedParentIds.has(item.categoryId) &&
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
      const parent = categories.find((item) => String(item.categoryId) === next.parentId);
      const canReplace =
        !typed ||
        typed === lastSuggestion.current ||
        rootCategories.some((item) => item.categoryName.trim().toLowerCase() === typed.toLowerCase());
      if (parent && canReplace) {
        const suffix = TARGET_SUFFIX[next.targetGroup] || next.targetGroup.trim().toLowerCase();
        const suggestion = suffix ? `${parent.categoryName} ${suffix}` : '';
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

    const targetGroup = toTargetValue(form.targetGroup.trim().replace(/\s+/g, ' '));
    if (targetGroup.length > 30) {
      setFormError('Đối tượng tự nhập tối đa 30 ký tự.');
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
        targetGroup,
        // Giữ icon cũ (nếu có) khi sửa, để API không xóa mất
        icon: form.icon
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
    setStatusDialog({ ...category, error: '' });
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
          ? `Đã kích hoạt danh mục "${category.categoryName}".`
          : `Đã ngưng hoạt động danh mục "${category.categoryName}".`
      );
      await loadCategories();
    } catch (e) {
      // Báo lỗi ngay trong hộp thoại (thông báo đầu trang bị hộp thoại che)
      setStatusDialog((current) =>
        current ? { ...current, error: e?.message || 'Không thể thay đổi trạng thái danh mục.' } : current
      );
    } finally {
      setChangingStatus(false);
    }
  }

  // Ràng buộc của danh mục đang mở trong hộp thoại đổi trạng thái (kiểm tra trước, khỏi đợi API báo 409)
  const isDeactivating = statusDialog?.status === 'ACTIVE';
  // Sản phẩm của danh mục + các danh mục con, cháu (sẽ bị ẩn khỏi gian hàng Online - ShopRepository chỉ lấy danh mục ACTIVE)
  const affectedProductCount = statusDialog ? getProductCount(statusDialog.categoryId) || 0 : 0;
  const statusDirectCount = statusDialog ? getDirectProductCount(statusDialog.categoryId) || 0 : 0;
  const activeChildrenCount = statusDialog
    ? (childrenOf.get(statusDialog.categoryId) || []).filter((c) => c.status === 'ACTIVE').length
    : 0;
  const statusParent = statusDialog?.parentId ? categories.find((c) => c.categoryId === statusDialog.parentId) : null;
  const isParentInactive = Boolean(statusDialog && !isDeactivating && statusParent && statusParent.status !== 'ACTIVE');
  const blockedByChildren = isDeactivating && activeChildrenCount > 0;
  const cannotConfirmStatus = blockedByChildren || isParentInactive;

  // ==========================================
  // TRANSFER PRODUCTS
  // ==========================================

  function openTransferDialog(category) {
    // Gợi ý sẵn danh mục con trực tiếp đầu tiên nhận được sản phẩm (đang hoạt động, không có con)
    const firstLeafChild = (childrenOf.get(category.categoryId) || []).find(isAssignableCategory);
    setTransferDialog({
      category,
      targetCategoryId: firstLeafChild ? String(firstLeafChild.categoryId) : '',
      error: ''
    });
  }

  async function handleTransferProducts() {
    if (!transferDialog?.category || !transferDialog.targetCategoryId || transferring) return;

    setTransferring(true);
    setError('');
    setSuccess('');

    try {
      const res = await transferProducts(transferDialog.category.categoryId, transferDialog.targetCategoryId);
      const targetName =
        res?.targetCategoryName ||
        categories.find((c) => String(c.categoryId) === String(transferDialog.targetCategoryId))?.categoryName ||
        '';
      setTransferDialog(null);
      setSuccess(`Đã chuyển ${res?.movedCount ?? ''} sản phẩm sang danh mục "${targetName}".`);
      await loadCategories();
    } catch (e) {
      // Báo lỗi ngay trong hộp thoại để người dùng chọn lại danh mục đích
      setTransferDialog((current) =>
        current ? { ...current, error: e?.message || 'Không thể chuyển sản phẩm sang danh mục khác.' } : current
      );
    } finally {
      setTransferring(false);
    }
  }

  // Danh mục đích chọn được: danh mục lá đang hoạt động, khác danh mục nguồn
  const transferTargets = transferDialog
    ? treeCategories.filter((c) => isAssignableCategory(c) && c.categoryId !== transferDialog.category.categoryId)
    : [];
  const transferDescendants = transferDialog ? descendantIds(categories, transferDialog.category.categoryId) : new Set();

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
              loading
                ? 'Đang kết nối dữ liệu'
                : 'Tổng số sản phẩm có danh mục'
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
            {customTargets.map((value) => (
              <MenuItem key={value} value={value}>
                {value}
              </MenuItem>
            ))}
            <MenuItem value="NONE">Không áp dụng</MenuItem>
          </Select>
        </Box>

        <FilterResetButton
          onClick={() => {
            setSearch('');
            setStatusFilter('ALL');
            setTargetFilter('ALL');
            setPage(1);
          }}
        />
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
                <TableCell sx={{ pl: 3, minWidth: 260 }}>TÊN DANH MỤC</TableCell>
                <TableCell sx={{ minWidth: 120 }}>ĐỐI TƯỢNG</TableCell>
                <TableCell>MÔ TẢ</TableCell>
                <TableCell sx={{ minWidth: 140 }}>SỐ SẢN PHẨM</TableCell>
                <TableCell sx={{ minWidth: 130 }}>TRẠNG THÁI</TableCell>
                <TableCell align="center" sx={{ pr: 3, minWidth: 130 }}>THAO TÁC</TableCell>
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
                  const canToggle = category.visibleChildren > 0;
                  const open = canToggle && isExpanded(category.categoryId);
                  // Danh mục cha vẫn còn sản phẩm gắn trực tiếp -> nhắc chuyển sang danh mục con
                  const directCount = isParent ? getDirectProductCount(category.categoryId) : 0;

                  return (
                    <TableRow
                      key={category.categoryId}
                      hover
                      sx={{
                        // Cha đang mở: nền xanh nhạt + vạch trái (chỉ cấp gốc); con: nền xám rất nhạt
                        bgcolor: category.isChild ? (open ? '#F3FAFC' : '#FAFBFC') : open ? '#F5FDFE' : '#FFFFFF',
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
                          spacing={1.25}
                          // Mỗi cấp thụt vào 28px; ô mũi tên luôn chiếm chỗ để các cấp thẳng hàng
                          sx={{ alignItems: 'center', ml: `${(category.depth || 0) * 28}px` }}
                        >
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
                          <Box>
                            <Typography
                              sx={{
                                fontSize: category.isChild ? 13 : 14,
                                fontWeight: category.isChild ? (canToggle ? 600 : 500) : 700,
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
                        {/* Chưa gắn đối tượng thì để trống */}
                        {category.targetGroup && <TargetBadge value={category.targetGroup} />}
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
                          {category.description || ''}
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
                          <Tooltip title="Danh mục cha không nên chứa sản phẩm trực tiếp. Nhấn để chuyển nhanh các sản phẩm này sang danh mục con.">
                            <Typography
                              role="button"
                              tabIndex={0}
                              onClick={() => openTransferDialog(category)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  openTransferDialog(category);
                                }
                              }}
                              sx={{
                                fontSize: 12,
                                color: '#B45309',
                                fontWeight: 600,
                                mt: 0.25,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 0.5,
                                '&:hover': { textDecoration: 'underline', color: '#92400E' }
                              }}
                            >
                              <SwapOutlined style={{ fontSize: 11 }} />
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

                          {/* Menu 3 chấm chỉ còn thao tác riêng (thêm danh mục con / chuyển sản phẩm); không có thì ẩn */}
                          {(isActive || (getDirectProductCount(category.categoryId) || 0) > 0) && (
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
                          )}
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

        {/* Phân trang phía dưới (component chung của nhóm) */}
        <Pager
          page={currentPage - 1}
          totalPages={pageCount}
          total={filteredCategories.length}
          size={PAGE_SIZE}
          noun="danh mục gốc"
          onPage={(p) => setPage(p + 1)}
          sx={{ borderTop: `1px solid ${C.borderLight}` }}
        />
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
        {/* Xem chi tiết / Chỉnh sửa đã có nút ở cột Thao tác, Ngưng / Kích hoạt đã có công tắc ở cột Trạng thái */}
        {menuCategory && menuCategory.status === 'ACTIVE' && (
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

        {menuCategory && (getDirectProductCount(menuCategory.categoryId) || 0) > 0 && (
          <MenuItem
            onClick={() => {
              const selected = menuCategory;
              closeActionMenu();
              openTransferDialog(selected);
            }}
            sx={{ fontSize: 13.5, fontWeight: 600, py: 1, borderRadius: 1.5 }}
          >
            <SwapOutlined style={{ marginRight: 10, color: C.muted }} />
            Chuyển sản phẩm sang danh mục khác
          </MenuItem>
        )}

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
                    {viewCategory.parentId ? pathNameOf(viewCategory.parentId) || viewCategory.parentName : 'Danh mục gốc'}
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
                    onChange={(event) => changeHierarchy({ parentId: event.target.value })}
                    // Ô đã chọn hiện đường dẫn đầy đủ, vd "Giày › Giày nữ"
                    renderValue={(value) =>
                      value ? pathNameOf(Number(value)) : 'Không có (danh mục gốc)'
                    }
                    MenuProps={{ slotProps: { paper: { sx: { maxHeight: 320 } } } }}
                    sx={selectSx}
                  >
                    <MenuItem value="">Không có (danh mục gốc)</MenuItem>
                    {parentOptions.map((item) => (
                      <MenuItem
                        key={item.categoryId}
                        value={String(item.categoryId)}
                        // Thụt theo cấp để thấy cây ngay trong danh sách
                        sx={{ pl: 2 + item.depth * 2, fontWeight: item.depth === 0 ? 600 : 400, fontSize: 13.5 }}
                      >
                        {item.depth > 0 && (
                          <Box component="span" sx={{ color: '#CBD5E1', mr: 1 }}>
                            └
                          </Box>
                        )}
                        {item.categoryName}
                        {item.status !== 'ACTIVE' ? ' (Đã ngưng)' : ''}
                      </MenuItem>
                    ))}
                  </Select>
                  <Typography sx={{ fontSize: 12, color: C.muted, mt: 0.75, lineHeight: 1.5 }}>
                    Chọn được cả danh mục con, ví dụ &quot;Cao gót&quot; chọn cha là &quot;Giày nữ&quot;.
                  </Typography>
                </Box>

                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, color: C.text, mb: 0.75 }}>
                    Đối tượng
                  </Typography>
                  {/* Chọn đối tượng có sẵn / đã lưu, hoặc "Khác…" để nhập tên mới */}
                  <Select
                    fullWidth
                    size="small"
                    displayEmpty
                    value={targetOther ? OTHER_TARGET : form.targetGroup}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value === OTHER_TARGET) {
                        setTargetOther(true);
                        changeHierarchy({ targetGroup: '' });
                      } else {
                        setTargetOther(false);
                        changeHierarchy({ targetGroup: value });
                      }
                    }}
                    renderValue={(value) =>
                      value === OTHER_TARGET ? 'Khác (nhập tên mới)' : targetGroupLabel(value) || 'Không áp dụng'
                    }
                    // Nhiều đối tượng đã lưu thì danh sách cuộn trong khung
                    MenuProps={{ slotProps: { paper: { sx: { maxHeight: 340 } } } }}
                    sx={selectSx}
                  >
                    <MenuItem value="">Không áp dụng</MenuItem>
                    {TARGET_GROUPS.map((item) => (
                      <MenuItem key={item.value} value={item.value}>
                        {item.label}
                      </MenuItem>
                    ))}
                    {customTargets.length > 0 && (
                      <ListSubheader sx={{ fontSize: 11.5, fontWeight: 800, lineHeight: '32px', color: C.muted }}>
                        ĐÃ LƯU ({customTargets.length})
                      </ListSubheader>
                    )}
                    {customTargets.map((value) => (
                      <MenuItem key={value} value={value} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                        <span>{value}</span>
                        <Box component="span" sx={{ fontSize: 11.5, color: C.muted }}>
                          {customTargetCount.get(value)} danh mục
                        </Box>
                      </MenuItem>
                    ))}
                    <MenuItem value={OTHER_TARGET} sx={{ color: '#0E7490', fontWeight: 600, borderTop: `1px solid ${C.borderLight}` }}>
                      + Khác (nhập tên mới)…
                    </MenuItem>
                  </Select>
                  {targetOther && (
                    <TextField
                      fullWidth
                      size="small"
                      autoFocus
                      autoComplete="off"
                      placeholder="Nhập đối tượng mới, ví dụ: Bé gái"
                      value={form.targetGroup}
                      onChange={(event) => changeHierarchy({ targetGroup: event.target.value })}
                      slotProps={{ htmlInput: { maxLength: 30, name: 'category-target-new', autoComplete: 'off' } }}
                      sx={{ ...inputSx(false), mt: 1 }}
                    />
                  )}
                  <Typography sx={{ fontSize: 12, color: C.muted, mt: 0.75, lineHeight: 1.5 }}>
                    {targetOther
                      ? 'Tối đa 30 ký tự. Lưu danh mục xong, đối tượng này có trong mục "Đã lưu" để lần sau chọn lại.'
                      : 'Dùng để lọc theo đối tượng trên cửa hàng. Chọn "Khác…" để thêm đối tượng mới.'}
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
          {statusDialog && (
            <Stack spacing={2} sx={{ mt: 0.5 }}>
              {statusDialog.error && (
                <Alert severity="error" sx={{ borderRadius: 2.5 }}>
                  {statusDialog.error}
                </Alert>
              )}

              <Typography sx={{ fontSize: 14, color: C.text, lineHeight: 1.6 }}>
                Bạn có chắc chắn muốn <strong>{isDeactivating ? 'ngưng hoạt động' : 'kích hoạt'}</strong> danh mục{' '}
                <strong>{statusDialog.categoryName}</strong>?
              </Typography>

              {/* Chặn: còn danh mục con đang hoạt động (backend cũng chặn - 409 CATEGORY_HAS_ACTIVE_CHILDREN) */}
              {blockedByChildren && (
                <Box sx={{ bgcolor: '#FEF2F2', border: '1.5px solid #FCA5A5', borderRadius: 2.5, p: 2 }}>
                  <Typography sx={{ fontSize: 13, color: '#991B1B', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <WarningOutlined style={{ color: '#DC2626' }} /> Chưa thể ngưng hoạt động
                  </Typography>
                  <Typography sx={{ fontSize: 12.5, color: '#B91C1C', mt: 0.5, lineHeight: 1.6 }}>
                    Danh mục này còn <strong>{activeChildrenCount} danh mục con</strong> đang hoạt động. Hãy ngưng các danh
                    mục con trước.
                  </Typography>
                </Box>
              )}

              {/* Ngưng danh mục đang có sản phẩm: sản phẩm bị ẩn khỏi gian hàng Online */}
              {isDeactivating && !blockedByChildren && affectedProductCount > 0 && (
                <Box sx={{ bgcolor: '#FFFBEB', border: '1.5px solid #FCD34D', borderRadius: 2.5, p: 2 }}>
                  <Typography sx={{ fontSize: 13, color: '#92400E', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <WarningOutlined style={{ color: '#D97706' }} /> Ảnh hưởng đến bán hàng
                  </Typography>
                  <Typography sx={{ fontSize: 12.5, color: '#78350F', mt: 0.5, lineHeight: 1.6 }}>
                    Danh mục này đang có <strong>{affectedProductCount} sản phẩm</strong>. Khi ngưng hoạt động:
                  </Typography>
                  <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5, fontSize: 12.5, color: '#78350F', lineHeight: 1.6 }}>
                    <li>
                      Các sản phẩm này sẽ <strong>bị ẩn khỏi gian hàng Online</strong> ngay lập tức.
                    </li>
                    <li>Không chọn được danh mục này khi thêm sản phẩm hoặc chuyển sản phẩm sang.</li>
                    <li>Sản phẩm không bị xóa; kích hoạt lại danh mục thì hiện lại như cũ.</li>
                  </Box>
                  {statusDirectCount > 0 && (
                    <Button
                      size="small"
                      color="inherit"
                      startIcon={<SwapOutlined />}
                      disabled={changingStatus}
                      onClick={() => {
                        const selected = statusDialog;
                        setStatusDialog(null);
                        openTransferDialog(selected);
                      }}
                      sx={{ mt: 1, px: 1, fontSize: 12.5, fontWeight: 700, color: '#B45309', textTransform: 'none' }}
                    >
                      Chuyển {statusDirectCount} sản phẩm sang danh mục khác trước
                    </Button>
                  )}
                </Box>
              )}

              {/* Ngưng danh mục chưa có sản phẩm */}
              {isDeactivating && !blockedByChildren && affectedProductCount === 0 && (
                <Box sx={{ bgcolor: '#FFFDE7', border: '1.5px solid #FDE047', borderRadius: 2.5, p: 2 }}>
                  <Typography sx={{ fontSize: 12.5, color: '#713F12', lineHeight: 1.6 }}>
                    Danh mục này chưa có sản phẩm. Khi ngưng, danh mục sẽ không còn hiện trong các ô chọn danh mục.
                  </Typography>
                </Box>
              )}

              {/* Chặn: danh mục cha đang ngưng (backend cũng chặn - 409 PARENT_CATEGORY_INACTIVE) */}
              {isParentInactive && (
                <Box sx={{ bgcolor: '#FEF2F2', border: '1.5px solid #FCA5A5', borderRadius: 2.5, p: 2 }}>
                  <Typography sx={{ fontSize: 13, color: '#991B1B', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <WarningOutlined style={{ color: '#DC2626' }} /> Chưa thể kích hoạt
                  </Typography>
                  <Typography sx={{ fontSize: 12.5, color: '#B91C1C', mt: 0.5, lineHeight: 1.6 }}>
                    Danh mục cha <strong>"{statusParent?.categoryName}"</strong> đang ngưng hoạt động. Hãy kích hoạt danh
                    mục cha trước.
                  </Typography>
                </Box>
              )}

              {/* Kích hoạt hợp lệ */}
              {!isDeactivating && !isParentInactive && (
                <Box sx={{ bgcolor: '#F0FDF4', border: '1.5px solid #BBF7D0', borderRadius: 2.5, p: 2 }}>
                  <Typography sx={{ fontSize: 12.5, color: '#166534', lineHeight: 1.6 }}>
                    {affectedProductCount > 0
                      ? `${affectedProductCount} sản phẩm của danh mục sẽ hiện lại trên gian hàng Online và danh mục chọn được khi thêm sản phẩm.`
                      : 'Danh mục sẽ hoạt động trở lại và chọn được khi thêm sản phẩm.'}
                  </Typography>
                </Box>
              )}
            </Stack>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button
            disabled={changingStatus}
            onClick={() => setStatusDialog(null)}
            sx={outlineButtonSx}
          >
            {cannotConfirmStatus ? 'Đóng' : 'Hủy'}
          </Button>

          <Button
            disabled={changingStatus || cannotConfirmStatus}
            onClick={handleChangeStatus}
            sx={{
              ...outlineButtonSx,
              border: 'none',
              bgcolor: isDeactivating ? '#FEF3C7' : C.cyan,
              color: isDeactivating ? '#92400E' : '#0F172A',
              fontWeight: 800,
              '&:hover': {
                bgcolor: isDeactivating ? '#FDE68A' : C.cyanHover
              },
              '&.Mui-disabled': { bgcolor: '#F1F5F9', color: '#94A3B8' }
            }}
          >
            {changingStatus ? 'Đang xử lý...' : isDeactivating ? 'Ngưng hoạt động' : 'Kích hoạt'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* TRANSFER PRODUCTS DIALOG */}
      <Dialog
        open={Boolean(transferDialog)}
        onClose={() => {
          if (!transferring) setTransferDialog(null);
        }}
        fullWidth
        maxWidth="sm"
        PaperProps={{ sx: { borderRadius: 3.5, p: 1 } }}
      >
        <DialogTitle sx={{ fontWeight: 800, color: '#0F172A', fontSize: 18 }}>
          Chuyển sản phẩm sang danh mục khác
        </DialogTitle>

        <DialogContent>
          {transferDialog && (
            <Stack spacing={2.5} sx={{ mt: 1 }}>
              {transferDialog.error && (
                <Alert severity="error" sx={{ borderRadius: 2.5 }}>
                  {transferDialog.error}
                </Alert>
              )}

              <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: C.surface, border: `1px solid ${C.border}` }}>
                <Typography sx={{ fontSize: 13, color: C.muted, fontWeight: 600 }}>Danh mục nguồn</Typography>
                <Typography sx={{ fontSize: 15, fontWeight: 800, color: '#0F172A', mt: 0.25 }}>
                  {pathNameOf(transferDialog.category.categoryId) || transferDialog.category.categoryName}
                </Typography>
                <Typography sx={{ fontSize: 13, color: '#B45309', fontWeight: 600, mt: 0.5 }}>
                  Đang có {getDirectProductCount(transferDialog.category.categoryId) || 0} sản phẩm gắn trực tiếp.
                </Typography>
              </Box>

              <Box>
                <Typography sx={{ fontSize: 13, fontWeight: 600, color: C.text, mb: 0.75 }}>
                  Danh mục nhận sản phẩm{' '}
                  <Box component="span" sx={{ color: C.error }}>
                    *
                  </Box>
                </Typography>
                <TextField
                  select
                  fullWidth
                  size="small"
                  disabled={transferring}
                  value={transferDialog.targetCategoryId}
                  onChange={(e) => setTransferDialog({ ...transferDialog, targetCategoryId: e.target.value, error: '' })}
                  SelectProps={{
                    displayEmpty: true,
                    renderValue: (value) => {
                      if (!value) return <Box component="span" sx={{ color: C.muted }}>Chọn danh mục con (danh mục lá)</Box>;
                      return pathNameOf(Number(value)) || value;
                    }
                  }}
                  sx={inputSx(false)}
                >
                  {transferTargets.length === 0 && (
                    <MenuItem value="" disabled>
                      Chưa có danh mục lá nào đang hoạt động
                    </MenuItem>
                  )}
                  {transferTargets.map((c) => (
                    <MenuItem key={c.categoryId} value={String(c.categoryId)} sx={{ fontSize: 13.5 }}>
                      <Box sx={{ pl: (c.depth || 0) * 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                        {c.pathName}
                        {transferDescendants.has(c.categoryId) && (
                          <Box component="span" sx={badgeSx('#E0F2FE', '#0369A1', '#BAE6FD')}>
                            Danh mục con
                          </Box>
                        )}
                      </Box>
                    </MenuItem>
                  ))}
                </TextField>
                <Typography sx={{ fontSize: 12, color: C.muted, mt: 0.75 }}>
                  Chỉ chọn được danh mục đang hoạt động và không có danh mục con.
                </Typography>
              </Box>

              <Box sx={{ bgcolor: '#FFFDE7', border: '1.5px solid #FDE047', borderRadius: 2.5, p: 2 }}>
                <Typography sx={{ fontSize: 12.5, color: '#713F12', lineHeight: 1.6 }}>
                  Toàn bộ sản phẩm gắn trực tiếp vào danh mục nguồn sẽ được chuyển sang danh mục đã chọn ngay lập tức.
                </Typography>
              </Box>
            </Stack>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button disabled={transferring} onClick={() => setTransferDialog(null)} sx={outlineButtonSx}>
            Hủy
          </Button>
          <Button
            disabled={transferring || !transferDialog?.targetCategoryId}
            onClick={handleTransferProducts}
            sx={{
              ...outlineButtonSx,
              border: 'none',
              bgcolor: C.cyan,
              color: '#0F172A',
              fontWeight: 800,
              '&:hover': { bgcolor: C.cyanHover }
            }}
          >
            {transferring ? 'Đang chuyển...' : 'Xác nhận chuyển'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
