import { useCrumbs } from 'layouts/crumbs';
import { createShippingAddress } from 'services/shippingAddressService';
import AddressForm from '../components/AddressForm';

export default function AddAddressPage() {
  useCrumbs(['Tài khoản', 'Địa chỉ của tôi', 'Thêm địa chỉ']);
  return <AddressForm title="Thêm địa chỉ giao hàng" submitLabel="Thêm địa chỉ" onSubmit={createShippingAddress} />;
}
