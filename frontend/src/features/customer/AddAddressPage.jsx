import { useCrumbs } from '../../layouts/crumbs';
import { createShippingAddress } from '../../services/shippingAddressService';
import AddressForm from './AddressForm';

export default function AddAddressPage() {
  useCrumbs(['Tài khoản', 'Địa chỉ của tôi', 'Thêm địa chỉ']);

  return (
    <AddressForm
      title="Thêm địa chỉ giao hàng"
      subtitle="Lưu một điểm nhận hàng mới cho những lần mua sắm tiếp theo."
      submitLabel="Thêm địa chỉ"
      onSubmit={createShippingAddress}
    />
  );
}
