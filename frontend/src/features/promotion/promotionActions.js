import { changePromotionStatus, deletePromotion, endPromotion } from 'services/promotionService';
import { toggleBlockedMessage } from './promotionFormat';

// Nội dung hộp xác nhận cho từng thao tác: { promotion, title, message, warning, deletes, run }
// Trả về chuỗi khi thao tác không được phép (hiện bằng NoticeDialog)
export function toggleAction(promotion) {
  const turningOff = promotion.status === 'ACTIVE';
  if (!(turningOff ? promotion.canDisable : promotion.canEnable)) return toggleBlockedMessage(promotion);
  return {
    promotion,
    title: turningOff ? 'Tắt khuyến mãi?' : 'Bật khuyến mãi?',
    message: `Bạn có chắc muốn ${turningOff ? 'tắt' : 'bật'} chương trình`,
    run: () => changePromotionStatus(promotion.promotionId, turningOff ? 'INACTIVE' : 'ACTIVE')
  };
}

export const endEarlyAction = (promotion) => ({
  promotion,
  title: 'Kết thúc sớm?',
  message: 'Kết thúc ngay chương trình',
  warning:
    promotion.type === 'ORDER_VOUCHER'
      ? `Khách đã thấy mã sẽ không dùng được nữa. Đã có ${promotion.usedCount || 0} đơn dùng mã, các đơn này vẫn giữ mức giảm. Chỉ dùng khi nhập sai.`
      : 'Giá sản phẩm trở về giá gốc ngay. Các đơn đã đặt vẫn giữ mức giảm. Chỉ dùng khi nhập sai.',
  run: () => endPromotion(promotion.promotionId)
});

export const deleteAction = (promotion) => ({
  promotion,
  title: 'Xóa khuyến mãi?',
  message: 'Xóa vĩnh viễn chương trình',
  deletes: true,
  run: () => deletePromotion(promotion.promotionId)
});
