import { useEffect, useMemo, useRef, useState } from 'react';
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
  CheckOutlined
} from '@ant-design/icons';
import { getProducts, getProductById } from '../../services/productService';
import { api } from '../../services/http';
import { useAuth } from '../auth/AuthProvider';
import { useCrumbs } from '../../layouts/crumbs';
import { brand } from '../account/tokens';

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

const money = (value) => `${Number(value || 0).toLocaleString('vi-VN')} ₫`;
const getId = (p) => p?.productId ?? p?.id;
const getStock = (v) => Number(v?.stockQuantity ?? v?.stock ?? 0);
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

  // Thông tin khách hàng chốt đơn
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [orderSuccessMsg, setOrderSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const chatBoxRef = useRef(null);

  // 1. Tải danh sách hội thoại & tin nhắn từ Backend Webhook
  const fetchConversationsAndMessages = async () => {
    try {
      const [resMsgs, resConvs] = await Promise.all([
        api('/facebook/webhook/messages'),
        api('/facebook/webhook/conversations')
      ]);

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
        const list = Array.isArray(res) ? res : res?.data ?? [];
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
    const list = messages
      .filter((m) => m.senderPsid === selectedPsid)
      .sort((a, b) => parseMsgTime(a) - parseMsgTime(b));

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

  // Tự cuộn chỉ bên trong khung chat (không kéo toàn bộ trang web xuống đáy)
  useEffect(() => {
    if (chatBoxRef.current && currentChatMessages.length > 0) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [currentChatMessages]);

  // Cuộc trò chuyện của khách đang chọn
  const activeConversation = useMemo(() => {
    return conversations.find((c) => c.psid === selectedPsid);
  }, [conversations, selectedPsid]);

  // Quét thông minh số điện thoại từ các tin nhắn khách hàng gửi đến
  const detectedPhone = useMemo(() => {
    if (!currentChatMessages.length) return null;
    const phoneRegex = /(0[3|5|7|8|9][0-9]{8})\b/;
    for (let i = currentChatMessages.length - 1; i >= 0; i--) {
      const msg = currentChatMessages[i];
      if (msg.from === 'CUSTOMER' && msg.text) {
        const match = msg.text.match(phoneRegex);
        if (match) return match[1];
      }
    }
    return null;
  }, [currentChatMessages]);

  // Quét thông minh Địa chỉ giao hàng từ tin nhắn của khách
  const detectedAddress = useMemo(() => {
    if (!currentChatMessages.length) return null;

    const addressKeywords = [
      'địa chỉ', 'đc:', 'dc:', 'ship về', 'ship đến', 'giao đến', 'giao về', 'giao ở', 'ở tại', 'em ở', 'mình ở',
      'đường', 'phố', 'ngõ', 'ngách', 'hẻm', 'số nhà', 'tòa nhà', 'chung cư',
      'phường', 'xã', 'thị trấn', 'quận', 'huyện', 'thị xã', 'tp.', 'tp ',
      'hà nội', 'hồ chí minh', 'hcm', 'sài gòn', 'đà nẵng', 'hải phòng', 'cần thơ',
      'bắc ninh', 'bắc giang', 'nam định', 'thái bình', 'quảng ninh', 'hải dương',
      'thanh hóa', 'nghệ an', 'bình dương', 'đồng nai', 'vĩnh phúc', 'phú thọ'
    ];

    for (let i = currentChatMessages.length - 1; i >= 0; i--) {
      const msg = currentChatMessages[i];
      if (msg.from === 'CUSTOMER' && msg.text) {
        const textLower = msg.text.toLowerCase().trim();
        if (textLower.length < 8) continue;

        const withoutPhone = msg.text.replace(/(0[3|5|7|8|9][0-9]{8})\b/g, '').trim();
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

  // Tự động điền thông tin khách hàng khi chọn hoặc chuyển đổi cuộc hội thoại
  useEffect(() => {
    if (!selectedPsid) {
      setCustomerName('');
      setCustomerPhone('');
      setCustomerAddress('');
      return;
    }

    if (activeConversation?.name && !activeConversation.name.startsWith('Khách FB #')) {
      setCustomerName(activeConversation.name);
    } else {
      setCustomerName(`Khách hàng FB (#${selectedPsid.slice(-6)})`);
    }

    setCustomerPhone(detectedPhone || '');
    setCustomerAddress(detectedAddress || '');
  }, [selectedPsid]);

  useEffect(() => {
    if (activeConversation?.name && !activeConversation.name.startsWith('Khách FB #')) {
      setCustomerName(activeConversation.name);
    }
  }, [activeConversation?.name]);

  // Tự động cập nhật số điện thoại nếu khách mới gửi trong tin nhắn
  useEffect(() => {
    if (detectedPhone && !customerPhone) {
      setCustomerPhone(detectedPhone);
    }
  }, [detectedPhone]);

  // Tự động cập nhật địa chỉ nếu khách mới gửi trong tin nhắn
  useEffect(() => {
    if (detectedAddress && !customerAddress) {
      setCustomerAddress(detectedAddress);
    }
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
      await api('/facebook/webhook/send', {
        method: 'POST',
        body: {
          recipientPsid: targetPsid,
          message: text.trim()
        }
      });

      // Hiển thị ngay lập tức tin nhắn của Shop vào khung chat
      const localMsg = {
        mid: 'local_' + Date.now(),
        senderPsid: targetPsid,
        senderName: 'THORS Studio',
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

  // 4. Chốt đơn & Tự động tạo link PayOS gửi vào Messenger cho khách
  const handleCreateOrderAndSendPayOS = async () => {
    if (!cart.length) {
      setErrorMsg('Vui lòng chọn ít nhất 1 sản phẩm vào đơn!');
      return;
    }
    if (!selectedPsid) {
      setErrorMsg('Chưa chọn khách hàng Facebook để gửi link đơn!');
      return;
    }

    setCreatingOrder(true);
    setErrorMsg('');
    setOrderSuccessMsg('');

    try {
      // Bước A: Tạo đơn hàng lưu trực tiếp vào Quản lý Đơn hàng (orders) và trừ kho thời gian thực
      const orderResult = await api('/facebook/webhook/order', {
        method: 'POST',
        body: {
          items: cart.map((line) => ({
            detailId: line.variantId,
            quantity: line.quantity
          })),
          customerName: customerName.trim() || `Khách FB (${selectedPsid.slice(-6)})`,
          customerPhone: customerPhone.trim(),
          customerAddress: customerAddress.trim(),
          psid: selectedPsid,
          paymentMethod: 'ONLINE'
        }
      });

      const orderId = orderResult?.orderId;
      const orderNumber = orderResult?.orderNumber || `#${orderId}`;
      const totalAmount = orderResult?.totalAmount || cartTotal;

      // Bước B: Thử tạo link thanh toán PayOS thật nếu PayOS đã cấu hình
      let payUrl = `http://localhost:3000/orders/${orderId}`;
      try {
        const payRes = await api('/payment/payos/create-link', {
          method: 'POST',
          body: { orderId }
        });
        if (payRes?.checkoutUrl) {
          payUrl = payRes.checkoutUrl;
        }
      } catch (ignored) {
        // Nếu PayOS chưa bật, dùng link xem chi tiết đơn hàng
      }

      // Bước C: Tạo tin nhắn xác nhận kèm thông tin thanh toán VietQR / PayOS
      const paymentMsg =
        `🎉 Cảm ơn bạn đã đặt hàng tại THORS Studio!\n\n` +
        `📦 THÔNG TIN ĐƠN HÀNG ${orderNumber}:\n` +
        cart.map((c) => ` • ${c.productName} (${c.size}/${c.color}) x${c.quantity} : ${money(c.price * c.quantity)}`).join('\n') +
        `\n\n💵 TỔNG CỘNG: ${money(totalAmount)}\n` +
        (customerAddress.trim() ? `📍 Địa chỉ nhận hàng: ${customerAddress.trim()}\n` : '') +
        (customerPhone.trim() ? `📞 SĐT: ${customerPhone.trim()}\n` : '') +
        `\n💳 Bạn vui lòng quét mã VietQR hoặc truy cập link sau để hoàn tất thanh toán online:\n` +
        `${payUrl}\n\n` +
        `Shop sẽ đóng gói và giao hàng ngay khi nhận được thanh toán ạ! ❤️`;

      // Bước D: Bắn tin nhắn qua Messenger cho khách hàng
      await api('/facebook/webhook/send', {
        method: 'POST',
        body: {
          recipientPsid: selectedPsid,
          message: paymentMsg
        }
      });

      setOrderSuccessMsg(`Tạo đơn ${orderNumber} thành công! Đơn đã lưu vào mục "Đơn hàng" và đã gửi link thanh toán vào Messenger.`);
      setCart([]);
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
    <Box sx={{ p: 2.5, bgcolor: '#F8FAFC', minHeight: 'calc(100vh - 80px)' }}>
      {/* Tiêu đề trang & Thanh trạng thái kết nối Fanpage */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Box>
          <Stack direction="row" alignItems="center" spacing={1.5}>
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
            Đồng bộ tin nhắn Messenger thời gian thực • Chốt đơn trừ tồn kho • Tự động gửi link thanh toán PayOS
          </Typography>
        </Box>

        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="caption" sx={{ color: C.muted }}>
            Cập nhật: {lastUpdated.toLocaleTimeString('vi-VN')}
          </Typography>
          <Tooltip title="Đồng bộ toàn bộ tin nhắn từ Facebook">
            <IconButton onClick={handleManualSync} size="small" disabled={loadingConv} sx={{ bgcolor: '#fff', border: `1px solid ${C.border}` }}>
              <ReloadOutlined spin={loadingConv} style={{ fontSize: 13 }} />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      {/* Thông báo thành công / lỗi */}
      {orderSuccessMsg && (
        <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setOrderSuccessMsg('')}>
          {orderSuccessMsg}
        </Alert>
      )}
      {errorMsg && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setErrorMsg('')}>
          {errorMsg}
        </Alert>
      )}

      {/* Bố cục 3 Cột chuẩn Sapo / Pancake POS */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '300px 1fr 380px' },
          gap: 2,
          height: 'calc(100vh - 180px)',
          minHeight: 640
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

          <Box sx={{ flex: 1, overflowY: 'auto', p: 1 }}>
            {conversations.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 6, px: 2 }}>
                <MessageOutlined style={{ fontSize: 32, color: '#CBD5E1', marginBottom: 8 }} />
                <Typography sx={{ fontSize: 13, color: C.muted, fontWeight: 600 }}>
                  Chưa có tin nhắn mới từ Fanpage
                </Typography>
                <Typography sx={{ fontSize: 11, color: C.muted, mt: 0.5 }}>
                  Gửi tin nhắn vào Page THORS để bắt đầu hội thoại!
                </Typography>
              </Box>
            ) : (
              conversations
                .filter((c) => !searchConv || c.psid.includes(searchConv) || (c.name && c.name.toLowerCase().includes(searchConv.toLowerCase())) || (c.lastMessage && c.lastMessage.toLowerCase().includes(searchConv.toLowerCase())))
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
                      <Stack direction="row" spacing={1.25} alignItems="center">
                        <Avatar src={c.avatar} sx={{ bgcolor: isSelected ? '#087F8C' : '#94A3B8', width: 38, height: 38, fontSize: 14 }}>
                          {c.name ? c.name[0] : <UserOutlined />}
                        </Avatar>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Typography sx={{ fontWeight: 700, fontSize: 13, color: C.text }}>
                              {c.name || `Khách FB #${c.psid.slice(-6)}`}
                            </Typography>
                            <Typography sx={{ fontSize: 10, color: C.muted }}>
                              {c.lastTimestamp?.split(' ')[0] || ''}
                            </Typography>
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
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Stack direction="row" spacing={1.25} alignItems="center">
                <Avatar src={activeConversation?.avatar} sx={{ bgcolor: '#087F8C', width: 34, height: 34, fontSize: 13 }}>
                  {activeConversation?.name ? activeConversation.name[0] : <UserOutlined />}
                </Avatar>
                <Box>
                  <Typography sx={{ fontWeight: 800, fontSize: 14, color: C.text }}>
                    {activeConversation?.name || (selectedPsid ? `Khách hàng Facebook (#${selectedPsid})` : 'Chọn khách hàng để chat')}
                  </Typography>
                  <Typography sx={{ fontSize: 11, color: C.success, fontWeight: 600 }}>
                    ● Đang trực tuyến qua Messenger
                  </Typography>
                </Box>
              </Stack>
            </Stack>
          </Box>

          {/* Danh sách tin nhắn */}
          <Box ref={chatBoxRef} sx={{ flex: 1, overflowY: 'auto', p: 2, bgcolor: '#F8FAFC' }}>
            {!selectedPsid ? (
              <Box sx={{ textAlign: 'center', py: 10 }}>
                <Typography sx={{ color: C.muted, fontSize: 13 }}>
                  Vui lòng chọn một cuộc trò chuyện ở cột bên trái
                </Typography>
              </Box>
            ) : currentChatMessages.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 10 }}>
                <Typography sx={{ color: C.muted, fontSize: 13 }}>
                  Chưa có lịch sử tin nhắn với khách hàng này
                </Typography>
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
                    <Box sx={{ maxWidth: '75%' }}>
                      <Box
                        sx={{
                          p: 1.5,
                          borderRadius: isShop ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                          bgcolor: isShop ? C.main : '#fff',
                          color: isShop ? '#0E3A41' : C.text,
                          border: isShop ? '1px solid #74DCE7' : `1px solid ${C.border}`,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                          whiteSpace: 'pre-wrap',
                          fontSize: 13.5,
                          lineHeight: 1.45
                        }}
                      >
                        {msg.text || '👍 [Nhãn dán / Hình ảnh]'}
                      </Box>
                      <Typography
                        sx={{
                          fontSize: 10,
                          color: C.muted,
                          mt: 0.4,
                          textAlign: isShop ? 'right' : 'left'
                        }}
                      >
                        {isShop ? 'Shop THORS' : (msg.senderName || 'Khách hàng')} • {msg.timestamp || ''}
                      </Typography>
                    </Box>
                  </Box>
                );
              })
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
            <Stack direction="row" alignItems="center" spacing={1}>
              <ShoppingOutlined style={{ fontSize: 18, color: '#087F8C' }} />
              <Typography sx={{ fontWeight: 800, fontSize: 14, color: C.text }}>
                Tạo Đơn Hàng Nhanh (Social POS)
              </Typography>
            </Stack>
          </Box>

          <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
            {/* 1. Thông tin giao hàng */}
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: C.text, mb: 1 }}>
              1. Thông tin người nhận
            </Typography>
            <Stack spacing={1} sx={{ mb: 2 }}>
              <TextField
                size="small"
                placeholder="Tên khách hàng"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px', fontSize: 12 } }}
              />
              <Box>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="Số điện thoại"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px', fontSize: 12 } }}
                />
                {detectedPhone && customerPhone !== detectedPhone && (
                  <Chip
                    size="small"
                    label={`Dùng SĐT trong chat: ${detectedPhone}`}
                    onClick={() => setCustomerPhone(detectedPhone)}
                    sx={{ mt: 0.5, fontSize: 11, cursor: 'pointer', bgcolor: '#E0F2FE', color: '#0284C7', fontWeight: 600 }}
                  />
                )}
              </Box>
              <Box>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="Địa chỉ giao hàng"
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px', fontSize: 12 } }}
                />
                {detectedAddress && customerAddress !== detectedAddress && (
                  <Chip
                    size="small"
                    label={`Dùng địa chỉ trong chat: ${detectedAddress.length > 30 ? detectedAddress.slice(0, 30) + '...' : detectedAddress}`}
                    onClick={() => setCustomerAddress(detectedAddress)}
                    title={detectedAddress}
                    sx={{ mt: 0.5, fontSize: 11, cursor: 'pointer', bgcolor: '#FEF3C7', color: '#B45309', fontWeight: 600, maxWidth: '100%' }}
                  />
                )}
              </Box>
            </Stack>

            <Divider sx={{ my: 1.5, borderColor: C.border }} />

            {/* 2. Chọn sản phẩm từ Kho THORS */}
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: C.text, mb: 1 }}>
              2. Chọn sản phẩm từ kho THORS
            </Typography>
            <Stack spacing={1} sx={{ mb: 1.5 }}>
              <Select
                size="small"
                displayEmpty
                value={selectedProduct ? getId(selectedProduct) : ''}
                onChange={(e) => {
                  const p = products.find((prod) => getId(prod) === Number(e.target.value));
                  setSelectedProduct(p || null);
                }}
                sx={{ borderRadius: '8px', fontSize: 12 }}
              >
                <MenuItem value="" disabled>
                  -- Chọn sản phẩm trong kho --
                </MenuItem>
                {products.map((p) => (
                  <MenuItem key={getId(p)} value={getId(p)}>
                    {p.productName}
                  </MenuItem>
                ))}
              </Select>

              {/* Biến thể Size / Màu */}
              {selectedProduct && (
                <Box sx={{ p: 1, bgcolor: '#F8FAFC', borderRadius: '8px', border: `1px solid ${C.border}` }}>
                  {loadingVariants ? (
                    <Box sx={{ textAlign: 'center', py: 1 }}>
                      <CircularProgress size={16} />
                    </Box>
                  ) : variants.length === 0 ? (
                    <Typography sx={{ fontSize: 11, color: C.danger }}>Sản phẩm chưa có biến thể</Typography>
                  ) : (
                    <Stack spacing={1}>
                      <Select
                        size="small"
                        value={selectedVariant ? (selectedVariant.detailId ?? selectedVariant.variantId ?? selectedVariant.id) : ''}
                        onChange={(e) => {
                          const v = variants.find((item) => (item.detailId ?? item.variantId ?? item.id) === Number(e.target.value));
                          setSelectedVariant(v || null);
                        }}
                        sx={{ borderRadius: '6px', fontSize: 12, bgcolor: '#fff' }}
                      >
                        {variants.map((v) => {
                          const vId = v.detailId ?? v.variantId ?? v.id;
                          const stock = getStock(v);
                          return (
                            <MenuItem key={vId} value={vId} disabled={stock <= 0}>
                              Size {v.size} - Màu {v.color} ({money(getPrice(v))}) - Kho: {stock}
                            </MenuItem>
                          );
                        })}
                      </Select>

                      <Button
                        size="small"
                        variant="outlined"
                        onClick={addToCart}
                        disabled={!selectedVariant || getStock(selectedVariant) <= 0}
                        startIcon={<PlusOutlined />}
                        sx={{
                          textTransform: 'none',
                          borderRadius: '6px',
                          borderColor: '#087F8C',
                          color: '#087F8C',
                          fontWeight: 700,
                          fontSize: 12,
                          '&:hover': { bgcolor: C.selected, borderColor: '#087F8C' }
                        }}
                      >
                        Thêm vào đơn
                      </Button>
                    </Stack>
                  )}
                </Box>
              )}
            </Stack>

            <Divider sx={{ my: 1.5, borderColor: C.border }} />

            {/* 3. Giỏ hàng chốt đơn */}
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: C.text, mb: 1 }}>
              3. Giỏ hàng ({cart.length} món)
            </Typography>
            {cart.length === 0 ? (
              <Typography sx={{ fontSize: 12, color: C.muted, fontStyle: 'italic', py: 1 }}>
                Chưa có món nào được chọn
              </Typography>
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
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Box sx={{ flex: 1, minWidth: 0, pr: 1 }}>
                        <Typography sx={{ fontSize: 12, fontWeight: 700, lineHeight: 1.2 }}>
                          {item.productName}
                        </Typography>
                        <Typography sx={{ fontSize: 11, color: C.muted, mt: 0.2 }}>
                          {item.size} / {item.color} • {money(item.price)}
                        </Typography>
                      </Box>

                      {/* Tăng giảm số lượng */}
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <IconButton size="small" onClick={() => updateQuantity(item.variantId, -1)} sx={{ p: 0.5 }}>
                          <MinusOutlined style={{ fontSize: 10 }} />
                        </IconButton>
                        <Typography sx={{ fontSize: 12, fontWeight: 700, minWidth: 18, textAlign: 'center' }}>
                          {item.quantity}
                        </Typography>
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

                <Stack direction="row" justifyContent="space-between" sx={{ pt: 1, borderTop: `1px dashed ${C.border}` }}>
                  <Typography sx={{ fontWeight: 800, fontSize: 13, color: C.text }}>Tổng thanh toán:</Typography>
                  <Typography sx={{ fontWeight: 800, fontSize: 15, color: '#087F8C' }}>
                    {money(cartTotal)}
                  </Typography>
                </Stack>
              </Stack>
            )}
          </Box>

          {/* Nút Chốt đơn & Bắn link PayOS */}
          <Box sx={{ p: 1.75, borderTop: `1px solid ${C.border}`, bgcolor: '#fff' }}>
            <Button
              fullWidth
              variant="contained"
              disabled={!cart.length || creatingOrder || !selectedPsid}
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
    </Box>
  );
}

