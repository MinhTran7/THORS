import {
  AppstoreOutlined,
  BgColorsOutlined,
  BookOutlined,
  BulbOutlined,
  CameraOutlined,
  CarOutlined,
  ClockCircleOutlined,
  CloudOutlined,
  CoffeeOutlined,
  CompassOutlined,
  CreditCardOutlined,
  CrownOutlined,
  CustomerServiceOutlined,
  DropboxOutlined,
  ExperimentOutlined,
  EyeOutlined,
  FireOutlined,
  FlagOutlined,
  GiftOutlined,
  GoldOutlined,
  HeartOutlined,
  HomeOutlined,
  InboxOutlined,
  ManOutlined,
  MedicineBoxOutlined,
  MobileOutlined,
  PercentageOutlined,
  RocketOutlined,
  SafetyOutlined,
  ScissorOutlined,
  ShopOutlined,
  ShoppingCartOutlined,
  ShoppingOutlined,
  SketchOutlined,
  SkinOutlined,
  SmileOutlined,
  StarOutlined,
  SunOutlined,
  TagOutlined,
  TagsOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  TrophyOutlined,
  UserOutlined,
  WalletOutlined,
  WomanOutlined
} from '@ant-design/icons';

// Nhóm hiển thị trong bảng chọn icon
export const ICON_GROUPS = ['Thời trang', 'Đối tượng', 'Phụ kiện', 'Mua sắm', 'Khác'];

/**
 * Bảng icon cho danh mục. key được lưu vào cột category.icon (chữ thường, số, "-") — đổi key sẽ làm mất icon đã chọn.
 * keywords: từ khóa không dấu để tìm nhanh trong bảng chọn.
 */
export const CATEGORY_ICONS = [
  { key: 'skin', label: 'Quần áo', group: 'Thời trang', Icon: SkinOutlined, keywords: 'ao quan thoi trang' },
  { key: 'scissor', label: 'May đo', group: 'Thời trang', Icon: ScissorOutlined, keywords: 'may do vai' },
  { key: 'bg-colors', label: 'Màu sắc', group: 'Thời trang', Icon: BgColorsOutlined, keywords: 'mau son' },
  { key: 'crown', label: 'Cao cấp', group: 'Thời trang', Icon: CrownOutlined, keywords: 'cao cap vip luxury' },
  { key: 'sketch', label: 'Trang sức', group: 'Thời trang', Icon: SketchOutlined, keywords: 'trang suc kim cuong nhan' },
  { key: 'gold', label: 'Vàng bạc', group: 'Thời trang', Icon: GoldOutlined, keywords: 'vang bac' },
  { key: 'star', label: 'Nổi bật', group: 'Thời trang', Icon: StarOutlined, keywords: 'noi bat sao' },
  { key: 'heart', label: 'Yêu thích', group: 'Thời trang', Icon: HeartOutlined, keywords: 'yeu thich tim' },
  { key: 'fire', label: 'Xu hướng', group: 'Thời trang', Icon: FireOutlined, keywords: 'hot trend xu huong' },
  { key: 'thunderbolt', label: 'Thể thao', group: 'Thời trang', Icon: ThunderboltOutlined, keywords: 'the thao gym' },
  { key: 'trophy', label: 'Thi đấu', group: 'Thời trang', Icon: TrophyOutlined, keywords: 'thi dau cup' },
  { key: 'sun', label: 'Mùa hè', group: 'Thời trang', Icon: SunOutlined, keywords: 'mua he nang' },
  { key: 'cloud', label: 'Mùa đông', group: 'Thời trang', Icon: CloudOutlined, keywords: 'mua dong ao khoac lanh' },

  { key: 'man', label: 'Nam', group: 'Đối tượng', Icon: ManOutlined, keywords: 'nam dan ong' },
  { key: 'woman', label: 'Nữ', group: 'Đối tượng', Icon: WomanOutlined, keywords: 'nu phu nu' },
  { key: 'smile', label: 'Trẻ em', group: 'Đối tượng', Icon: SmileOutlined, keywords: 'tre em be' },
  { key: 'team', label: 'Nam & Nữ', group: 'Đối tượng', Icon: TeamOutlined, keywords: 'unisex nam nu gia dinh' },
  { key: 'user', label: 'Cá nhân', group: 'Đối tượng', Icon: UserOutlined, keywords: 'ca nhan nguoi' },

  { key: 'shopping', label: 'Túi xách', group: 'Phụ kiện', Icon: ShoppingOutlined, keywords: 'tui xach balo' },
  { key: 'wallet', label: 'Ví', group: 'Phụ kiện', Icon: WalletOutlined, keywords: 'vi bop' },
  { key: 'clock-circle', label: 'Đồng hồ', group: 'Phụ kiện', Icon: ClockCircleOutlined, keywords: 'dong ho' },
  { key: 'eye', label: 'Kính mắt', group: 'Phụ kiện', Icon: EyeOutlined, keywords: 'kinh mat' },
  { key: 'safety', label: 'Mũ / bảo hộ', group: 'Phụ kiện', Icon: SafetyOutlined, keywords: 'mu non bao ho' },
  { key: 'customer-service', label: 'Tai nghe', group: 'Phụ kiện', Icon: CustomerServiceOutlined, keywords: 'tai nghe am thanh' },
  { key: 'mobile', label: 'Điện thoại', group: 'Phụ kiện', Icon: MobileOutlined, keywords: 'dien thoai op lung' },
  { key: 'camera', label: 'Máy ảnh', group: 'Phụ kiện', Icon: CameraOutlined, keywords: 'may anh' },
  { key: 'tag', label: 'Nhãn', group: 'Phụ kiện', Icon: TagOutlined, keywords: 'nhan tag' },
  { key: 'tags', label: 'Nhiều nhãn', group: 'Phụ kiện', Icon: TagsOutlined, keywords: 'nhan tags' },

  { key: 'shop', label: 'Cửa hàng', group: 'Mua sắm', Icon: ShopOutlined, keywords: 'cua hang shop' },
  { key: 'shopping-cart', label: 'Giỏ hàng', group: 'Mua sắm', Icon: ShoppingCartOutlined, keywords: 'gio hang' },
  { key: 'percentage', label: 'Giảm giá', group: 'Mua sắm', Icon: PercentageOutlined, keywords: 'sale giam gia' },
  { key: 'gift', label: 'Quà tặng', group: 'Mua sắm', Icon: GiftOutlined, keywords: 'qua tang' },
  { key: 'rocket', label: 'Hàng mới', group: 'Mua sắm', Icon: RocketOutlined, keywords: 'hang moi new' },
  { key: 'inbox', label: 'Hộp / kho', group: 'Mua sắm', Icon: InboxOutlined, keywords: 'hop kho' },
  { key: 'dropbox', label: 'Đóng gói', group: 'Mua sắm', Icon: DropboxOutlined, keywords: 'dong goi combo' },
  { key: 'credit-card', label: 'Thanh toán', group: 'Mua sắm', Icon: CreditCardOutlined, keywords: 'the thanh toan' },
  { key: 'car', label: 'Giao hàng', group: 'Mua sắm', Icon: CarOutlined, keywords: 'giao hang xe' },
  { key: 'flag', label: 'Bộ sưu tập', group: 'Mua sắm', Icon: FlagOutlined, keywords: 'bo suu tap collection' },

  { key: 'home', label: 'Gia dụng', group: 'Khác', Icon: HomeOutlined, keywords: 'gia dung nha' },
  { key: 'experiment', label: 'Mỹ phẩm', group: 'Khác', Icon: ExperimentOutlined, keywords: 'my pham nuoc hoa' },
  { key: 'medicine-box', label: 'Chăm sóc', group: 'Khác', Icon: MedicineBoxOutlined, keywords: 'cham soc suc khoe' },
  { key: 'coffee', label: 'Đồ uống', group: 'Khác', Icon: CoffeeOutlined, keywords: 'do uong ca phe' },
  { key: 'book', label: 'Sách', group: 'Khác', Icon: BookOutlined, keywords: 'sach' },
  { key: 'bulb', label: 'Ý tưởng', group: 'Khác', Icon: BulbOutlined, keywords: 'y tuong' },
  { key: 'compass', label: 'Du lịch', group: 'Khác', Icon: CompassOutlined, keywords: 'du lich' },
  { key: 'appstore', label: 'Khác', group: 'Khác', Icon: AppstoreOutlined, keywords: 'khac tong hop' }
];

const ICON_BY_KEY = new Map(CATEGORY_ICONS.map((item) => [item.key, item]));

export const findCategoryIcon = (key) => (key ? ICON_BY_KEY.get(key) || null : null);
