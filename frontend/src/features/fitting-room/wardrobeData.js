// Dữ liệu cho Tủ đồ của Phòng thử đồ - chỉ dùng API có sẵn: danh sách sản phẩm cửa hàng (/api/shop/products,
// tối đa 40 / trang) + mô hình 3D (/api/shop/garment-models, tối đa 50 id / lần).
import { api } from 'services/http';
import { getShopGarmentModels } from 'features/fitting/garmentApi';

const PAGE_SIZE = 40;
/** Kiểu dữ liệu khi kéo một món từ Tủ đồ thả lên người mẫu (giá trị = productId). */
export const DRAG_TYPE = 'text/thors-product';
// Đủ cho cửa hàng nhỏ (200 sản phẩm đang bán); nhiều hơn thì cần API riêng liệt kê mô hình 3D (đề xuất sau)
const MAX_PAGES = 5;
const MODEL_BATCH = 50;

/**
 * Các sản phẩm đang bán có mô hình 3D đang bật.
 * @returns [{ productId, productName, imageUrl, minPrice, model: { glbUrl, slot, gender, fabricMaterial, sizes, colors } }]
 */
export async function loadWardrobe() {
  const products = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await api(`/shop/products?page=${page}&size=${PAGE_SIZE}`);
    const items = res?.items ?? [];
    products.push(...items);
    if (items.length < PAGE_SIZE || products.length >= (res?.total ?? 0)) break;
  }
  const models = new Map();
  for (let i = 0; i < products.length; i += MODEL_BATCH) {
    const batch = await getShopGarmentModels(products.slice(i, i + MODEL_BATCH).map((p) => p.productId));
    for (const m of batch ?? []) models.set(m.productId, m);
  }
  // Mọi sản phẩm (kho đồ mặc định chỉ hiện món có 3D; công tắc 'Hiện cả món chưa có 3D' hiện phần còn lại)
  return products.map((p) => {
    const model = models.get(p.productId) ?? null;
    return {
      productId: p.productId,
      productName: p.productName,
      categoryName: p.categoryName ?? '',
      imageUrl: p.imageUrl,
      minPrice: p.minPrice,
      model,
      slot: model?.slot ?? guessSlot(`${p.categoryName ?? ''} ${p.productName ?? ''}`)
    };
  });
}

/** Ô trang bị đoán theo tên danh mục / sản phẩm (chỉ dùng cho món chưa có mô hình 3D). null = không phải quần áo. */
export function guessSlot(text) {
  const t = String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
  if (/khoac|jacket|blazer|cardigan|hoodie/.test(t)) return 'OUTER';
  if (/dam|vay lien|dress/.test(t)) return 'DRESS';
  if (/quan|jean|chan vay|vay|short|skirt|trouser/.test(t)) return 'BOTTOM';
  if (/giay|dep|sandal|sneaker|boot|shoe/.test(t)) return 'SHOES';
  if (/ao|so mi|blouse|thun|polo|shirt|tee/.test(t)) return 'TOP';
  return null;
}

/** Biến thể của sản phẩm (size, màu, giá, tồn kho bán online). */
export async function loadVariants(productId) {
  const res = await api(`/shop/products/${productId}`);
  return (res?.variants ?? []).map((v) => ({
    detailId: v.detailId,
    size: v.size,
    color: v.color,
    price: v.price,
    stock: Number(v.stock ?? 0)
  }));
}

/**
 * Gợi ý size theo số đo đang xem trong phòng thử (API size-guide có sẵn, POST số đo tự nhập - không lưu).
 * @returns { recommendedSize, sizes: [{ size, details }] } hoặc null (thiếu số đo / sản phẩm không có bảng size)
 */
export async function loadSizeAdvice(productId, m) {
  const num = (v) => (v === '' || v === null || v === undefined ? null : Number(String(v).replace(',', '.')));
  try {
    const guide = await api(`/shop/products/${productId}/size-guide`, {
      method: 'POST',
      body: {
        gender: m.gender || null,
        heightCm: num(m.heightCm),
        weightKg: num(m.weightKg),
        chestCm: num(m.chestCm),
        waistCm: num(m.waistCm),
        hipCm: num(m.hipCm),
        fitPreference: 'REGULAR'
      }
    });
    const rec = guide?.recommendation;
    return rec ? { recommendedSize: rec.recommendedSize, sizes: rec.sizes ?? [] } : null;
  } catch {
    return null;
  }
}

/** Câu độ vừa của một size theo gợi ý ("Ngực vừa · Eo hơi rộng"); không có dữ liệu -> ''. */
export const fitOf = (advice, size, summarize) => {
  const s = advice?.sizes?.find((x) => x.size === size);
  return s?.details?.length ? summarize(s.details) : '';
};

/**
 * Món của bộ gợi ý (OutfitItem: role, roleLabel, productId, detailId, size, color, price...) -> món mặc trong phòng thử.
 * Món không có mô hình 3D (hoặc mô hình cho người mẫu khác) vẫn vào ô đồ nhưng has3d = false: ghi "Chưa hỗ trợ thử đồ 3D".
 */
export async function toWornItems(outfitItems, gender) {
  const models = new Map((await getShopGarmentModels(outfitItems.map((i) => i.productId))).map((m) => [m.productId, m]));
  const variantLists = await Promise.all(outfitItems.map((i) => loadVariants(i.productId).catch(() => [])));
  return outfitItems.map((i, k) => {
    const model = models.get(i.productId);
    const has3d = Boolean(model && model.gender === gender);
    const variants = variantLists[k];
    return {
      slot: has3d ? model.slot : i.role,
      role: i.role,
      roleLabel: i.roleLabel,
      productId: i.productId,
      productName: i.productName,
      imageUrl: i.imageUrl,
      price: i.price,
      detailId: i.detailId,
      size: i.size,
      color: i.color,
      stock: variants.find((v) => v.detailId === i.detailId)?.stock,
      has3d,
      model: has3d ? model : null,
      variants
    };
  });
}

/** Size này có mô hình 3D không (Owner đã khai báo mức size). */
export const sizeSupported = (model, size) => Boolean(model?.sizes && size && model.sizes[size]);

/** Biến thể theo size + màu; không có màu đó ở size đó thì lấy biến thể đầu tiên của size. */
export function variantFor(variants, size, color) {
  return variants.find((v) => v.size === size && v.color === color) ?? variants.find((v) => v.size === size) ?? null;
}

/** Món mặc lên người mẫu -> tham số cho AvatarViewer (chỉ món có mô hình 3D cho đúng size đang chọn). */
export function toWear(item) {
  if (!item?.has3d || !sizeSupported(item.model, item.size)) return null;
  const s = item.model.sizes[item.size];
  return {
    slot: item.slot, // để khung 3D biết vùng nào đang được che (ẩn đồ lót bên dưới)
    item: { id: `p${item.productId}`, url: item.model.glbUrl, fabric: item.model.fabricMaterial },
    color: item.model.colors?.[item.color]?.hex,
    morphs: { Size_up: s.up ?? 0, Size_down: s.down ?? 0 }
  };
}
