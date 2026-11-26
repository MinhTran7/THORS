import { useCallback, useEffect, useState } from 'react';
import { fetchProvinces, fetchWards } from 'features/cart/vnAddress';
import { deleteShippingAddress, getShippingAddresses, setDefaultShippingAddress } from 'services/shippingAddressService';

export function useAddresses() {
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setAddresses(await getShippingAddresses());
      setError('');
    } catch (err) {
      setError(err.message || 'Không thể tải danh sách địa chỉ giao hàng.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Gọi API rồi tải lại danh sách; lỗi ném ra để trang hiện trong hộp xác nhận
  const thenReload = (request) => async (address) => {
    await request(address.addressId);
    await reload();
  };

  return {
    addresses,
    loading,
    error,
    clearError: () => setError(''),
    makeDefault: thenReload(setDefaultShippingAddress),
    remove: thenReload(deleteShippingAddress)
  };
}

// Danh sách Tỉnh/Thành phố và Phường/Xã của tỉnh đang chọn
export function useProvinces(provinceCode) {
  const [provinces, setProvinces] = useState([]);
  const [wards, setWards] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchProvinces()
      .then(setProvinces)
      .catch(() => setError('Không tải được danh sách Tỉnh/Thành phố.'));
  }, []);

  useEffect(() => {
    setWards([]);
    if (!provinceCode) return undefined;
    // Đổi tỉnh liên tục: bỏ kết quả của lần tải cũ về muộn
    let alive = true;
    fetchWards(provinceCode)
      .then((list) => alive && setWards(list))
      .catch(() => alive && setError('Không tải được danh sách Phường/Xã.'));
    return () => {
      alive = false;
    };
  }, [provinceCode]);

  return { provinces, wards, error };
}
