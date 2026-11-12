import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import useMediaQuery from '@mui/material/useMediaQuery';
import {
  Alert,
  Avatar,
  Badge,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import {
  SendOutlined,
  ShoppingOutlined,
  SearchOutlined,
  CheckCircleOutlined,
  PlusOutlined,
  MinusOutlined,
  DeleteOutlined,
  ReloadOutlined,
  MessageOutlined,
  LinkOutlined,
  QrcodeOutlined,
  UserOutlined,
  CheckOutlined,
  CopyOutlined,
  CloseOutlined,
  BulbOutlined,
  SwapOutlined
} from '@ant-design/icons';
import { getProducts, getProductById } from '../../services/productService';
import { api } from '../../services/http';
import { useAuth } from '../auth/AuthProvider';
import { useCrumbs } from '../../layouts/crumbs';
import { brand } from '../account/tokens';
import ShippingAddressFields from './ShippingAddressFields';
import { composeAddress, findPhoneInText, normalizePhone, parseAddressText, stripPhones } from './addressParser';

const EMPTY_ADDRESS = { province: null, ward: null, street: '' };

// Bảng màu chuẩn đồng nhất theo toàn bộ hệ thống THORS
const C = {
  text: '#202D42',
  muted: '#75869F',
  border: '#E5EBF2',
  main: '#8DE9F2',
  selected: '#DDF7FA',
  bg: '#F8FAFC',
  disabled: '#F0F3F7',
  success: '#1B7A43',
  danger: '#B42318'
};

// Nhãn đặt phía trên ô nhập (Design System) cho form "Thông tin người nhận"
const formLabelSx = { fontSize: 12.5, fontWeight: 600, color: '#1E293B', mb: 0.5 };
const formInputSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: '8px',
    fontSize: 12.5,
    '& fieldset': { borderColor: '#E2E8F0' },
    '&:hover fieldset': { borderColor: '#8EECF5' },
    '&.Mui-focused fieldset': { borderColor: '#8EECF5' }
  },
  '& .MuiFormHelperText-root': { mx: 0.25, fontSize: 11 }
};

const money = (value) => `${Number(value || 0).toLocaleString('vi-VN')} ₫`;
const getId = (p) => p?.productId ?? p?.id;
// Có thể bán = tồn − hàng đang giữ cho đơn chờ xác nhận (backend trả sellableQuantity); thiếu thì dùng tồn
const getStock = (v) => Number(v?.sellableQuantity ?? v?.stockQuantity ?? v?.stock ?? 0);
const getPrice = (v) => Number(v?.price ?? v?.salePrice ?? 0);

export default function FacebookPOSPage() {
  useCrumbs(['Bán hàng Facebook']);
  const { account } = useAuth();

  // Danh sách hội thoại và tin nhắn
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selectedPsid, setSelectedPsid] = useState(null);
  const [searchConv, setSearchConv] = useState('');
  const [replyText, setReplyText] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [loadingConv, setLoadingConv] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  // Sản phẩm trong kho THORS
  const [products, setProducts] = useState([]);
  const [searchProd, setSearchProd] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [variants, setVariants] = useState([]);
  const [loadingVariants, setLoadingVariants] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [cart, setCart] = useState([]);

  // Thông tin khách hàng chốt đơn & Validate
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  // Địa chỉ 3 phần (Tỉnh → Phường/Xã → Số nhà); chuỗi lưu vào đơn = "Số nhà, Phường/Xã, Tỉnh" như đơn web
  const [addressParts, setAddressParts] = useState(EMPTY_ADDRESS);
  const customerAddress = composeAddress(addressParts);
  // Kết quả kiểm tra địa chỉ trên bản đồ: { status, precision, matchedAddress, loading, address }
  const [addressCheck, setAddressCheck] = useState(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [orderSuccessMsg, setOrderSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Dialog hiển thị Mã QR VietQR PayOS
  const [qrModal, setQrModal] = useState({
    open: false,
    orderNumber: '',
    totalAmount: 0,
    qrImageUrl: '',
    payUrl: '',
    bankName: '',
    accountNumber: '',
    accountName: '',
    copied: false
  });

  const chatBoxRef = useRef(null);

  // ==========================================
  // VỪA KHÍT MÀN HÌNH (desktop): trang không cuộn, từng cột tự cuộn bên trong.
  // Chiều cao = phần còn trống từ đầu trang POS tới trên footer (trừ padding dưới của <main>),
  // tính lại khi đổi kích thước cửa sổ. Màn hình nhỏ (< md) giữ cuộn bình thường vì 3 cột xếp dọc.
  // ==========================================
  const rootRef = useRef(null);
  const isDesktop = useMediaQuery((theme) => theme.breakpoints.up('md'));
  const [fitHeight, setFitHeight] = useState(null);

  useLayoutEffect(() => {
    if (!isDesktop) {
      setFitHeight(null);
      return undefined;
    }

    const measure = () => {
      const el = rootRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const main = el.closest('main');
      const mainPaddingBottom = main ? parseFloat(window.getComputedStyle(main).paddingBottom) || 0 : 0;
      const footer = document.querySelector('footer');
      const footerHeight = footer ? footer.getBoundingClientRect().height : 0;
      // Tối thiểu 480px để vẫn dùng được trên màn hình thấp (khi đó trang cuộn nhẹ)
      setFitHeight(Math.max(480, Math.floor(window.innerHeight - top - mainPaddingBottom - footerHeight)));
    };

    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [isDesktop]);

  // 1. Tải danh sách hội thoại & tin nhắn từ Backend Webhook
  const fetchConversationsAndMessages = async () => {
    try {
      const [resMsgs, resConvs] = await Promise.all([api('/facebook/webhook/messages'), api('/facebook/webhook/conversations')]);

      const msgList = Array.isArray(resMsgs) ? resMsgs : [];
      const convList = Array.isArray(resConvs) ? resConvs : [];

      setMessages(msgList);
      setConversations(convList);
      setLastUpdated(new Date());

      // Nếu chưa chọn khách hàng nào và có khách gửi tin nhắn, tự động chọn khách đầu tiên (dùng functional update để không ghi đè khi đang chọn khách khác)
      setSelectedPsid((current) => {
        if (!current && convList.length > 0) {
          return convList[0].psid;
        }
        return current;
      });
    } catch (e) {
      // Bỏ qua lỗi polling nền
    }
  };

  // Đồng bộ thủ công toàn bộ lịch sử tin nhắn từ Facebook Graph API
  const handleManualSync = async () => {
    setLoadingConv(true);
    try {
      await api('/facebook/webhook/sync', { method: 'POST' });
    } catch (e) {
      // ignore
    } finally {
      await fetchConversationsAndMessages();
      setLoadingConv(false);
    }
  };

  // 2. Tải danh sách sản phẩm từ kho THORS
  useEffect(() => {
    getProducts()
      .then((res) => {
        const list = Array.isArray(res) ? res : (res?.data ?? []);
        setProducts(list.filter((p) => String(p?.status || '').toUpperCase() === 'ACTIVE'));
      })
      .catch(() => {});

    fetchConversationsAndMessages();

    // Thăm dò tin nhắn mới mỗi 3.5 giây (Real-time polling)
    const interval = setInterval(fetchConversationsAndMessages, 3500);
    return () => clearInterval(interval);
  }, []);

  // Khi chọn một sản phẩm, tải các biến thể (Size/Màu/Tồn kho)
  useEffect(() => {
    if (!selectedProduct) {
      setVariants([]);
      setSelectedVariant(null);
      return;
    }
    const pid = getId(selectedProduct);
    if (!pid) return;

    setLoadingVariants(true);
    getProductById(pid)
      .then((res) => {
        const vList = res?.variants ?? [];
        setVariants(vList);
        if (vList.length > 0) {
          // Ưu tiên chọn biến thể còn hàng
          const inStock = vList.find((v) => getStock(v) > 0) || vList[0];
          setSelectedVariant(inStock);
        } else {
          setSelectedVariant(null);
        }
      })
      .catch(() => {
        setVariants([]);
        setSelectedVariant(null);
      })
      .finally(() => setLoadingVariants(false));
  }, [selectedProduct]);

  // Chuyển đổi mốc thời gian sang millisecond để sắp xếp chuẩn xác 100%
  const parseMsgTime = (msg) => {
    if (msg.rawTime) {
      const d = new Date(msg.rawTime);
      if (!isNaN(d.getTime())) return d.getTime();
    }
    if (msg.timestamp && msg.timestamp.includes('/')) {
      try {
        const [timePart, datePart] = msg.timestamp.split(' ');
        if (datePart && timePart) {
          const [day, month, year] = datePart.split('/');
          const [hour, min, sec] = timePart.split(':');
          const d = new Date(year, month - 1, day, hour, min, sec);
          if (!isNaN(d.getTime())) return d.getTime();
        }
      } catch (ignored) {}
    }
    return 0;
  };

  // Tin nhắn lọc theo khách hàng đang chọn (sắp xếp tăng dần theo thời gian & khử trùng lặp)
  const currentChatMessages = useMemo(() => {
    if (!selectedPsid) return [];
    const list = messages.filter((m) => m.senderPsid === selectedPsid).sort((a, b) => parseMsgTime(a) - parseMsgTime(b));

    const unique = [];
    const seenKeys = new Set();
    for (const msg of list) {
      const key = msg.mid || `${msg.from}_${msg.text?.trim()}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      // Nếu là tin nhắn từ Shop, kiểm tra xem tin ngay trước đó có cùng nội dung không (tránh duplicate bubble)
      const prev = unique[unique.length - 1];
      if (prev && prev.from === msg.from && prev.text?.trim() === msg.text?.trim()) {
        const timeDiff = Math.abs(parseMsgTime(msg) - parseMsgTime(prev));
        if (timeDiff < 10000) continue; // trùng lặp nội dung trong vòng 10 giây
      }

      unique.push(msg);
    }
    return unique;
  }, [messages, selectedPsid]);

  // ==========================================
  // TỰ CUỘN KHUNG CHAT
  // Trang tải lại tin nhắn mỗi 3,5 giây; KHÔNG kéo về đáy mỗi lần tải (làm mất vị trí khi đang đọc tin cũ).
  // Chỉ cuộn xuống đáy khi: đổi khách hàng; shop vừa gửi tin; hoặc có tin mới và người dùng đang ở sát đáy.
  // Đang cuộn lên đọc tin cũ mà khách nhắn mới => hiện nút "↓ N tin nhắn mới" thay vì tự kéo xuống.
  // ==========================================
  const stickToBottomRef = useRef(true);
  const lastChatRef = useRef({ psid: null, count: 0, lastMid: null });
  const [atBottom, setAtBottom] = useState(true);
  const [unseenCount, setUnseenCount] = useState(0);

  const scrollChatToBottom = (smooth = false) => {
    const el = chatBoxRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    stickToBottomRef.current = true;
    setAtBottom(true);
    setUnseenCount(0);
  };

  const handleChatScroll = () => {
    const el = chatBoxRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stickToBottomRef.current = nearBottom;
    setAtBottom(nearBottom);
    if (nearBottom) setUnseenCount(0);
  };

  useEffect(() => {
    const prev = lastChatRef.current;
    const last = currentChatMessages[currentChatMessages.length - 1];
    const lastMid = last?.mid ?? null;
    const switched = prev.psid !== selectedPsid;
    const changed = !switched && lastMid !== prev.lastMid && currentChatMessages.length > 0;
    const added = Math.max(0, currentChatMessages.length - prev.count);

    lastChatRef.current = { psid: selectedPsid, count: currentChatMessages.length, lastMid };

    if (switched) {
      // Mở hội thoại khác: luôn bắt đầu ở tin mới nhất
      requestAnimationFrame(() => scrollChatToBottom(false));
      return;
    }
    if (!changed) return; // Lần tải lại không có tin mới => giữ nguyên vị trí cuộn

    if (stickToBottomRef.current || last?.from === 'SHOP') {
      requestAnimationFrame(() => scrollChatToBottom(true));
    } else if (added > 0) {
      setUnseenCount((count) => count + added);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChatMessages, selectedPsid]);

  // Ảnh (mã QR...) tải xong làm khung cao thêm: nếu đang ở đáy thì giữ ở đáy
  const handleChatImageLoad = () => {
    if (stickToBottomRef.current) scrollChatToBottom(false);
  };

  // Hiển thị link trong tin nhắn thành link bấm được, tự xuống dòng (không tràn ngang khung chat)
  const renderMessageText = (text) =>
    String(text)
      .split(/(https?:\/\/[^\s]+)/g)
      .map((part, idx) =>
        /^https?:\/\//.test(part) ? (
          <Box
            key={idx}
            component="a"
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
            sx={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 2, wordBreak: 'break-all' }}
          >
            {part}
          </Box>
        ) : (
          part
        )
      );

  // Cuộc trò chuyện của khách đang chọn
  const activeConversation = useMemo(() => {
    return conversations.find((c) => c.psid === selectedPsid);
  }, [conversations, selectedPsid]);

  // Quét thông minh số điện thoại từ các tin nhắn khách hàng gửi đến
  // (nhận cả "0566 238 971", "+84 566.238.971"...; kết quả đã chuẩn hóa về 0xxxxxxxxx)
  const detectedPhone = useMemo(() => {
    if (!currentChatMessages.length) return null;
    for (let i = currentChatMessages.length - 1; i >= 0; i--) {
      const msg = currentChatMessages[i];
      if (msg.from === 'CUSTOMER' && msg.text) {
        const phone = findPhoneInText(msg.text);
        if (phone) return phone;
      }
    }
    return null;
  }, [currentChatMessages]);

  // Quét thông minh Địa chỉ giao hàng từ tin nhắn của khách
  const detectedAddress = useMemo(() => {
    if (!currentChatMessages.length) return null;

    const addressKeywords = [
      'địa chỉ',
      'đc:',
      'dc:',
      'ship về',
      'ship đến',
      'giao đến',
      'giao về',
      'giao ở',
      'ở tại',
      'em ở',
      'mình ở',
      'đường',
      'phố',
      'ngõ',
      'ngách',
      'hẻm',
      'số nhà',
      'tòa nhà',
      'chung cư',
      'phường',
      'xã',
      'thị trấn',
      'quận',
      'huyện',
      'thị xã',
      'tp.',
      'tp ',
      'hà nội',
      'hồ chí minh',
      'hcm',
      'sài gòn',
      'đà nẵng',
      'hải phòng',
      'cần thơ',
      'bắc ninh',
      'bắc giang',
      'nam định',
      'thái bình',
      'quảng ninh',
      'hải dương',
      'thanh hóa',
      'nghệ an',
      'bình dương',
      'đồng nai',
      'vĩnh phúc',
      'phú thọ'
    ];

    for (let i = currentChatMessages.length - 1; i >= 0; i--) {
      const msg = currentChatMessages[i];
      if (msg.from === 'CUSTOMER' && msg.text) {
        const textLower = msg.text.toLowerCase().trim();
        if (textLower.length < 8) continue;

        const withoutPhone = stripPhones(msg.text).replace(/\s+/g, ' ').trim();
        const hasKeyword = addressKeywords.some((kw) => textLower.includes(kw));

        if (hasKeyword && withoutPhone.length >= 6) {
          let cleanAddr = withoutPhone
            .replace(/^(địa chỉ|đc|dc|ship về|ship đến|giao đến|giao về|giao qua|giao ở|mình ở|em ở|nhà ở)[\s:,-]+/i, '')
            .trim();
          if (cleanAddr.length >= 6) {
            return cleanAddr;
          }
        }
      }
    }
    return null;
  }, [currentChatMessages]);

  // Quét thông minh sản phẩm khách hoặc shop nhắc đến trong tin nhắn chat
  const detectedProductSuggestion = useMemo(() => {
    if (!products.length || !currentChatMessages.length) return null;
    const recent = currentChatMessages.slice(-6);
    for (let i = recent.length - 1; i >= 0; i--) {
      const text = (recent[i].text || '').toLowerCase();
      if (!text || text.length < 3) continue;

      for (const p of products) {
        const pName = (p.productName || '').toLowerCase();
        if (pName && text.includes(pName)) {
          return {
            product: p,
            rawText: recent[i].text
          };
        }
      }
    }
    return null;
  }, [products, currentChatMessages]);

  // Bộ lọc tìm kiếm nhanh sản phẩm
  const filteredProducts = useMemo(() => {
    if (!products || !products.length) return [];
    if (!searchProd.trim()) return products.slice(0, 10);
    const kw = searchProd.toLowerCase().trim();
    return products.filter((p) => (p.productName || '').toLowerCase().includes(kw));
  }, [products, searchProd]);

  // Kiểm tra tính hợp lệ dữ liệu (Validation)
  const nameValid = Boolean(customerName && customerName.trim().length >= 2);
  const phoneValid = normalizePhone(customerPhone) !== null;
  const addressValid = Boolean(addressParts.province && addressParts.ward && addressParts.street.trim().length >= 2);
  const cartValid = cart.length > 0;

  // Tách địa chỉ khách nhắn (vd. "12 Lê Lợi, P. Bến Thành, Sài Gòn") thành Tỉnh / Phường / Số nhà rồi điền form.
  // psid: chỉ điền nếu nhân viên vẫn đang ở đúng hội thoại đó khi tách xong (tách cần tải danh sách địa giới).
  const selectedPsidRef = useRef(selectedPsid);
  selectedPsidRef.current = selectedPsid;

  // Form đang hiện địa chỉ tự điền từ tin nhắn nào (null = chưa điền), hoặc 'MANUAL' nếu nhân viên đã sửa tay.
  // Còn tự điền => khách nhắn địa chỉ mới thì tự cập nhật theo tin mới nhất; đã sửa tay => không ghi đè,
  // chỉ báo "Có địa chỉ mới trong tin nhắn" để nhân viên bấm điền khi muốn.
  const addressSourceRef = useRef(null);
  const [addressManual, setAddressManual] = useState(false);
  const [newAddressInChat, setNewAddressInChat] = useState(false);
  // Tương tự cho SĐT
  const phoneManualRef = useRef(false);

  const applyAddressText = async (text, psid = selectedPsid) => {
    const parsed = await parseAddressText(text);
    if (selectedPsidRef.current !== psid) return;
    setAddressParts(parsed);
    addressSourceRef.current = text;
    setAddressManual(false);
    setNewAddressInChat(false);
  };

  const editAddressManually = (next) => {
    setAddressParts(next);
    addressSourceRef.current = 'MANUAL';
    setAddressManual(true);
  };

  const editPhoneManually = (value) => {
    setCustomerPhone(value);
    phoneManualRef.current = true;
  };

  // Tự động điền thông tin khách hàng khi chọn hoặc chuyển đổi cuộc hội thoại
  useEffect(() => {
    setAddressCheck(null);
    if (!selectedPsid) {
      setCustomerName('');
      setCustomerPhone('');
      setAddressParts(EMPTY_ADDRESS);
      return;
    }

    if (activeConversation?.name && !activeConversation.name.startsWith('Khách FB #')) {
      setCustomerName(activeConversation.name);
    } else {
      setCustomerName(`Khách hàng FB (#${selectedPsid.slice(-6)})`);
    }

    setCustomerPhone(detectedPhone || '');
    phoneManualRef.current = false;
    setAddressParts(EMPTY_ADDRESS);
    addressSourceRef.current = null;
    setAddressManual(false);
    setNewAddressInChat(false);
    if (detectedAddress) applyAddressText(detectedAddress, selectedPsid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPsid]);

  // Kiểm tra địa chỉ trên bản đồ khi đã đủ Tỉnh + Phường + Số nhà (chờ ngừng gõ 0,8 giây).
  // Cùng dịch vụ mà bước Owner xác nhận đơn dùng: không tìm thấy => cảnh báo ngay khi chốt đơn.
  useEffect(() => {
    if (!addressValid) {
      setAddressCheck(null);
      return undefined;
    }
    const address = customerAddress;
    setAddressCheck({ loading: true, address });
    const timer = setTimeout(async () => {
      try {
        const result = await api(`/facebook/webhook/address-check?address=${encodeURIComponent(address)}`);
        setAddressCheck((current) => (current?.address === address ? { ...result, address, loading: false } : current));
      } catch (err) {
        // Lỗi gọi API của THORS (khác với "dịch vụ bản đồ không phản hồi" do backend trả về)
        const message =
          err?.status === 404
            ? 'Backend chưa có chức năng kiểm tra địa chỉ — hãy khởi động lại backend bản mới.'
            : err?.message || 'Không gọi được máy chủ THORS.';
        setAddressCheck((current) => (current?.address === address ? { status: 'ERROR', message, address, loading: false } : current));
      }
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerAddress, addressValid]);

  useEffect(() => {
    if (activeConversation?.name && !activeConversation.name.startsWith('Khách FB #')) {
      setCustomerName(activeConversation.name);
    }
  }, [activeConversation?.name]);

  // Khách nhắn SĐT mới: tự cập nhật nếu nhân viên chưa sửa tay ô SĐT (đã sửa tay => vẫn có chip "Dùng SĐT trong chat")
  useEffect(() => {
    if (detectedPhone && (!customerPhone || !phoneManualRef.current)) {
      setCustomerPhone(detectedPhone);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detectedPhone]);

  // Khách nhắn địa chỉ mới: tự điền lại nếu form đang là địa chỉ tự điền; đã sửa tay => chỉ báo có địa chỉ mới
  useEffect(() => {
    if (!detectedAddress || addressSourceRef.current === detectedAddress) return;
    if (addressSourceRef.current === 'MANUAL') {
      setNewAddressInChat(true);
      return;
    }
    applyAddressText(detectedAddress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detectedAddress]);

  // Thêm sản phẩm vào giỏ chốt đơn
  const addToCart = () => {
    if (!selectedProduct || !selectedVariant) return;
    const vId = selectedVariant.detailId ?? selectedVariant.variantId ?? selectedVariant.id;
    const stock = getStock(selectedVariant);

    if (stock <= 0) {
      setErrorMsg('Biến thể này hiện đã hết hàng trong kho!');
      return;
    }

    setCart((prev) => {
      const idx = prev.findIndex((item) => item.variantId === vId);
      if (idx >= 0) {
        if (prev[idx].quantity >= stock) {
          setErrorMsg('Số lượng vượt quá tồn kho thực tế!');
          return prev;
        }
        const updated = [...prev];
        updated[idx] = { ...updated[idx], quantity: updated[idx].quantity + 1 };
        return updated;
      }
      return [
        ...prev,
        {
          productId: getId(selectedProduct),
          productName: selectedProduct.productName,
          variantId: vId,
          size: selectedVariant.size,
          color: selectedVariant.color,
          price: getPrice(selectedVariant),
          stock,
          quantity: 1
        }
      ];
    });
    setErrorMsg('');
  };

  const updateQuantity = (variantId, delta) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.variantId === variantId) {
            const nextQty = item.quantity + delta;
            if (nextQty <= 0) return null;
            if (nextQty > item.stock) {
              setErrorMsg('Không thể tăng thêm do vượt quá tồn kho!');
              return item;
            }
            return { ...item, quantity: nextQty };
          }
          return item;
        })
        .filter(Boolean)
    );
  };

  const removeFromCart = (variantId) => {
    setCart((prev) => prev.filter((item) => item.variantId !== variantId));
  };

  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }, [cart]);

  // 3. Gửi tin nhắn trả lời khách hàng qua Messenger API
  const handleSendMessage = async (textToSend) => {
    const text = textToSend || replyText;
    if (!text.trim() || !selectedPsid || sendingMsg) return;

    setSendingMsg(true);
    setErrorMsg('');
    const targetPsid = selectedPsid;
    try {
      const now = new Date();
      const sendRes = await api('/facebook/webhook/send', {
        method: 'POST',
        body: {
          recipientPsid: targetPsid,
          message: text.trim()
        }
      });

      if (sendRes && sendRes.success === false) {
        setErrorMsg(sendRes.error || 'Không thể gửi tin nhắn qua Facebook.');
        return;
      }

      // Hiển thị ngay lập tức tin nhắn của Shop vào khung chat
      const localMsg = {
        mid: 'local_' + Date.now(),
        senderPsid: targetPsid,
        senderName: 'THORS',
        text: text.trim(),
        rawTime: now.toISOString(),
        timestamp: now.toLocaleTimeString('vi-VN') + ' ' + now.toLocaleDateString('vi-VN'),
        from: 'SHOP'
      };
      setMessages((prev) => [...prev, localMsg]);
      setReplyText('');
      await fetchConversationsAndMessages();
    } catch (e) {
      setErrorMsg('Không thể gửi tin nhắn qua Facebook: ' + (e.message || 'Lỗi mạng'));
    } finally {
      setSendingMsg(false);
    }
  };

  // 4. Chốt đơn & Tự động tạo link PayOS + Mã VietQR gửi vào Messenger cho khách
  const handleCreateOrderAndSendPayOS = async () => {
    setSubmitAttempted(true);

    if (!selectedPsid) {
      setErrorMsg('Chưa chọn khách hàng Facebook để gửi link đơn!');
      return;
    }
    if (!nameValid) {
      setErrorMsg('Vui lòng nhập họ tên người nhận (tối thiểu 2 ký tự)!');
      return;
    }
    if (!phoneValid) {
      setErrorMsg('Số điện thoại không hợp lệ! Vui lòng nhập đúng 10 số di động (ví dụ: 0987654321).');
      return;
    }
    if (!addressValid) {
      setErrorMsg('Vui lòng chọn Tỉnh/Thành phố, Phường/Xã và nhập số nhà, tên đường!');
      return;
    }
    if (!cartValid) {
      setErrorMsg('Vui lòng chọn ít nhất 1 sản phẩm vào đơn hàng!');
      return;
    }
    // Địa chỉ không có trên bản đồ: Owner sẽ bị chặn khi xác nhận đơn => hỏi lại trước khi tạo
    if (
      addressCheck?.status === 'NOT_FOUND' &&
      !window.confirm(
        'Địa chỉ này không tìm thấy trên bản đồ, chủ shop sẽ không xác nhận được đơn cho tới khi sửa địa chỉ.\n\nVẫn tạo đơn?'
      )
    ) {
      return;
    }

    const phone = normalizePhone(customerPhone);
    setCustomerPhone(phone);
    setCreatingOrder(true);
    setErrorMsg('');
    setOrderSuccessMsg('');

    try {
      // Bước A: Tạo đơn hàng (chờ xác nhận) và GIỮ hàng; chủ shop xác nhận đơn mới trừ kho
      const orderResult = await api('/facebook/webhook/order', {
        method: 'POST',
        body: {
          items: cart.map((line) => ({
            detailId: line.variantId,
            quantity: line.quantity
          })),
          customerName: customerName.trim(),
          customerPhone: phone,
          customerAddress,
          psid: selectedPsid,
          paymentMethod: 'ONLINE'
        }
      });

      const orderId = orderResult?.orderId;
      const orderNumber = orderResult?.orderNumber || `#${orderId}`;
      const totalAmount = orderResult?.totalAmount || cartTotal;

      // Bước B: Thử tạo link thanh toán PayOS thật & Mã VietQR
      const trackingUrl = `${window.location.origin}/tracking/${encodeURIComponent(orderNumber)}`;
      let payUrl = trackingUrl;
      let qrImageUrl = '';
      let bankInfo = null;

      try {
        const payRes = await api('/payment/payos/create-link', {
          method: 'POST',
          body: { orderId }
        });
        if (payRes?.checkoutUrl) {
          payUrl = payRes.checkoutUrl;
        }
        if (payRes?.bin && payRes?.accountNumber) {
          const desc = `DH ${orderNumber.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20)}`;
          qrImageUrl = `https://img.vietqr.io/image/${payRes.bin}-${payRes.accountNumber}-compact2.png?amount=${payRes.amount || totalAmount}&addInfo=${encodeURIComponent(desc)}&accountName=${encodeURIComponent(payRes.accountName || 'THORS')}`;
          bankInfo = {
            bin: payRes.bin,
            accountNumber: payRes.accountNumber,
            accountName: payRes.accountName || 'THORS'
          };
        }
      } catch (ignored) {
        // Fallback tạo mã QR dẫn thẳng vào trang theo dõi đơn hàng công khai
        qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(payUrl)}`;
      }

      // Bước C: Tạo tin nhắn xác nhận kèm thông tin thanh toán VietQR / PayOS và link theo dõi
      const paymentMsg =
        `🎉 Cảm ơn bạn đã đặt hàng tại THORS!\n\n` +
        `📦 THÔNG TIN ĐƠN HÀNG ${orderNumber}:\n` +
        cart.map((c) => ` • ${c.productName} (${c.size}/${c.color}) x${c.quantity} : ${money(c.price * c.quantity)}`).join('\n') +
        `\n\n💵 TỔNG CỘNG: ${money(totalAmount)}\n` +
        `📍 Địa chỉ nhận hàng: ${customerAddress}\n` +
        `📞 SĐT: ${phone}\n` +
        `\n💳 Bạn vui lòng quét mã VietQR hình bên dưới hoặc truy cập link sau để thanh toán online:\n` +
        `${payUrl}\n\n` +
        `🔍 Theo dõi hành trình giao hàng & yêu cầu đổi trả online tại:\n` +
        `${trackingUrl}\n\n` +
        `Shop sẽ đóng gói và giao hàng ngay khi nhận được thanh toán ạ! ❤️`;

      // Bước D: Bắn tin nhắn qua Messenger cho khách hàng
      let sendSuccess = true;
      let sendWarningMsg = '';
      try {
        const sendRes = await api('/facebook/webhook/send', {
          method: 'POST',
          body: {
            recipientPsid: selectedPsid,
            message: paymentMsg
          }
        });
        if (sendRes && sendRes.success === false) {
          sendSuccess = false;
          sendWarningMsg = sendRes.error || '';
        }
      } catch (err) {
        sendSuccess = false;
        sendWarningMsg = err.message || '';
      }

      // Bước E: Gửi trực tiếp ảnh Mã QR VietQR vào Messenger cho khách hàng
      if (qrImageUrl && sendSuccess) {
        try {
          await api('/facebook/webhook/send-image', {
            method: 'POST',
            body: {
              recipientPsid: selectedPsid,
              imageUrl: qrImageUrl
            }
          });
        } catch (ignored) {}
      }

      // Mở modal hiển thị mã QR VietQR trên màn hình Web POS để nhân viên đối soát
      setQrModal({
        open: true,
        orderNumber,
        totalAmount,
        qrImageUrl,
        payUrl,
        bankName: bankInfo ? `Ngân hàng (BIN: ${bankInfo.bin})` : 'VietQR / PayOS',
        accountNumber: bankInfo?.accountNumber || '',
        accountName: bankInfo?.accountName || 'THORS',
        copied: false
      });

      if (sendSuccess) {
        setOrderSuccessMsg(
          `Tạo đơn ${orderNumber} thành công, đã giữ hàng và gửi link + mã QR cho khách. Đơn đang chờ chủ shop xác nhận ở mục "Đơn hàng" (xác nhận mới trừ kho).`
        );
      } else {
        setOrderSuccessMsg(
          `Tạo đơn ${orderNumber} thành công, đã giữ hàng. Đơn đang chờ chủ shop xác nhận ở mục "Đơn hàng" (xác nhận mới trừ kho).`
        );
        setErrorMsg(
          `Chưa gửi được tin nhắn Messenger: ${sendWarningMsg || 'Khách đã quá 24h chưa nhắn tin cho Page, vui lòng bảo khách gửi 1 tin vào Page để nhận tin nhắn!'}`
        );
      }
      setCart([]);
      setSubmitAttempted(false);
      await fetchConversationsAndMessages();
    } catch (e) {
      setErrorMsg('Lỗi tạo đơn: ' + (e.message || 'Vui lòng thử lại'));
    } finally {
      setCreatingOrder(false);
    }
  };

  // Mẫu câu trả lời nhanh tiện lợi
  const quickReplies = [
    'Dạ chào bạn! THORS có thể hỗ trợ gì cho bạn ạ?',
    'Mẫu này bên shop đang có sẵn đủ Size và Màu nha bạn!',
    'Dạ bạn cho shop xin Số điện thoại và Địa chỉ nhận hàng nhé!'
  ];

  return (
    <Box
      ref={rootRef}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        // Desktop: cao đúng phần màn hình còn trống => không cuộn cả trang
        height: fitHeight ?? 'auto'
      }}
    >
      {/* Tiêu đề trang & Thanh trạng thái kết nối Fanpage */}
      <Stack
        direction="row"
        sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1.5, flexShrink: 0, gap: 2, flexWrap: 'wrap' }}
      >
        <Box>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <Typography variant="h4" sx={{ fontWeight: 800, color: C.text, fontSize: 22 }}>
              Bán Hàng Qua Facebook (Social POS)
            </Typography>
            <Chip
              icon={<CheckCircleOutlined style={{ color: C.success }} />}
              label="Fanpage THORS: Đang kết nối"
              size="small"
              sx={{
                bgcolor: '#DCFCE7',
                color: C.success,
                fontWeight: 700,
                fontSize: 12,
                borderRadius: '8px'
              }}
            />
          </Stack>
          <Typography variant="caption" sx={{ color: C.muted }}>
            Đồng bộ tin nhắn Messenger • Chốt đơn giữ hàng, chủ shop xác nhận mới trừ kho • Tự động gửi link thanh toán PayOS
          </Typography>
        </Box>

        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Typography variant="caption" sx={{ color: C.muted }}>
            Cập nhật: {lastUpdated.toLocaleTimeString('vi-VN')}
          </Typography>
          <Tooltip title="Đồng bộ toàn bộ tin nhắn từ Facebook">
            <IconButton
              onClick={handleManualSync}
              size="small"
              disabled={loadingConv}
              sx={{ bgcolor: '#fff', border: `1px solid ${C.border}` }}
            >
              <ReloadOutlined spin={loadingConv} style={{ fontSize: 13 }} />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      {/* Thông báo thành công / lỗi */}
      {orderSuccessMsg && (
        <Alert severity="success" sx={{ mb: 1.5, py: 0.25, borderRadius: 2, flexShrink: 0 }} onClose={() => setOrderSuccessMsg('')}>
          {orderSuccessMsg}
        </Alert>
      )}
      {errorMsg && (
        <Alert severity="error" sx={{ mb: 1.5, py: 0.25, borderRadius: 2, flexShrink: 0 }} onClose={() => setErrorMsg('')}>
          {errorMsg}
        </Alert>
      )}

      {/* Bố cục 3 Cột chuẩn Sapo / Pancake POS — chiếm hết phần còn lại, mỗi cột tự cuộn */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '280px minmax(0, 1fr) 360px', xl: '320px minmax(0, 1fr) 400px' },
          gridTemplateRows: { md: 'minmax(0, 1fr)' },
          gap: 2,
          flex: 1,
          minHeight: 0,
          // Cho phép từng cột co lại theo chiều cao khung (nội dung cuộn bên trong cột)
          '& > *': { minHeight: 0 },
          // Màn hình nhỏ: 3 cột xếp dọc, mỗi cột cao cố định để vẫn chat / lên đơn được
          '& > .MuiCard-root': { height: { xs: '75vh', md: 'auto' } }
        }}
      >
        {/* ==================== CỘT 1: DANH SÁCH KHÁCH HÀNG / HỘI THOẠI ==================== */}
        <Card
          sx={{
            bgcolor: '#fff',
            borderRadius: '14px',
            border: `1px solid ${C.border}`,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
        >
          <Box sx={{ p: 1.75, borderBottom: `1px solid ${C.border}` }}>
            <Typography sx={{ fontWeight: 800, fontSize: 14, color: C.text, mb: 1 }}>
              Hội thoại Messenger ({conversations.length})
            </Typography>
            <TextField
              fullWidth
              size="small"
              placeholder="Tìm khách hàng..."
              value={searchConv}
              onChange={(e) => setSearchConv(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchOutlined style={{ color: C.muted }} />
                  </InputAdornment>
                ),
                sx: { borderRadius: '8px', fontSize: 13, bgcolor: '#F8FAFC' }
              }}
            />
          </Box>

          <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 1 }}>
            {conversations.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 6, px: 2 }}>
                <MessageOutlined style={{ fontSize: 32, color: '#CBD5E1', marginBottom: 8 }} />
                <Typography sx={{ fontSize: 13, color: C.muted, fontWeight: 600 }}>Chưa có tin nhắn mới từ Fanpage</Typography>
                <Typography sx={{ fontSize: 11, color: C.muted, mt: 0.5 }}>Gửi tin nhắn vào Page THORS để bắt đầu hội thoại!</Typography>
              </Box>
            ) : (
              conversations
                .filter(
                  (c) =>
                    !searchConv ||
                    c.psid.includes(searchConv) ||
                    (c.name && c.name.toLowerCase().includes(searchConv.toLowerCase())) ||
                    (c.lastMessage && c.lastMessage.toLowerCase().includes(searchConv.toLowerCase()))
                )
                .map((c) => {
                  const isSelected = selectedPsid === c.psid;
                  return (
                    <Box
                      key={c.psid}
                      onClick={() => setSelectedPsid(c.psid)}
                      sx={{
                        p: 1.5,
                        mb: 1,
                        borderRadius: '10px',
                        cursor: 'pointer',
                        border: `1px solid ${isSelected ? C.main : 'transparent'}`,
                        bgcolor: isSelected ? C.selected : '#fff',
                        transition: 'all 0.15s ease',
                        '&:hover': { bgcolor: isSelected ? C.selected : '#F1F5F9' }
                      }}
                    >
                      <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
                        <Avatar src={c.avatar} sx={{ bgcolor: isSelected ? '#087F8C' : '#94A3B8', width: 38, height: 38, fontSize: 14 }}>
                          {c.name ? c.name[0] : <UserOutlined />}
                        </Avatar>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography sx={{ fontWeight: 700, fontSize: 13, color: C.text }}>
                              {c.name || `Khách FB #${c.psid.slice(-6)}`}
                            </Typography>
                            <Typography sx={{ fontSize: 10, color: C.muted }}>{c.lastTimestamp?.split(' ')[0] || ''}</Typography>
                          </Stack>
                          <Typography
                            sx={{
                              fontSize: 12,
                              color: C.muted,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              mt: 0.25
                            }}
                          >
                            {c.lastMessage || 'Hình ảnh / tệp đính kèm'}
                          </Typography>
                        </Box>
                      </Stack>
                    </Box>
                  );
                })
            )}
          </Box>
        </Card>

        {/* ==================== CỘT 2: KHUNG CHAT TRỰC TIẾP 2 CHIỀU ==================== */}
        <Card
          sx={{
            bgcolor: '#fff',
            borderRadius: '14px',
            border: `1px solid ${C.border}`,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
        >
          {/* Header khung chat */}
          <Box sx={{ p: 1.75, borderBottom: `1px solid ${C.border}`, bgcolor: '#FAFAFA' }}>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
                <Avatar src={activeConversation?.avatar} sx={{ bgcolor: '#087F8C', width: 34, height: 34, fontSize: 13 }}>
                  {activeConversation?.name ? activeConversation.name[0] : <UserOutlined />}
                </Avatar>
                <Box>
                  <Typography sx={{ fontWeight: 800, fontSize: 14, color: C.text }}>
                    {activeConversation?.name || (selectedPsid ? `Khách hàng Facebook (#${selectedPsid})` : 'Chọn khách hàng để chat')}
                  </Typography>
                  <Typography sx={{ fontSize: 11, color: C.success, fontWeight: 600 }}>● Đang trực tuyến qua Messenger</Typography>
                </Box>
              </Stack>
            </Stack>
          </Box>

          {/* Danh sách tin nhắn */}
          <Box sx={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <Box
              ref={chatBoxRef}
              onScroll={handleChatScroll}
              sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', p: 2, bgcolor: '#F8FAFC' }}
            >
              {!selectedPsid ? (
                <Box sx={{ textAlign: 'center', py: 10 }}>
                  <Typography sx={{ color: C.muted, fontSize: 13 }}>Vui lòng chọn một cuộc trò chuyện ở cột bên trái</Typography>
                </Box>
              ) : currentChatMessages.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 10 }}>
                  <Typography sx={{ color: C.muted, fontSize: 13 }}>Chưa có lịch sử tin nhắn với khách hàng này</Typography>
                </Box>
              ) : (
                currentChatMessages.map((msg, i) => {
                  const isShop = msg.from === 'SHOP';
                  return (
                    <Box
                      key={msg.mid || i}
                      sx={{
                        display: 'flex',
                        justifyContent: isShop ? 'flex-end' : 'flex-start',
                        mb: 1.75
                      }}
                    >
                      <Box sx={{ maxWidth: '75%', minWidth: 0 }}>
                        <Box
                          sx={{
                            p: 1.5,
                            borderRadius: isShop ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                            bgcolor: isShop ? C.main : '#fff',
                            color: isShop ? '#0E3A41' : C.text,
                            border: isShop ? '1px solid #74DCE7' : `1px solid ${C.border}`,
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                            whiteSpace: 'pre-wrap',
                            // Link / chuỗi dài tự xuống dòng thay vì làm tràn ngang khung chat
                            overflowWrap: 'anywhere',
                            wordBreak: 'break-word',
                            fontSize: 13.5,
                            lineHeight: 1.45
                          }}
                        >
                          {msg.imageUrl && (
                            <Box
                              component="img"
                              src={msg.imageUrl}
                              alt="Hình ảnh"
                              onLoad={handleChatImageLoad}
                              sx={{
                                maxWidth: '100%',
                                maxHeight: 220,
                                borderRadius: '8px',
                                mb: msg.text ? 1 : 0,
                                display: 'block'
                              }}
                            />
                          )}
                          {msg.text ? renderMessageText(msg.text) : msg.imageUrl ? '' : '👍 [Nhãn dán / Hình ảnh]'}
                        </Box>
                        <Typography
                          sx={{
                            fontSize: 10,
                            color: C.muted,
                            mt: 0.4,
                            textAlign: isShop ? 'right' : 'left'
                          }}
                        >
                          {isShop ? 'Shop THORS' : msg.senderName || 'Khách hàng'} • {msg.timestamp || ''}
                        </Typography>
                      </Box>
                    </Box>
                  );
                })
              )}
            </Box>

            {/* Nút xuống tin mới nhất: hiện khi đang cuộn lên đọc tin cũ */}
            {selectedPsid && !atBottom && (
              <Button
                size="small"
                onClick={() => scrollChatToBottom(true)}
                sx={{
                  position: 'absolute',
                  bottom: 12,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  zIndex: 2,
                  textTransform: 'none',
                  fontSize: 12.5,
                  fontWeight: 700,
                  px: 1.75,
                  py: 0.5,
                  borderRadius: 99,
                  bgcolor: unseenCount > 0 ? C.main : '#fff',
                  color: '#0F172A',
                  border: `1px solid ${unseenCount > 0 ? '#74DCE7' : C.border}`,
                  boxShadow: '0 4px 12px rgba(15, 23, 42, 0.12)',
                  '&:hover': { bgcolor: unseenCount > 0 ? '#76E5EF' : '#F8FAFC' }
                }}
              >
                {unseenCount > 0 ? `↓ ${unseenCount} tin nhắn mới` : '↓ Tin mới nhất'}
              </Button>
            )}
          </Box>

          {/* Các nút trả lời nhanh */}
          <Box sx={{ px: 1.5, pt: 1, bgcolor: '#fff', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {quickReplies.map((qr, index) => (
              <Chip
                key={index}
                label={qr}
                size="small"
                clickable
                onClick={() => handleSendMessage(qr)}
                sx={{
                  fontSize: 11,
                  bgcolor: '#F1F5F9',
                  borderRadius: '6px',
                  '&:hover': { bgcolor: C.selected }
                }}
              />
            ))}
          </Box>

          {/* Ô nhập tin nhắn */}
          <Box sx={{ p: 1.5, bgcolor: '#fff' }}>
            <Stack direction="row" spacing={1}>
              <TextField
                fullWidth
                size="small"
                placeholder={selectedPsid ? 'Nhập tin nhắn phản hồi cho khách...' : 'Chọn khách để gửi tin...'}
                disabled={!selectedPsid || sendingMsg}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: 13 } }}
              />
              <Button
                variant="contained"
                disabled={!selectedPsid || !replyText.trim() || sendingMsg}
                onClick={() => handleSendMessage()}
                sx={{
                  bgcolor: '#087F8C',
                  color: '#fff',
                  borderRadius: '10px',
                  minWidth: 48,
                  px: 2,
                  '&:hover': { bgcolor: '#066670' }
                }}
              >
                {sendingMsg ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : <SendOutlined />}
              </Button>
            </Stack>
          </Box>
        </Card>

        {/* ==================== CỘT 3: WIDGET CHỐT ĐƠN & GỬI LINK PAYOS ==================== */}
        <Card
          sx={{
            bgcolor: '#fff',
            borderRadius: '14px',
            border: `1px solid ${C.border}`,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
        >
          <Box sx={{ p: 1.75, borderBottom: `1px solid ${C.border}`, bgcolor: '#FAFAFA' }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <ShoppingOutlined style={{ fontSize: 18, color: '#087F8C' }} />
              <Typography sx={{ fontWeight: 800, fontSize: 14, color: C.text }}>Tạo Đơn Hàng Nhanh (Social POS)</Typography>
            </Stack>
          </Box>

          <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 2 }}>
            {/* 1. Thông tin giao hàng */}
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: C.text, mb: 1 }}>1. Thông tin người nhận</Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, mb: 2 }}>
              {/* Họ tên */}
              <Box>
                <Typography sx={formLabelSx}>
                  Họ tên người nhận{' '}
                  <Box component="span" sx={{ color: C.danger }}>
                    *
                  </Box>
                </Typography>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="VD: Nguyễn Văn A"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  error={submitAttempted && !nameValid}
                  helperText={submitAttempted && !nameValid ? 'Nhập họ tên (tối thiểu 2 ký tự)' : ''}
                  slotProps={{ htmlInput: { maxLength: 100 } }}
                  sx={formInputSx}
                />
              </Box>

              {/* Số điện thoại: nhận mọi kiểu viết, tự chuẩn hóa khi rời ô */}
              <Box>
                <Typography sx={formLabelSx}>
                  Số điện thoại{' '}
                  <Box component="span" sx={{ color: C.danger }}>
                    *
                  </Box>
                </Typography>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="VD: 0912 345 678"
                  value={customerPhone}
                  onChange={(e) => editPhoneManually(e.target.value)}
                  onBlur={() => {
                    const phone = normalizePhone(customerPhone);
                    if (phone) setCustomerPhone(phone);
                  }}
                  error={(submitAttempted || customerPhone.replace(/\D/g, '').length >= 10) && !phoneValid}
                  helperText={
                    (submitAttempted || customerPhone.replace(/\D/g, '').length >= 10) && !phoneValid
                      ? 'SĐT di động 10 số, đầu 03/05/07/08/09 (VD: 0912345678)'
                      : ''
                  }
                  slotProps={{ htmlInput: { inputMode: 'tel', maxLength: 20 } }}
                  sx={formInputSx}
                />
                {detectedPhone && normalizePhone(customerPhone) !== detectedPhone && (
                  <Chip
                    size="small"
                    label={`Dùng SĐT trong chat: ${detectedPhone}`}
                    onClick={() => {
                      setCustomerPhone(detectedPhone);
                      phoneManualRef.current = false;
                    }}
                    sx={{ mt: 0.5, fontSize: 11, cursor: 'pointer', bgcolor: '#E0F2FE', color: '#0E7490', fontWeight: 600 }}
                  />
                )}
              </Box>

              {/* Địa chỉ 3 phần + kiểm tra bản đồ */}
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 0.75 }}>
                  <Typography sx={{ ...formLabelSx, mb: 0 }}>Địa chỉ giao hàng</Typography>
                  {detectedAddress && (addressManual || addressSourceRef.current !== detectedAddress) && (
                    <Tooltip title={`Tách địa chỉ khách nhắn: "${detectedAddress}"`}>
                      <Chip
                        size="small"
                        label={newAddressInChat ? 'Có địa chỉ mới trong tin nhắn — điền' : 'Điền lại từ tin nhắn'}
                        onClick={() => applyAddressText(detectedAddress)}
                        sx={{
                          fontSize: 11,
                          cursor: 'pointer',
                          bgcolor: '#FFF7AE',
                          color: '#713F12',
                          fontWeight: newAddressInChat ? 700 : 600,
                          border: newAddressInChat ? '1px solid #EAB308' : 'none'
                        }}
                      />
                    </Tooltip>
                  )}
                </Box>
                <ShippingAddressFields
                  value={addressParts}
                  onChange={editAddressManually}
                  showErrors={submitAttempted}
                  check={addressCheck}
                />
              </Box>
            </Box>

            <Divider sx={{ my: 1.5, borderColor: C.border }} />

            {/* 2. Chọn sản phẩm từ Kho THORS */}
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: C.text, mb: 1 }}>2. Chọn sản phẩm từ kho THORS</Typography>

            {/* Gợi ý thông minh khi phát hiện tên sản phẩm trong đoạn chat */}
            {detectedProductSuggestion && (!selectedProduct || getId(selectedProduct) !== getId(detectedProductSuggestion.product)) && (
              <Box
                sx={{
                  mb: 1.5,
                  p: 1.2,
                  borderRadius: '8px',
                  bgcolor: '#FEF9C3',
                  border: '1px dashed #EAB308',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 1
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                    <BulbOutlined style={{ color: '#CA8A04', fontSize: 13 }} />
                    <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#854D0E' }}>Phát hiện trong hội thoại:</Typography>
                  </Stack>
                  <Typography sx={{ fontSize: 11, color: '#713F12', fontWeight: 600 }} noWrap>
                    {detectedProductSuggestion.product.productName}
                  </Typography>
                </Box>
                <Button
                  size="small"
                  variant="contained"
                  onClick={() => setSelectedProduct(detectedProductSuggestion.product)}
                  sx={{
                    bgcolor: '#EAB308',
                    color: '#713F12',
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'none',
                    px: 1,
                    py: 0.3,
                    minWidth: 'auto',
                    boxShadow: 'none',
                    whiteSpace: 'nowrap',
                    '&:hover': { bgcolor: '#CA8A04', color: '#fff' }
                  }}
                >
                  + Chọn ngay
                </Button>
              </Box>
            )}

            {/* Tìm kiếm nhanh & Chọn sản phẩm */}
            {!selectedProduct ? (
              <Stack spacing={1} sx={{ mb: 1.5 }}>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="Gõ tên sản phẩm để tìm nhanh..."
                  value={searchProd}
                  onChange={(e) => setSearchProd(e.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchOutlined style={{ color: C.muted, fontSize: 13 }} />
                      </InputAdornment>
                    ),
                    endAdornment: searchProd ? (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={() => setSearchProd('')} sx={{ p: 0.25 }}>
                          <CloseOutlined style={{ fontSize: 10 }} />
                        </IconButton>
                      </InputAdornment>
                    ) : null
                  }}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px', fontSize: 12 } }}
                />

                <Box
                  sx={{
                    maxHeight: 210,
                    overflowY: 'auto',
                    border: `1px solid ${C.border}`,
                    borderRadius: '8px',
                    bgcolor: '#FAFAFA'
                  }}
                >
                  {filteredProducts.length === 0 ? (
                    <Box sx={{ p: 2, textAlign: 'center' }}>
                      <Typography sx={{ fontSize: 12, color: C.muted }}>Không tìm thấy sản phẩm nào</Typography>
                    </Box>
                  ) : (
                    filteredProducts.map((p) => {
                      const pId = getId(p);
                      const pImg = p.imageUrl || p.images?.[0]?.imageUrl;
                      return (
                        <Box
                          key={pId}
                          onClick={() => setSelectedProduct(p)}
                          sx={{
                            p: 1,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1.2,
                            cursor: 'pointer',
                            borderBottom: `1px solid ${C.border}`,
                            '&:last-child': { borderBottom: 'none' },
                            '&:hover': { bgcolor: '#F0F9FF' },
                            transition: 'background-color 0.15s'
                          }}
                        >
                          {pImg ? (
                            <Avatar src={pImg} variant="rounded" sx={{ width: 32, height: 32 }} />
                          ) : (
                            <Avatar
                              variant="rounded"
                              sx={{ width: 32, height: 32, bgcolor: '#E0F2FE', color: '#0284C7', fontSize: 12, fontWeight: 700 }}
                            >
                              {(p.productName || 'P').charAt(0).toUpperCase()}
                            </Avatar>
                          )}
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography sx={{ fontSize: 12, fontWeight: 600, color: C.text }} noWrap>
                              {p.productName}
                            </Typography>
                            <Typography sx={{ fontSize: 11, color: '#087F8C', fontWeight: 600 }}>
                              {p.priceRange || (p.minPrice != null ? money(p.minPrice) : 'Liên hệ')}
                            </Typography>
                          </Box>
                          <Chip
                            size="small"
                            label="Chọn"
                            sx={{ fontSize: 10, height: 22, bgcolor: '#E0F2FE', color: '#0284C7', fontWeight: 700, cursor: 'pointer' }}
                          />
                        </Box>
                      );
                    })
                  )}
                </Box>
              </Stack>
            ) : (
              /* Đã chọn sản phẩm -> Hiển thị thông tin & Các biến thể trực quan */
              <Box sx={{ mb: 1.5 }}>
                <Box
                  sx={{
                    p: 1.2,
                    bgcolor: '#F0F9FF',
                    borderRadius: '8px',
                    border: '1px solid #BAE6FD',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 1,
                    mb: 1
                  }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: 10, color: '#0369A1', fontWeight: 700, textTransform: 'uppercase' }}>
                      Sản phẩm đang chọn
                    </Typography>
                    <Typography sx={{ fontSize: 12, fontWeight: 700, color: C.text }} noWrap>
                      {selectedProduct.productName}
                    </Typography>
                  </Box>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<SwapOutlined />}
                    onClick={() => {
                      setSelectedProduct(null);
                      setSelectedVariant(null);
                    }}
                    sx={{
                      fontSize: 11,
                      textTransform: 'none',
                      borderColor: '#0284C7',
                      color: '#0284C7',
                      py: 0.25,
                      px: 1,
                      borderRadius: '6px',
                      whiteSpace: 'nowrap',
                      '&:hover': { bgcolor: '#E0F2FE', borderColor: '#0284C7' }
                    }}
                  >
                    Đổi món
                  </Button>
                </Box>

                <Typography sx={{ fontSize: 11, fontWeight: 700, color: C.muted, mb: 0.75 }}>Chọn biến thể (Size / Màu sắc):</Typography>

                {loadingVariants ? (
                  <Box sx={{ textAlign: 'center', py: 1.5 }}>
                    <CircularProgress size={16} />
                  </Box>
                ) : variants.length === 0 ? (
                  <Typography sx={{ fontSize: 11, color: C.danger, mb: 1 }}>Sản phẩm này chưa có biến thể trong kho</Typography>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                    {/* Lưới biến thể: số "Còn bán" = tồn − hàng đang giữ cho đơn khác chờ xác nhận */}
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))', gap: 0.75 }}>
                      {variants.map((v) => {
                        const vId = v.detailId ?? v.variantId ?? v.id;
                        const stock = getStock(v);
                        const isSelected =
                          selectedVariant && (selectedVariant.detailId ?? selectedVariant.variantId ?? selectedVariant.id) === vId;
                        const outOfStock = stock <= 0;
                        const inCart = cart.find((item) => item.variantId === vId)?.quantity ?? 0;

                        return (
                          <Box
                            key={vId}
                            role="button"
                            aria-pressed={Boolean(isSelected)}
                            onClick={() => {
                              if (!outOfStock) setSelectedVariant(v);
                            }}
                            sx={{
                              position: 'relative',
                              p: '8px 10px',
                              borderRadius: '10px',
                              border: isSelected ? '1.5px solid #0E7490' : `1px ${outOfStock ? 'dashed' : 'solid'} ${C.border}`,
                              bgcolor: isSelected ? '#F0FCFE' : outOfStock ? '#F8FAFC' : '#fff',
                              boxShadow: isSelected ? '0 0 0 3px rgba(142, 236, 245, 0.35)' : 'none',
                              cursor: outOfStock ? 'not-allowed' : 'pointer',
                              transition: 'all 0.15s ease',
                              '&:hover': !outOfStock && !isSelected ? { borderColor: '#8EECF5', bgcolor: '#FAFEFF' } : {}
                            }}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.5 }}>
                              <Typography
                                sx={{ fontSize: 12, fontWeight: 800, color: outOfStock ? '#94A3B8' : isSelected ? '#0E7490' : '#0F172A' }}
                                noWrap
                              >
                                {v.size} / {v.color}
                              </Typography>
                              {isSelected && <CheckOutlined style={{ fontSize: 11, color: '#0E7490' }} />}
                            </Box>
                            <Typography
                              sx={{
                                fontSize: 12,
                                fontWeight: 700,
                                color: outOfStock ? '#94A3B8' : '#0F172A',
                                mt: 0.25,
                                textDecoration: outOfStock ? 'line-through' : 'none'
                              }}
                            >
                              {money(getPrice(v))}
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                              <Box
                                component="span"
                                sx={{
                                  px: 0.75,
                                  py: '1px',
                                  borderRadius: '6px',
                                  fontSize: 10.5,
                                  fontWeight: 700,
                                  bgcolor: outOfStock ? '#FEE2E2' : stock <= 3 ? '#FFF7AE' : '#E7F6F1',
                                  color: outOfStock ? '#B91C1C' : stock <= 3 ? '#713F12' : '#168B70'
                                }}
                              >
                                {outOfStock ? 'Hết hàng' : `Còn bán ${stock}`}
                              </Box>
                              {inCart > 0 && (
                                <Box component="span" sx={{ fontSize: 10.5, fontWeight: 600, color: '#0E7490' }}>
                                  · Trong giỏ {inCart}
                                </Box>
                              )}
                            </Box>
                          </Box>
                        );
                      })}
                    </Box>

                    <Button
                      fullWidth
                      variant="contained"
                      onClick={addToCart}
                      disabled={!selectedVariant || getStock(selectedVariant) <= 0}
                      startIcon={<ShoppingOutlined />}
                      sx={{
                        height: 40,
                        bgcolor: '#8EECF5',
                        color: '#0F172A',
                        borderRadius: '10px',
                        textTransform: 'none',
                        fontWeight: 700,
                        fontSize: 13,
                        boxShadow: 'none',
                        '&:hover': { bgcolor: '#76E5EF', boxShadow: '0 2px 8px rgba(142, 236, 245, 0.4)' },
                        '&.Mui-disabled': { bgcolor: '#E2E8F0', color: '#94A3B8' }
                      }}
                    >
                      {selectedVariant
                        ? `Thêm ${selectedVariant.size} / ${selectedVariant.color} vào giỏ`
                        : 'Chọn size / màu để thêm vào giỏ'}
                    </Button>
                  </Box>
                )}
              </Box>
            )}

            <Divider sx={{ my: 1.5, borderColor: C.border }} />

            {/* 3. Giỏ hàng chốt đơn */}
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: C.text, mb: 1 }}>3. Giỏ hàng ({cart.length} món)</Typography>

            {submitAttempted && !cartValid && (
              <Alert severity="error" sx={{ mb: 1, py: 0.5, fontSize: 11 }}>
                Vui lòng chọn ít nhất 1 sản phẩm vào giỏ hàng!
              </Alert>
            )}
            {cart.length === 0 ? (
              <Typography sx={{ fontSize: 12, color: C.muted, fontStyle: 'italic', py: 1 }}>Chưa có món nào được chọn</Typography>
            ) : (
              <Stack spacing={1} sx={{ mb: 2 }}>
                {cart.map((item) => (
                  <Box
                    key={item.variantId}
                    sx={{
                      p: 1,
                      bgcolor: '#F8FAFC',
                      borderRadius: '8px',
                      border: `1px solid ${C.border}`
                    }}
                  >
                    <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box sx={{ flex: 1, minWidth: 0, pr: 1 }}>
                        <Typography sx={{ fontSize: 12, fontWeight: 700, lineHeight: 1.2 }}>{item.productName}</Typography>
                        <Typography sx={{ fontSize: 11, color: C.muted, mt: 0.2 }}>
                          {item.size} / {item.color} • {money(item.price)}
                        </Typography>
                      </Box>

                      {/* Tăng giảm số lượng */}
                      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                        <IconButton size="small" onClick={() => updateQuantity(item.variantId, -1)} sx={{ p: 0.5 }}>
                          <MinusOutlined style={{ fontSize: 10 }} />
                        </IconButton>
                        <Typography sx={{ fontSize: 12, fontWeight: 700, minWidth: 18, textAlign: 'center' }}>{item.quantity}</Typography>
                        <IconButton size="small" onClick={() => updateQuantity(item.variantId, 1)} sx={{ p: 0.5 }}>
                          <PlusOutlined style={{ fontSize: 10 }} />
                        </IconButton>
                        <IconButton size="small" color="error" onClick={() => removeFromCart(item.variantId)} sx={{ p: 0.5 }}>
                          <DeleteOutlined style={{ fontSize: 11 }} />
                        </IconButton>
                      </Stack>
                    </Stack>
                  </Box>
                ))}

                <Stack direction="row" sx={{ justifyContent: 'space-between', pt: 1, borderTop: `1px dashed ${C.border}` }}>
                  <Typography sx={{ fontWeight: 800, fontSize: 13, color: C.text }}>Tổng thanh toán:</Typography>
                  <Typography sx={{ fontWeight: 800, fontSize: 15, color: '#087F8C' }}>{money(cartTotal)}</Typography>
                </Stack>
              </Stack>
            )}
          </Box>

          {/* Nút Chốt đơn & Bắn link PayOS */}
          <Box sx={{ p: 1.75, borderTop: `1px solid ${C.border}`, bgcolor: '#fff' }}>
            {errorMsg && (
              <Alert severity="warning" onClose={() => setErrorMsg('')} sx={{ mb: 1.5, fontSize: 11.5, py: 0.5, borderRadius: '8px' }}>
                {errorMsg}
              </Alert>
            )}
            <Button
              fullWidth
              variant="contained"
              disabled={creatingOrder || !selectedPsid}
              onClick={handleCreateOrderAndSendPayOS}
              startIcon={creatingOrder ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : <QrcodeOutlined />}
              sx={{
                bgcolor: '#087F8C',
                color: '#fff',
                py: 1.2,
                borderRadius: '10px',
                fontWeight: 800,
                fontSize: 13,
                textTransform: 'none',
                boxShadow: 'none',
                '&:hover': { bgcolor: '#066670', boxShadow: 'none' }
              }}
            >
              {creatingOrder ? 'Đang tạo đơn & PayOS...' : 'Chốt đơn & Gửi Link PayOS'}
            </Button>
          </Box>
        </Card>
      </Box>

      {/* ==================== MODAL XEM MÃ QR VIETQR PAYOS ==================== */}
      <Dialog
        open={qrModal.open}
        onClose={() => setQrModal((prev) => ({ ...prev, open: false }))}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: { borderRadius: '16px', overflow: 'hidden' }
        }}
      >
        <DialogTitle
          sx={{ p: 2, bgcolor: '#087F8C', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <QrcodeOutlined style={{ fontSize: 20 }} />
            <Typography sx={{ fontWeight: 800, fontSize: 15, color: '#fff' }}>Mã VietQR Thanh Toán Đơn Hàng</Typography>
          </Stack>
          <IconButton size="small" onClick={() => setQrModal((prev) => ({ ...prev, open: false }))} sx={{ color: '#fff' }}>
            <CloseOutlined />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ p: 2.5, textAlign: 'center' }}>
          <Box sx={{ mb: 1 }}>
            <Chip label={`Đơn hàng ${qrModal.orderNumber}`} color="success" size="small" sx={{ fontWeight: 700, fontSize: 12, mb: 1 }} />
            <Typography sx={{ fontSize: 20, fontWeight: 900, color: '#087F8C' }}>{money(qrModal.totalAmount)}</Typography>
          </Box>

          {/* Ảnh QR VietQR */}
          <Box
            sx={{
              p: 1.5,
              bgcolor: '#fff',
              border: '2px solid #E5EBF2',
              borderRadius: '12px',
              display: 'inline-block',
              boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
              my: 1
            }}
          >
            {qrModal.qrImageUrl ? (
              <Box
                component="img"
                src={qrModal.qrImageUrl}
                alt="VietQR PayOS"
                sx={{ width: 220, height: 220, objectFit: 'contain', display: 'block', mx: 'auto' }}
              />
            ) : (
              <Box sx={{ width: 220, height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CircularProgress size={30} />
              </Box>
            )}
          </Box>

          <Alert severity="success" icon={<CheckCircleOutlined />} sx={{ mt: 1.5, textAlign: 'left', fontSize: 12 }}>
            Ảnh mã QR này đã được gửi trực tiếp vào Messenger cho khách hàng!
          </Alert>

          {/* Thông tin chuyển khoản */}
          {qrModal.accountNumber && (
            <Box sx={{ mt: 2, p: 1.5, bgcolor: '#F8FAFC', borderRadius: '10px', border: `1px solid ${C.border}`, textAlign: 'left' }}>
              <Typography sx={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>TÀI KHOẢN THỤ HƯỞNG</Typography>
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: C.text, mt: 0.25 }}>
                {qrModal.bankName} - {qrModal.accountName}
              </Typography>
              <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mt: 0.5 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 800, color: '#087F8C', letterSpacing: 0.5 }}>
                  STK: {qrModal.accountNumber}
                </Typography>
                <Button
                  size="small"
                  startIcon={<CopyOutlined />}
                  onClick={() => {
                    navigator.clipboard.writeText(qrModal.accountNumber);
                    setQrModal((prev) => ({ ...prev, copied: true }));
                    setTimeout(() => setQrModal((prev) => ({ ...prev, copied: false })), 2000);
                  }}
                  sx={{ fontSize: 11, textTransform: 'none', py: 0.2, px: 1 }}
                >
                  {qrModal.copied ? 'Đã chép!' : 'Sao chép STK'}
                </Button>
              </Stack>
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ p: 2, pt: 0, justifyContent: 'space-between' }}>
          {qrModal.payUrl ? (
            <Button
              variant="outlined"
              size="small"
              startIcon={<LinkOutlined />}
              onClick={() => window.open(qrModal.payUrl, '_blank')}
              sx={{ textTransform: 'none', borderRadius: '8px', fontSize: 12 }}
            >
              Mở link thanh toán
            </Button>
          ) : (
            <Box />
          )}
          <Button
            variant="contained"
            size="small"
            onClick={() => setQrModal((prev) => ({ ...prev, open: false }))}
            sx={{
              bgcolor: '#087F8C',
              color: '#fff',
              textTransform: 'none',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: 12,
              '&:hover': { bgcolor: '#066670' }
            }}
          >
            Đóng
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
