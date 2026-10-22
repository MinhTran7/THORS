
import { useEffect, useMemo, useState } from 'react';
import {
    Alert, Avatar, Box, Button, Card, Chip, CircularProgress,
    Divider, IconButton, InputAdornment, Stack, TextField,
    ToggleButton, ToggleButtonGroup, Typography
} from '@mui/material';
import {
    SearchOutlined, DeleteOutlined, PlusOutlined, MinusOutlined,
    ShoppingCartOutlined, CheckCircleOutlined
} from '@ant-design/icons';
import { getProducts, getProductById } from '../../services/productService';

const COLORS = {
    ink: '#202D42',
    muted: '#75869F',
    border: '#E5EBF2',
    cyan: '#8DE9F2',
    bg: '#F8FAFC'
};

const money = value =>
    `${Number(value || 0).toLocaleString('vi-VN')} ₫`;

const productId = product => product.productId ?? product.id;
const stockOf = variant => Number(variant.stockQuantity ?? variant.stock ?? 0);

const normalizeList = data =>
    Array.isArray(data) ? data
        : Array.isArray(data?.content) ? data.content
            : Array.isArray(data?.data) ? data.data
                : [];

export default function InStoreSalesPage() {
    const [products, setProducts] = useState([]);
    const [categories, setCategories] = useState(['All products']);
    const [category, setCategory] = useState('All products');
    const [search, setSearch] = useState('');
    const [cart, setCart] = useState([]);
    const [loading, setLoading] = useState(true);
    const [addingId, setAddingId] = useState(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [customer, setCustomer] = useState('');
    const [payment, setPayment] = useState('Cash');
    const [received, setReceived] = useState('');
    const [discount, setDiscount] = useState('');

    async function loadProducts() {
        setLoading(true);
        setError('');

        try {
            const list = normalizeList(await getProducts())
                .filter(product => product.status === 'ACTIVE');

            setProducts(list);
            setCategories([
                'All products',
                ...new Set(list.map(p => p.categoryName).filter(Boolean))
            ]);
        } catch (err) {
            setError(err.message || 'Unable to load products.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadProducts();
    }, []);

    const visibleProducts = useMemo(() => {
        const keyword = search.trim().toLowerCase();

        return products.filter(product =>
            (category === 'All products' || product.categoryName === category) &&
            [product.productName, product.sku, product.categoryName]
                .some(value => String(value || '').toLowerCase().includes(keyword))
        );
    }, [products, category, search]);

    async function addProduct(product) {
        const id = productId(product);
        if (!id || addingId !== null) return;

        setAddingId(id);
        setError('');
        setNotice('');

        try {
            const result = await getProductById(id);
            const detail = result?.data ?? result;
            const item = detail?.product ?? detail;

            const variants = (detail?.variants ?? item?.variants ?? [])
                .filter(v => v.status === 'ACTIVE' && stockOf(v) > 0)
                .sort((a, b) => stockOf(b) - stockOf(a));

            if (!variants.length) {
                setError(`${product.productName} has no available stock.`);
                return;
            }

            const variant = variants[0];
            const variantId = variant.detailId ?? variant.variantId ?? variant.id;

            if (variantId == null) {
                setError('Product variant ID is missing.');
                return;
            }

            const key = `${id}-${variantId}`;
            const existing = cart.find(line => line.key === key);

            if (existing && existing.quantity >= existing.stock) {
                setError('Quantity cannot exceed available stock.');
                return;
            }

            const image = detail?.images?.[0]?.imageUrl
                || product.imageUrl || product.thumbnailUrl || '';

            if (existing) {
                setCart(current => current.map(line =>
                    line.key === key
                        ? { ...line, quantity: line.quantity + 1 }
                        : line
                ));
            } else {
                setCart(current => [...current, {
                    key,
                    productId: id,
                    variantId,
                    name: item?.productName || product.productName,
                    image,
                    size: variant.size || '',
                    color: variant.color || '',
                    price: Number(variant.price || 0),
                    stock: stockOf(variant),
                    quantity: 1
                }]);
            }

            setNotice(`${product.productName} added to invoice.`);
        } catch (err) {
            setError(err.message || 'Could not add this product.');
        } finally {
            setAddingId(null);
        }
    }

    function updateQuantity(key, delta) {
        setCart(current => current.map(line =>
            line.key === key
                ? {
                    ...line,
                    quantity: Math.max(1, Math.min(line.stock, line.quantity + delta))
                }
                : line
        ));
    }

    function removeProduct(key) {
        setCart(current => current.filter(line => line.key !== key));
    }

    const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);
    const subtotal = cart.reduce((sum, line) => sum + line.price * line.quantity, 0);
    const discountValue = Math.min(subtotal, Math.max(0, Number(discount) || 0));
    const total = subtotal - discountValue;
    const receivedValue = Math.max(0, Number(received) || 0);
    const change = Math.max(0, receivedValue - total);

    function completeSale() {
        setError('');
        setNotice('');

        if (!cart.length) {
            setError('Add at least one product to the invoice.');
            return;
        }

        if (payment === 'Cash' && receivedValue < total) {
            setError('Amount received must cover the total to pay.');
            return;
        }

        setNotice('Invoice validated. Connect the sales API to save this sale.');
    }

    function clearInvoice() {
        setCart([]);
        setDiscount('');
        setReceived('');
        setNotice('');
        setError('');
    }

    return (
        <Box sx={{ maxWidth: 1600, mx: 'auto', color: COLORS.ink }}>
            {error && (
                <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setError('')}>
                    {error}
                </Alert>
            )}

            {notice && (
                <Alert severity="info" sx={{ mb: 1.5 }} onClose={() => setNotice('')}>
                    {notice}
                </Alert>
            )}

            <Box sx={{
                display: 'grid',
                gridTemplateColumns: {
                    xs: 'minmax(0, 1fr)',
                    lg: 'minmax(0, 1.65fr) minmax(320px, 0.95fr)'
                },
                gap: 2,
                alignItems: 'start'
            }}>
                {/* Product catalog */}
                <Card sx={{
                    p: { xs: 1.5, md: 2 },
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 2,
                    boxShadow: 'none'
                }}>
                    <TextField
                        fullWidth
                        size="small"
                        placeholder="Search products by name or SKU"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchOutlined />
                                </InputAdornment>
                            )
                        }}
                        sx={{ mb: 1.5 }}
                    />

                    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
                        {categories.map(item => (
                            <Chip
                                key={item}
                                label={item}
                                clickable
                                onClick={() => setCategory(item)}
                                sx={{
                                    bgcolor: category === item ? COLORS.cyan : '#fff',
                                    border: `1px solid ${category === item ? COLORS.cyan : COLORS.border}`,
                                    fontWeight: category === item ? 700 : 500
                                }}
                            />
                        ))}
                    </Stack>

                    {loading ? (
                        <Box sx={{ py: 8, display: 'flex', justifyContent: 'center' }}>
                            <CircularProgress />
                        </Box>
                    ) : !visibleProducts.length ? (
                        <Typography sx={{ py: 8, textAlign: 'center', color: COLORS.muted }}>
                            No products found.
                        </Typography>
                    ) : (
                        <Box sx={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))',
                            gap: 1.5
                        }}>
                            {visibleProducts.map(product => {
                                const id = productId(product);
                                const image = product.imageUrl
                                    || product.thumbnailUrl
                                    || product.mainImageUrl
                                    || product.images?.[0]?.imageUrl;
                                const stock = Number(product.totalStock || 0);

                                return (
                                    <Card
                                        key={id}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => addProduct(product)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                addProduct(product);
                                            }
                                        }}
                                        sx={{
                                            p: 1,
                                            border: `1px solid ${COLORS.border}`,
                                            borderRadius: 2,
                                            boxShadow: 'none',
                                            cursor: 'pointer',
                                            opacity: addingId === id ? 0.6 : 1,
                                            transition: 'border-color .15s, transform .15s',
                                            '&:hover': {
                                                borderColor: COLORS.cyan,
                                                transform: 'translateY(-2px)'
                                            }
                                        }}
                                    >
                                        <Box sx={{
                                            height: 118,
                                            bgcolor: COLORS.bg,
                                            borderRadius: 1.5,
                                            overflow: 'hidden',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            mb: 1
                                        }}>
                                            {image ? (
                                                <Box
                                                    component="img"
                                                    src={image}
                                                    alt={product.productName}
                                                    sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                />
                                            ) : (
                                                <ShoppingCartOutlined style={{ fontSize: 32, color: '#B7C3D2' }} />
                                            )}
                                        </Box>

                                        <Typography sx={{ fontSize: 13, fontWeight: 700, lineHeight: 1.4, minHeight: 36 }}>
                                            {product.productName || 'Unnamed product'}
                                        </Typography>

                                        <Typography sx={{ fontSize: 10.5, color: COLORS.muted, mt: 0.25 }}>
                                            {product.categoryName || 'Uncategorized'}
                                            {product.sku ? ` · ${product.sku}` : ''}
                                        </Typography>

                                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 0.75 }}>
                                            <Typography sx={{ fontWeight: 700, fontSize: 14 }}>
                                                {product.minPrice != null
                                                    ? Number(product.minPrice) === Number(product.maxPrice)
                                                    || product.maxPrice == null
                                                        ? money(product.minPrice)
                                                        : `${money(product.minPrice)}+`
                                                    : 'View price'}
                                            </Typography>
                                            <Typography sx={{
                                                fontSize: 10,
                                                color: stock <= 5 ? '#B45309' : COLORS.muted
                                            }}>
                                                {stock} in stock
                                            </Typography>
                                        </Stack>

                                        {addingId === id && (
                                            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                                                <CircularProgress size={14} />
                                                <Typography sx={{ fontSize: 11 }}>Adding product...</Typography>
                                            </Stack>
                                        )}
                                    </Card>
                                );
                            })}
                        </Box>
                    )}
                </Card>

                {/* Current invoice */}
                <Card sx={{
                    p: 2,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 2,
                    boxShadow: 'none'
                }}>
                    <Typography sx={{ fontSize: 18, fontWeight: 700, mb: 1.5 }}>
                        Invoice
                    </Typography>

                    <TextField
                        fullWidth
                        size="small"
                        label="Customer"
                        value={customer}
                        onChange={e => setCustomer(e.target.value)}
                        sx={{ mb: 1.5 }}
                    />

                    {!cart.length ? (
                        <Box sx={{
                            py: 6,
                            textAlign: 'center',
                            bgcolor: COLORS.bg,
                            borderRadius: 2,
                            mb: 2
                        }}>
                            <ShoppingCartOutlined style={{ fontSize: 28, color: '#A9B6C8' }} />
                            <Typography sx={{ mt: 1, fontSize: 13, fontWeight: 600 }}>
                                Your invoice is empty
                            </Typography>
                            <Typography sx={{ fontSize: 12, color: COLORS.muted }}>
                                Click a product to add it here.
                            </Typography>
                        </Box>
                    ) : (
                        <Stack spacing={1.25} sx={{ mb: 2 }}>
                            {cart.map(line => (
                                <Box key={line.key}>
                                    <Stack direction="row" spacing={1} alignItems="center">
                                        <Avatar
                                            variant="rounded"
                                            src={line.image}
                                            sx={{ width: 54, height: 54, bgcolor: COLORS.bg, color: COLORS.muted }}
                                        >
                                            <ShoppingCartOutlined />
                                        </Avatar>

                                        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                            <Typography sx={{ fontSize: 12.5, fontWeight: 700 }}>
                                                {line.name}
                                            </Typography>
                                            <Typography sx={{ fontSize: 10.5, color: COLORS.muted }}>
                                                {[line.size, line.color].filter(Boolean).join(' / ') || 'Default variant'}
                                                {' · '}{money(line.price)} each
                                            </Typography>

                                            <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 0.5 }}>
                                                <IconButton
                                                    size="small"
                                                    aria-label="Decrease quantity"
                                                    onClick={() => updateQuantity(line.key, -1)}
                                                    sx={{ border: `1px solid ${COLORS.border}`, borderRadius: 1, p: 0.25 }}
                                                >
                                                    <MinusOutlined style={{ fontSize: 10 }} />
                                                </IconButton>
                                                <Typography sx={{ minWidth: 20, textAlign: 'center', fontSize: 12 }}>
                                                    {line.quantity}
                                                </Typography>
                                                <IconButton
                                                    size="small"
                                                    aria-label="Increase quantity"
                                                    disabled={line.quantity >= line.stock}
                                                    onClick={() => updateQuantity(line.key, 1)}
                                                    sx={{ border: `1px solid ${COLORS.border}`, borderRadius: 1, p: 0.25 }}
                                                >
                                                    <PlusOutlined style={{ fontSize: 10 }} />
                                                </IconButton>
                                                <Typography sx={{ fontSize: 10, color: COLORS.muted }}>
                                                    max {line.stock}
                                                </Typography>
                                            </Stack>
                                        </Box>

                                        <Box sx={{ textAlign: 'right' }}>
                                            <Typography sx={{ fontSize: 12.5, fontWeight: 700 }}>
                                                {money(line.price * line.quantity)}
                                            </Typography>
                                            <IconButton
                                                size="small"
                                                aria-label={`Remove ${line.name}`}
                                                onClick={() => removeProduct(line.key)}
                                            >
                                                <DeleteOutlined style={{ fontSize: 13 }} />
                                            </IconButton>
                                        </Box>
                                    </Stack>
                                    <Divider sx={{ mt: 1.25, borderColor: COLORS.border }} />
                                </Box>
                            ))}
                        </Stack>
                    )}

                    <Stack spacing={1.2}>
                        <Stack direction="row" justifyContent="space-between">
                            <Typography sx={{ fontSize: 12, color: COLORS.muted }}>
                                Items ({itemCount})
                            </Typography>
                            <Typography sx={{ fontSize: 12, fontWeight: 600 }}>
                                {money(subtotal)}
                            </Typography>
                        </Stack>

                        <Stack direction="row" spacing={1} alignItems="center">
                            <Typography sx={{ flexGrow: 1, fontSize: 12, color: COLORS.muted }}>
                                Discount (₫)
                            </Typography>
                            <TextField
                                size="small"
                                type="number"
                                value={discount}
                                onChange={e => setDiscount(e.target.value)}
                                inputProps={{ min: 0, max: subtotal }}
                                sx={{ width: 130 }}
                            />
                        </Stack>

                        <Divider sx={{ borderColor: COLORS.border }} />

                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Typography sx={{ fontWeight: 700 }}>Total to pay</Typography>
                            <Typography sx={{ fontSize: 24, fontWeight: 800 }}>
                                {money(total)}
                            </Typography>
                        </Stack>

                        <Typography sx={{ fontSize: 12, fontWeight: 700, mt: 0.5 }}>
                            Payment method
                        </Typography>

                        <ToggleButtonGroup
                            exclusive
                            fullWidth
                            size="small"
                            value={payment}
                            onChange={(_, value) => {
                                if (value) setPayment(value);
                            }}
                            sx={{
                                '& .MuiToggleButton-root': {
                                    flex: 1,
                                    textTransform: 'none',
                                    borderColor: COLORS.border,
                                    color: COLORS.ink
                                },
                                '& .MuiToggleButton-root.Mui-selected': {
                                    bgcolor: `${COLORS.cyan} !important`,
                                    color: COLORS.ink,
                                    fontWeight: 700
                                }
                            }}
                        >
                            <ToggleButton value="Cash">Cash</ToggleButton>
                            <ToggleButton value="Bank transfer">Bank transfer</ToggleButton>
                        </ToggleButtonGroup>

                        {payment === 'Cash' && (
                            <>
                                <TextField
                                    size="small"
                                    fullWidth
                                    type="number"
                                    label="Amount received (₫)"
                                    value={received}
                                    onChange={e => setReceived(e.target.value)}
                                    inputProps={{ min: 0 }}
                                />
                                <Stack direction="row" justifyContent="space-between" sx={{
                                    p: 1.25,
                                    bgcolor: COLORS.bg,
                                    borderRadius: 1.5
                                }}>
                                    <Typography sx={{ fontSize: 12, color: COLORS.muted }}>
                                        Change due
                                    </Typography>
                                    <Typography sx={{ fontWeight: 700 }}>{money(change)}</Typography>
                                </Stack>
                            </>
                        )}

                        <Button
                            fullWidth
                            variant="contained"
                            startIcon={<CheckCircleOutlined />}
                            onClick={completeSale}
                            disabled={!cart.length}
                            sx={{
                                mt: 0.5,
                                py: 1.2,
                                bgcolor: COLORS.cyan,
                                color: COLORS.ink,
                                fontWeight: 700,
                                boxShadow: 'none',
                                '&:hover': { bgcolor: '#6BDCE7', boxShadow: 'none' }
                            }}
                        >
                            Complete sale · {money(total)}
                        </Button>

                        <Button
                            fullWidth
                            variant="outlined"
                            onClick={clearInvoice}
                            sx={{ borderColor: COLORS.border, color: COLORS.ink }}
                        >
                            Clear invoice
                        </Button>

                    </Stack>
                </Card>
            </Box>
        </Box>
    );
}
