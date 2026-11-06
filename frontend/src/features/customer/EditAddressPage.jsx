import { useEffect, useState } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import { useParams } from 'react-router-dom';
import { useCrumbs } from '../../layouts/crumbs';
import { getShippingAddress, updateShippingAddress } from '../../services/shippingAddressService';
import AddressForm from './AddressForm';
import { C } from './theme';

export default function EditAddressPage() {
  useCrumbs(['Tài khoản', 'Địa chỉ của tôi', 'Sửa địa chỉ']);
  const { id } = useParams();
  const [address, setAddress] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getShippingAddress(id)
      .then(setAddress)
      .catch((err) => setError(err.message || 'Không thể tải địa chỉ giao hàng.'));
  }, [id]);

  if (error) return <Typography sx={{ textAlign: 'center', py: 12, color: C.error }}>{error}</Typography>;

  if (!address) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 12 }}>
        <CircularProgress size={36} sx={{ color: C.cyan }} />
      </Box>
    );
  }

  return (
    <AddressForm
      title="Sửa địa chỉ giao hàng"
      subtitle="Cập nhật thông tin nhận hàng của bạn."
      submitLabel="Lưu thay đổi"
      initial={{
        recipientName: address.recipientName,
        phone: address.phone.replace(/^\+84/, '0'),
        provinceCode: address.provinceCode,
        wardCode: address.wardCode,
        addressDetail: address.addressDetail,
        isDefault: address.isDefault
      }}
      lockDefault={address.isDefault}
      onSubmit={(body) => updateShippingAddress(id, body)}
    />
  );
}
