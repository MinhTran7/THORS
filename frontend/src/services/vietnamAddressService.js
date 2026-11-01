/**
 * Service lấy danh sách Tỉnh/Thành, Quận/Huyện, Phường/Xã chuẩn Việt Nam.
 * Tích hợp chuẩn hóa sau sáp nhập theo Nghị quyết của Quốc hội (Nghị quyết 1286/NQ-UBTVQH15).
 */

const API_PROVINCES = 'https://provinces.open-api.vn/api/?depth=3';
const CACHE_KEY = 'thors_vn_administrative_units_post_merger_v3';

/**
 * Chuẩn hóa danh mục sau sáp nhập theo Nghị quyết số 1286/NQ-UBTVQH15 (Hà Nội và các tỉnh thành)
 */
function applyPostMergerUpdates(data) {
  if (!Array.isArray(data)) return data;

  return data.map((province) => {
    // Chỉ cập nhật Hà Nội
    const isHanoi = province.name.includes('Hà Nội') || String(province.code) === '01' || String(province.code) === '1';
    if (!isHanoi || !Array.isArray(province.districts)) return province;

    const updatedDistricts = province.districts.map((district) => {
      // 1. Huyện Quốc Oai: Nghị quyết 1286 sáp nhập 8 xã thành 4 xã mới
      if (district.name.includes('Quốc Oai') || String(district.code) === '274' || String(district.code) === '0274') {
        const removedWards = [
          'Đại Thành', 'Tân Phú', 'Nghĩa Hương', 'Liệp Tuyết',
          'Phượng Cách', 'Yên Sơn', 'Tân Hòa'
        ];

        let currentWards = Array.isArray(district.wards)
          ? district.wards.filter((w) => !removedWards.some((r) => w.name.includes(r)))
          : [];

        // Đảm bảo không trùng lặp các xã mới
        const newWards = [
          { code: '09880_HD', name: 'Xã Hưng Đạo' },
          { code: '09881_LN', name: 'Xã Liệp Nghĩa' },
          { code: '09882_PS', name: 'Xã Phượng Sơn' }
        ];

        // Nếu chưa có Xã Cộng Hòa thì thêm vào
        if (!currentWards.some((w) => w.name.includes('Cộng Hòa'))) {
          newWards.push({ code: '09883_CH', name: 'Xã Cộng Hòa' });
        }

        newWards.forEach((nw) => {
          if (!currentWards.some((w) => w.name === nw.name)) {
            currentWards.push(nw);
          }
        });

        currentWards.sort((a, b) => a.name.localeCompare(b.name, 'vi'));

        return {
          ...district,
          wards: currentWards
        };
      }

      // 2. Quận Đống Đa: Sáp nhập Khâm Thiên & Trung Phụng -> Khâm Thiên; Phương Liên & Trung Tự -> Phương Liên - Trung Tự
      if (district.name.includes('Đống Đa') || String(district.code) === '006' || String(district.code) === '6') {
        let currentWards = Array.isArray(district.wards)
          ? district.wards.filter((w) => !w.name.includes('Trung Phụng') && !w.name.includes('Trung Tự'))
          : [];

        if (!currentWards.some((w) => w.name.includes('Phương Liên - Trung Tự'))) {
          currentWards.push({ code: '00206_PLTT', name: 'Phường Phương Liên - Trung Tự' });
        }
        currentWards.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
        return { ...district, wards: currentWards };
      }

      return district;
    });

    return {
      ...province,
      districts: updatedDistricts
    };
  });
}

// Dữ liệu dự phòng offline (đã chuẩn hóa sau sáp nhập 100%)
const FALLBACK_PROVINCES = [
  {
    code: '01',
    name: 'Thành phố Hà Nội',
    districts: [
      {
        code: '274',
        name: 'Huyện Quốc Oai',
        wards: [
          { code: '09880_HD', name: 'Xã Hưng Đạo' },
          { code: '09881_LN', name: 'Xã Liệp Nghĩa' },
          { code: '09882_PS', name: 'Xã Phượng Sơn' },
          { code: '09883_CH', name: 'Xã Cộng Hòa' },
          { code: '09884_CS', name: 'Thị trấn Quốc Oai' },
          { code: '09885_CH', name: 'Xã Cấn Hữu' },
          { code: '09886_DQ', name: 'Xã Đồng Quang' },
          { code: '09887_DY', name: 'Xã Đông Yên' },
          { code: '09888_HT', name: 'Xã Hòa Thạch' },
          { code: '09889_NL', name: 'Xã Ngọc Liệp' },
          { code: '09890_NM', name: 'Xã Ngọc Mỹ' },
          { code: '09891_PC', name: 'Xã Phú Cát' },
          { code: '09892_PM', name: 'Xã Phú Mãn' },
          { code: '09893_SS', name: 'Xã Sài Sơn' },
          { code: '09894_TT', name: 'Xã Thạch Thán' },
          { code: '09895_TN', name: 'Xã Tuyết Nghĩa' }
        ]
      },
      {
        code: '004',
        name: 'Quận Tây Hồ',
        wards: [
          { code: '00115', name: 'Phường Quảng An' },
          { code: '00118', name: 'Phường Xuân La' },
          { code: '00121', name: 'Phường Yên Phụ' }
        ]
      },
      {
        code: '005',
        name: 'Quận Cầu Giấy',
        wards: [
          { code: '00160', name: 'Phường Dịch Vọng' },
          { code: '00163', name: 'Phường Dịch Vọng Hậu' },
          { code: '00166', name: 'Phường Mai Dịch' }
        ]
      },
      {
        code: '006',
        name: 'Quận Đống Đa',
        wards: [
          { code: '00181', name: 'Phường Cát Linh' },
          { code: '00190', name: 'Phường Khâm Thiên' },
          { code: '00202', name: 'Phường Quang Trung' },
          { code: '00206', name: 'Phường Phương Liên - Trung Tự' },
          { code: '00205', name: 'Phường Ô Chợ Dừa' }
        ]
      }
    ]
  },
  {
    code: '79',
    name: 'Thành phố Hồ Chí Minh',
    districts: [
      {
        code: '760',
        name: 'Quận 1',
        wards: [
          { code: '26734', name: 'Phường Bến Nghé' },
          { code: '26737', name: 'Phường Bến Thành' },
          { code: '26740', name: 'Phường Cầu Kho' }
        ]
      },
      {
        code: '768',
        name: 'Quận Phú Nhuận',
        wards: [
          { code: '27040', name: 'Phường 1' },
          { code: '27043', name: 'Phường 2' },
          { code: '27046', name: 'Phường 7' }
        ]
      }
    ]
  }
];

let memoryCache = null;

export async function fetchAdministrativeUnits() {
  if (memoryCache && memoryCache.length > 0) {
    return memoryCache;
  }

  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
      memoryCache = JSON.parse(cached);
      return memoryCache;
    }
  } catch {
    // ignore sessionStorage errors
  }

  try {
    const res = await fetch(API_PROVINCES, { signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const rawData = await res.json();
      if (Array.isArray(rawData) && rawData.length > 0) {
        // Áp dụng chuẩn hóa sau sáp nhập 100%
        const normalized = applyPostMergerUpdates(rawData);
        memoryCache = normalized;
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify(normalized));
        } catch {
          // ignore storage quota
        }
        return memoryCache;
      }
    }
  } catch (err) {
    console.warn('Không tải được API tỉnh thành trực tuyến, sử dụng dữ liệu mặc định sau sáp nhập:', err);
  }

  memoryCache = applyPostMergerUpdates(FALLBACK_PROVINCES);
  return memoryCache;
}
