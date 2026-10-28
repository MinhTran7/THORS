
import { useEffect, useMemo, useState } from 'react';

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
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
  Pagination,
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

import {
  AppstoreOutlined,
  CheckCircleOutlined,
  EditOutlined,
  EllipsisOutlined,
  EyeOutlined,
  InfoCircleOutlined,
  PlusOutlined,
  SearchOutlined,
  TagsOutlined,
  WarningOutlined
} from '@ant-design/icons';

import {
  getCategories,
  createCategory,
  updateCategory,
  changeCategoryStatus
} from 'services/categoryService';

import { getProducts } from 'services/productService';

const COLORS = {
  text: '#202D42',
  muted: '#75869F',
  border: '#E5EBF2',
  cyan: '#8DE9F2',
  cyanLight: '#EAFBFD',
  yellowLight: '#FFFBE7',
  green: '#25856A'
};

const PAGE_SIZE = 5;

const emptyForm = {
  categoryName: '',
  description: ''
};

const cardSx = {
  border: `1px solid ${COLORS.border}`,
  borderRadius: 2,
  boxShadow: 'none',
  bgcolor: '#FFFFFF'
};

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
        bgcolor: highlight
          ? COLORS.yellowLight
          : '#FFFFFF'
      }}
    >
      <CardContent
        sx={{
          p: 2.5,
          '&:last-child': { pb: 2.5 }
        }}
      >
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
        >
          <Typography
            fontSize={12}
            color={COLORS.muted}
          >
            {label}
          </Typography>

          <Box sx={{ color: COLORS.text }}>
            {icon}
          </Box>
        </Stack>

        <Typography
          sx={{
            fontSize: 29,
            fontWeight: 500,
            color: COLORS.text,
            mt: 1
          }}
        >
          {value}
        </Typography>

        <Typography
          fontSize={11}
          color={COLORS.muted}
          sx={{ mt: 0.5 }}
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
  const [productsLoaded, setProductsLoaded] =
    useState(false);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] =
    useState('ALL');
  const [page, setPage] = useState(1);

  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [statusDialog, setStatusDialog] =
    useState(null);
  const [changingStatus, setChangingStatus] =
    useState(false);

  const [viewCategory, setViewCategory] =
    useState(null);

  const [menuAnchor, setMenuAnchor] =
    useState(null);
  const [menuCategory, setMenuCategory] =
    useState(null);

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
      setError(
        e?.message || 'Unable to load categories.'
      );
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function loadProducts() {
    try {
      const data = await getProducts();

      if (!Array.isArray(data)) {
        throw new Error('Invalid product response.');
      }

      setProducts(data);
      setProductsLoaded(true);
    } catch (e) {
      console.error('Unable to load product counts:', e);
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
    () =>
      categories.filter(
        (item) => item.status === 'ACTIVE'
      ).length,
    [categories]
  );

  const productCountMap = useMemo(() => {
    const counts = new Map();

    for (const product of products) {
      const categoryId = Number(product.categoryId);

      counts.set(
        categoryId,
        (counts.get(categoryId) || 0) + 1
      );
    }

    return counts;
  }, [products]);

  const categorizedProducts = productsLoaded
    ? products.length
    : null;

  function getProductCount(categoryId) {
    if (!productsLoaded) return null;

    return productCountMap.get(
      Number(categoryId)
    ) || 0;
  }

  // ==========================================
  // SEARCH / FILTER / PAGINATION
  // ==========================================

  const filteredCategories = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return categories.filter((category) => {
      const name = (
        category.categoryName || ''
      ).toLowerCase();

      const description = (
        category.description || ''
      ).toLowerCase();

      const matchesSearch =
        name.includes(keyword) ||
        description.includes(keyword);

      const matchesStatus =
        statusFilter === 'ALL' ||
        category.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [categories, search, statusFilter]);

  const pageCount = Math.max(
    1,
    Math.ceil(filteredCategories.length / PAGE_SIZE)
  );

  const currentPage = Math.min(page, pageCount);

  const paginatedCategories = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;

    return filteredCategories.slice(
      start,
      start + PAGE_SIZE
    );
  }, [filteredCategories, currentPage]);

  const showingFrom = filteredCategories.length
    ? (currentPage - 1) * PAGE_SIZE + 1
    : 0;

  const showingTo = Math.min(
    currentPage * PAGE_SIZE,
    filteredCategories.length
  );

  function handleSearchChange(value) {
    setSearch(value);
    setPage(1);
  }

  function handleFilterChange(value) {
    setStatusFilter(value);
    setPage(1);
  }

  // ==========================================
  // CREATE / EDIT DIALOG
  // ==========================================

  function openCreateDialog() {
    setForm({ ...emptyForm });
    setFormError('');
    setSuccess('');
    setDialog({ mode: 'create' });
  }

  function openEditDialog(category) {
    setForm({
      categoryName: category.categoryName,
      description: category.description || ''
    });

    setFormError('');
    setSuccess('');

    setDialog({
      mode: 'edit',
      item: category
    });
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
      setFormError('Category name is required.');
      return;
    }

    if (categoryName.length > 100) {
      setFormError(
        'Category name must not exceed 100 characters.'
      );
      return;
    }

    if (description.length > 255) {
      setFormError(
        'Description must not exceed 255 characters.'
      );
      return;
    }

    const isCreate = dialog.mode === 'create';

    setSaving(true);
    setFormError('');
    setError('');

    try {
      const data = {
        categoryName,
        description
      };

      if (isCreate) {
        await createCategory(data);
      } else {
        await updateCategory(
          dialog.item.categoryId,
          data
        );
      }

      setDialog(null);

      setSuccess(
        isCreate
          ? 'Category created successfully.'
          : 'Category updated successfully.'
      );

      await loadCategories();
    } catch (e) {
      setFormError(
        e?.message || 'Unable to save category.'
      );
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

    const newStatus =
      category.status === 'ACTIVE'
        ? 'INACTIVE'
        : 'ACTIVE';

    setChangingStatus(true);
    setError('');
    setSuccess('');

    try {
      await changeCategoryStatus(
        category.categoryId,
        newStatus
      );

      setStatusDialog(null);

      setSuccess(
        newStatus === 'ACTIVE'
          ? 'Category activated successfully.'
          : 'Category deactivated successfully.'
      );

      await loadCategories();
    } catch (e) {
      setError(
        e?.message ||
          'Unable to change category status.'
      );
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
    <Box sx={{ maxWidth: 1440, mx: 'auto' }}>

      {/* PAGE HEADER */}

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{
          xs: 'flex-start',
          sm: 'center'
        }}
        spacing={2}
        sx={{ mb: 3 }}
      >
        <Box>
          <Typography
            sx={{
              fontSize: { xs: 24, md: 29 },
              fontWeight: 500,
              color: COLORS.text
            }}
          >
            Category List
          </Typography>

          <Typography
            fontSize={12}
            color={COLORS.muted}
            sx={{ mt: 0.5 }}
          >
            Make your inventory easy to browse
            with clear, considered categories.
          </Typography>
        </Box>

        <Button
          variant="contained"
          startIcon={<PlusOutlined />}
          onClick={openCreateDialog}
          sx={{
            bgcolor: COLORS.cyan,
            color: COLORS.text,
            textTransform: 'none',
            fontWeight: 600,
            boxShadow: 'none',
            '&:hover': {
              bgcolor: '#6DDDE9',
              boxShadow: 'none'
            }
          }}
        >
          Add Category
        </Button>
      </Stack>

      {/* MESSAGES */}

      {error && (
        <Alert
          severity="error"
          onClose={() => setError('')}
          sx={{ mb: 2 }}
        >
          {error}
        </Alert>
      )}

      {success && (
        <Alert
          severity="success"
          onClose={() => setSuccess('')}
          sx={{ mb: 2 }}
        >
          {success}
        </Alert>
      )}

      {/* STATISTICS */}

      <Grid container spacing={2} sx={{ mb: 2.5 }}>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <StatisticCard
            label="Total categories"
            value={loading ? '—' : categories.length}
            note="A simple structure for your store"
            icon={<TagsOutlined />}
          />
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <StatisticCard
            label="Active categories"
            value={loading ? '—' : activeCategories}
            note="Currently active in your store"
            icon={<CheckCircleOutlined />}
          />
        </Grid>

        <Grid size={{ xs: 12, sm: 12, md: 4 }}>
          <StatisticCard
            label="Categorized products"
            value={
              categorizedProducts === null
                ? '—'
                : categorizedProducts
            }
            note={
              productsLoaded
                ? 'Products assigned to categories'
                : 'Product statistics unavailable'
            }
            icon={<AppstoreOutlined />}
            highlight
          />
        </Grid>
      </Grid>

      {/* SEARCH AND FILTER */}

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        sx={{ mb: 2 }}
      >
        <TextField
          fullWidth
          size="small"
          value={search}
          onChange={(event) =>
            handleSearchChange(event.target.value)
          }
          placeholder="Search category names or descriptions"
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlined />
                </InputAdornment>
              )
            }
          }}
          sx={{
            bgcolor: '#FFFFFF',
            '& .MuiOutlinedInput-root': {
              borderRadius: 1.5
            }
          }}
        />

        <Select
          size="small"
          value={statusFilter}
          onChange={(event) =>
            handleFilterChange(event.target.value)
          }
          sx={{
            minWidth: 155,
            bgcolor: '#FFFFFF',
            borderRadius: 1.5,
            fontSize: 12
          }}
        >
          <MenuItem value="ALL">
            All statuses
          </MenuItem>

          <MenuItem value="ACTIVE">
            Active
          </MenuItem>

          <MenuItem value="INACTIVE">
            Disabled
          </MenuItem>
        </Select>
      </Stack>

      {/* CATEGORY TABLE */}

      <Card sx={cardSx}>
        <TableContainer>
          <Table
            sx={{
              minWidth: 750,
              '& .MuiTableCell-root': {
                borderColor: COLORS.border
              }
            }}
          >
            <TableHead>
              <TableRow
                sx={{ bgcolor: '#F7F9FC' }}
              >
                {[
                  'Category Name',
                  'Description',
                  'Product Count',
                  'Status',
                  'Actions'
                ].map((label) => (
                  <TableCell
                    key={label}
                    sx={{
                      fontSize: 11,
                      color: COLORS.muted,
                      fontWeight: 600,
                      py: 1.75
                    }}
                  >
                    {label}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>

            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    align="center"
                    sx={{ py: 5 }}
                  >
                    <CircularProgress size={26} />
                  </TableCell>
                </TableRow>
              )}

              {!loading &&
                paginatedCategories.map((category) => {
                  const isActive =
                    category.status === 'ACTIVE';

                  const productCount = getProductCount(
                    category.categoryId
                  );

                  return (
                    <TableRow
                      key={category.categoryId}
                      hover
                      sx={{
                        '&:last-child td': {
                          borderBottom: 0
                        }
                      }}
                    >
                      {/* CATEGORY NAME */}

                      <TableCell sx={{ py: 1.75 }}>
                        <Stack
                          direction="row"
                          spacing={1.5}
                          alignItems="center"
                        >
                          <Box
                            sx={{
                              width: 34,
                              height: 34,
                              bgcolor: COLORS.yellowLight,
                              borderRadius: 1.5,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: COLORS.text,
                              flexShrink: 0
                            }}
                          >
                            <TagsOutlined />
                          </Box>

                          <Typography
                            fontSize={12}
                            fontWeight={600}
                            color={COLORS.text}
                          >
                            {category.categoryName}
                          </Typography>
                        </Stack>
                      </TableCell>

                      {/* DESCRIPTION */}

                      <TableCell>
                        <Typography
                          fontSize={11}
                          color={COLORS.muted}
                          sx={{
                            maxWidth: 300,
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
                          fontSize={12}
                          color={COLORS.text}
                        >
                          {productCount ?? '—'}
                        </Typography>
                      </TableCell>

                      {/* STATUS */}

                      <TableCell>
                        <Stack
                          direction="row"
                          alignItems="center"
                          spacing={0.5}
                        >
                          <Tooltip
                            title={
                              isActive
                                ? 'Disable category'
                                : 'Activate category'
                            }
                          >
                            <Switch
                              size="small"
                              checked={isActive}
                              onChange={() =>
                                openStatusDialog(category)
                              }
                              sx={{
                                '& .MuiSwitch-switchBase.Mui-checked': {
                                  color: COLORS.cyan
                                },
                                '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                  bgcolor: COLORS.cyan
                                }
                              }}
                            />
                          </Tooltip>

                          <Chip
                            size="small"
                            label={
                              isActive
                                ? 'Active'
                                : 'Disabled'
                            }
                            sx={{
                              height: 23,
                              fontSize: 10,
                              bgcolor: isActive
                                ? '#E8F6F0'
                                : '#F0F2F5',
                              color: isActive
                                ? COLORS.green
                                : COLORS.muted
                            }}
                          />
                        </Stack>
                      </TableCell>

                      {/* ACTIONS */}

                      <TableCell>
                        <Stack
                          direction="row"
                          alignItems="center"
                          spacing={0.5}
                        >
                          <Button
                            size="small"
                            onClick={() =>
                              setViewCategory(category)
                            }
                            sx={{
                              minWidth: 0,
                              px: 1,
                              fontSize: 11,
                              textTransform: 'none',
                              color: COLORS.text
                            }}
                          >
                            View
                          </Button>

                          <Tooltip title="Edit category">
                            <IconButton
                              size="small"
                              onClick={() =>
                                openEditDialog(category)
                              }
                            >
                              <EditOutlined
                                style={{ fontSize: 14 }}
                              />
                            </IconButton>
                          </Tooltip>

                          <IconButton
                            size="small"
                            onClick={(event) =>
                              openActionMenu(
                                event,
                                category
                              )
                            }
                          >
                            <EllipsisOutlined />
                          </IconButton>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}

              {!loading &&
                filteredCategories.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      align="center"
                      sx={{ py: 5 }}
                    >
                      <Typography
                        fontSize={12}
                        color={COLORS.muted}
                      >
                        {categories.length === 0
                          ? 'No categories available.'
                          : 'No matching categories found.'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* PAGINATION */}

        <Divider />

        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          justifyContent="space-between"
          alignItems="center"
          spacing={2}
          sx={{ px: 2, py: 1.5 }}
        >
          <Typography
            fontSize={11}
            color={COLORS.muted}
          >
            Showing {showingFrom}–{showingTo} of{' '}
            {filteredCategories.length} categories
          </Typography>

          <Pagination
            count={pageCount}
            page={currentPage}
            onChange={(_, value) => setPage(value)}
            size="small"
            shape="rounded"
            sx={{
              '& .Mui-selected': {
                bgcolor: `${COLORS.cyan} !important`,
                color: COLORS.text
              }
            }}
          />
        </Stack>
      </Card>



      {/* ACTION MENU */}

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={closeActionMenu}
      >
        <MenuItem
          onClick={() => {
            const selected = menuCategory;
            closeActionMenu();
            setViewCategory(selected);
          }}
        >
          <EyeOutlined
            style={{ marginRight: 10 }}
          />
          View details
        </MenuItem>

        <MenuItem
          onClick={() => {
            const selected = menuCategory;
            closeActionMenu();
            openEditDialog(selected);
          }}
        >
          <EditOutlined
            style={{ marginRight: 10 }}
          />
          Edit category
        </MenuItem>

        <MenuItem
          onClick={() => {
            const selected = menuCategory;
            closeActionMenu();
            openStatusDialog(selected);
          }}
        >
          <WarningOutlined
            style={{ marginRight: 10 }}
          />
          {menuCategory?.status === 'ACTIVE'
            ? 'Disable category'
            : 'Activate category'}
        </MenuItem>
      </Menu>

      {/* VIEW CATEGORY DIALOG */}

      <Dialog
        open={Boolean(viewCategory)}
        onClose={() => setViewCategory(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          Category Details
        </DialogTitle>

        <DialogContent>
          {viewCategory && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Box>
                <Typography
                  fontSize={11}
                  color={COLORS.muted}
                >
                  Category Name
                </Typography>

                <Typography fontWeight={600}>
                  {viewCategory.categoryName}
                </Typography>
              </Box>

              <Box>
                <Typography
                  fontSize={11}
                  color={COLORS.muted}
                >
                  Description
                </Typography>

                <Typography fontSize={13}>
                  {viewCategory.description || '—'}
                </Typography>
              </Box>

              <Box>
                <Typography
                  fontSize={11}
                  color={COLORS.muted}
                >
                  Product Count
                </Typography>

                <Typography fontSize={13}>
                  {getProductCount(
                    viewCategory.categoryId
                  ) ?? '—'}
                </Typography>
              </Box>

              <Box>
                <Typography
                  fontSize={11}
                  color={COLORS.muted}
                >
                  Status
                </Typography>

                <Chip
                  size="small"
                  label={
                    viewCategory.status === 'ACTIVE'
                      ? 'Active'
                      : 'Disabled'
                  }
                  color={
                    viewCategory.status === 'ACTIVE'
                      ? 'success'
                      : 'default'
                  }
                />
              </Box>
            </Stack>
          )}
        </DialogContent>

        <DialogActions sx={{ p: 2 }}>
          <Button
            onClick={() => setViewCategory(null)}
          >
            Close
          </Button>

          <Button
            variant="contained"
            onClick={() => {
              const selected = viewCategory;
              setViewCategory(null);
              openEditDialog(selected);
            }}
          >
            Edit Category
          </Button>
        </DialogActions>
      </Dialog>

      {/* ADD / EDIT CATEGORY DIALOG */}

      <Dialog
        open={Boolean(dialog)}
        onClose={closeDialog}
        fullWidth
        maxWidth="sm"
      >
        <Box
          component="form"
          onSubmit={handleSubmit}
        >
          <DialogTitle>
            {dialog?.mode === 'create'
              ? 'Add Category'
              : 'Edit Category'}
          </DialogTitle>

          <DialogContent>
            <Stack spacing={3} sx={{ mt: 1 }}>
              {formError && (
                <Alert severity="error">
                  {formError}
                </Alert>
              )}

              <TextField
                fullWidth
                required
                label="Category Name"
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
              />

              <TextField
                fullWidth
                multiline
                rows={3}
                label="Description"
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
              />
            </Stack>
          </DialogContent>

          <DialogActions sx={{ p: 2 }}>
            <Button
              onClick={closeDialog}
              disabled={saving}
            >
              Cancel
            </Button>

            <Button
              type="submit"
              variant="contained"
              disabled={saving}
              sx={{
                bgcolor: COLORS.cyan,
                color: COLORS.text,
                '&:hover': {
                  bgcolor: '#6DDDE9'
                }
              }}
            >
              {saving
                ? 'Saving...'
                : dialog?.mode === 'create'
                  ? 'Add Category'
                  : 'Save Changes'}
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
      >
        <DialogTitle>
          Confirm Status Change
        </DialogTitle>

        <DialogContent>
          <Typography fontSize={13}>
            Are you sure you want to{' '}
            <strong>
              {statusDialog?.status === 'ACTIVE'
                ? 'disable'
                : 'activate'}
            </strong>
            {' '}the category{' '}
            <strong>
              {statusDialog?.categoryName}
            </strong>
            ?
          </Typography>

          {statusDialog?.status === 'ACTIVE' && (
            <Alert
              severity="warning"
              sx={{ mt: 2 }}
            >
              This category will become inactive.
              Its products will not be deleted.
            </Alert>
          )}
        </DialogContent>

        <DialogActions sx={{ p: 2 }}>
          <Button
            disabled={changingStatus}
            onClick={() =>
              setStatusDialog(null)
            }
          >
            Cancel
          </Button>

          <Button
            variant="contained"
            color={
              statusDialog?.status === 'ACTIVE'
                ? 'warning'
                : 'primary'
            }
            disabled={changingStatus}
            onClick={handleChangeStatus}
          >
            {changingStatus
              ? 'Processing...'
              : 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
