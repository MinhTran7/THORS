# Bản đồ source và nhận diện snapshot

Các path dưới đây tính từ thư mục gốc dự án. Số dòng theo snapshot 28/10/2026, có thể đổi sau khi sửa. Mở source liên quan trước khi dùng tài liệu để thực hiện thay đổi.

## Nhận diện đầu vào

- Tệp: `THORS_Git.zip`.
- SHA-256 ZIP: `2e3cc0f0146205d8ffcbb83550afbb7089154b28138347d03ecb7b923b8be4d6`.
- Git branch: `Minh_Tran`; HEAD: `c76cb9d` ngày 22/10/2026.
- ZIP có thay đổi chưa commit, nên không chỉ dựa vào HEAD để tái tạo checkpoint.
- Đọc source chính; node_modules/target là dependency/build output. JAR target cũ không đại diện source mới.

## Điểm vào quan trọng

| Nhu cầu | File và vị trí |
|---|---|
| Router thực tế | `frontend/src/routes/index.jsx:18` |
| Layout/menu thực tế | `frontend/src/layouts/ThorsLayout.jsx:36` |
| Menu role cũ cần đối chiếu | `frontend/src/layouts/navigation.jsx:7` |
| HTTP/CSRF/multipart | `frontend/src/services/http.js:17` |
| Proxy Vite | `frontend/vite.config.mjs:4` |
| Auth state | `frontend/src/features/auth/AuthProvider.jsx:4` |
| Các trang con kho | `frontend/src/features/warehouse/WarehousePage.jsx:95` |
| SWR/reload sau mutation | `frontend/src/features/warehouse/WarehouseContext.jsx:7` |
| Lưu nháp và import form | `frontend/src/features/warehouse/DocumentForm.jsx:128` |
| Kiểm tra Excel | `frontend/src/features/warehouse/excelImport.js:136` |
| Đọc workbook | `frontend/src/features/warehouse/excelWorkbook.js:45` |
| Tạo mẫu Excel | `frontend/src/features/warehouse/excelWorkbook.js:150` |
| Dialog import | `frontend/src/features/warehouse/ExcelImportDialog.jsx:40` |
| Sơ đồ/drag/UI vị trí | `frontend/src/features/warehouse/LocationsPage.jsx:789` |
| Hình học frontend | `frontend/src/features/warehouse/rackLayout.js:123` |
| Security rule | `backend/src/main/java/com/thors/config/SecurityConfig.java:68` |
| Auth email-only | `backend/src/main/java/com/thors/module/auth/service/AuthService.java:48` |
| Capabilities SMS=false | `backend/src/main/java/com/thors/module/auth/controller/AuthController.java:52` |
| Phạm vi quản lý account | `backend/src/main/java/com/thors/module/account/service/AccountService.java:83` |
| Alias auth từ audit | `backend/src/main/java/com/thors/module/account/repository/AccountRepository.java:26` |
| Endpoint kho | `backend/src/main/java/com/thors/module/warehouse/WarehouseController.java:12` |
| Quyền kho | `backend/src/main/java/com/thors/module/warehouse/WarehousePolicy.java:8` |
| Transaction/khóa kho | `backend/src/main/java/com/thors/module/warehouse/WarehouseStore.java:71` |
| Tạo chứng từ | `backend/src/main/java/com/thors/module/warehouse/WarehouseDocuments.java:127` |
| Xác nhận/tăng tồn | `backend/src/main/java/com/thors/module/warehouse/WarehouseDocuments.java:224` |
| Trả NCC/trừ tồn | `backend/src/main/java/com/thors/module/warehouse/WarehouseDocuments.java:278` |
| Đóng/hủy/từ chối | `backend/src/main/java/com/thors/module/warehouse/WarehouseDocuments.java:360` |
| Snapshot/tồn suy ra | `backend/src/main/java/com/thors/module/warehouse/WarehouseLayout.java:32` |
| Đặt kệ tương đối | `backend/src/main/java/com/thors/module/warehouse/WarehouseLayout.java:128` |
| Chuyển vị trí | `backend/src/main/java/com/thors/module/warehouse/WarehouseLayout.java:446` |
| Ảnh local kho | `backend/src/main/java/com/thors/module/warehouse/WarehousePhotos.java:14` |
| Hình học backend | `backend/src/main/java/com/thors/module/warehouse/RackGeometry.java:8` |
| Khóa Cloudinary bắt buộc | `backend/src/main/java/com/thors/config/CloudinaryConfig.java:15` |
| Tạo biến thể tổng tồn=0 | `backend/src/main/java/com/thors/module/product/repository/ProductRepository.java:272` |
| Ảnh sản phẩm | `backend/src/main/java/com/thors/module/product/service/ProductImageService.java:14` |
| Avatar unsigned | `frontend/src/services/imageUpload.js:10` |
| CHECK loại chứng từ | `database/SQL_v1.sql:911` |
| CHECK loại movement | `database/SQL_v1.sql:878` |
| Script ưu tiên JAR | `scripts/start-backend.ps1:6` |
| CI | `.github/workflows/ci.yml:1` |

## Danh mục file nghiệp vụ frontend

### account

- `frontend/src/features/account/WorkspacePage.jsx`
- `frontend/src/features/account/api.js`
- `frontend/src/features/account/components/Blocks.jsx`
- `frontend/src/features/account/components/Brand.jsx`
- `frontend/src/features/account/components/Chips.jsx`
- `frontend/src/features/account/components/Flex.jsx`
- `frontend/src/features/account/components/Form.jsx`
- `frontend/src/features/account/components/ResetPasswordDialog.jsx`
- `frontend/src/features/account/components/Toast.jsx`
- `frontend/src/features/account/components/UserAvatar.jsx`
- `frontend/src/features/account/constants.js`
- `frontend/src/features/account/format.js`
- `frontend/src/features/account/hooks.js`
- `frontend/src/features/account/pages/AccountListPage.jsx`
- `frontend/src/features/account/pages/ChangePasswordPage.jsx`
- `frontend/src/features/account/pages/ProfilePage.jsx`
- `frontend/src/features/account/pages/StaffDetailPage.jsx`
- `frontend/src/features/account/pages/StaffFormPage.jsx`
- `frontend/src/features/account/pages/StaffListPage.jsx`
- `frontend/src/features/account/pages/SystemLogPage.jsx`
- `frontend/src/features/account/pages/UpdateProfilePage.jsx`
- `frontend/src/features/account/tokens.js`
- `frontend/src/features/account/validation.js`

### auth

- `frontend/src/features/auth/AuthProvider.jsx`
- `frontend/src/features/auth/RequireAuth.jsx`
- `frontend/src/features/auth/components/AuthForm.jsx`
- `frontend/src/features/auth/components/ChannelPicker.jsx`
- `frontend/src/features/auth/components/ShopAuthShell.css`
- `frontend/src/features/auth/components/ShopAuthShell.jsx`
- `frontend/src/features/auth/pages/FacebookComplete.jsx`
- `frontend/src/features/auth/pages/ForgotPage.jsx`
- `frontend/src/features/auth/pages/GoogleCallback.jsx`
- `frontend/src/features/auth/pages/LoginPage.jsx`
- `frontend/src/features/auth/pages/RegisterPage.jsx`
- `frontend/src/features/auth/pages/ResetPage.jsx`
- `frontend/src/features/auth/pages/VerifyPage.jsx`
- `frontend/src/features/auth/validation.js`

### category

- `frontend/src/features/category/CategoryPage.jsx`

### product

- `frontend/src/features/product/AddProductPage.jsx`
- `frontend/src/features/product/EditProductPage.jsx`
- `frontend/src/features/product/ProductDetailPage.jsx`
- `frontend/src/features/product/ProductPage.jsx`

### warehouse

- `frontend/src/features/warehouse/DocumentForm.jsx`
- `frontend/src/features/warehouse/DocumentsPage.jsx`
- `frontend/src/features/warehouse/ExcelImportDialog.jsx`
- `frontend/src/features/warehouse/InventoryPage.jsx`
- `frontend/src/features/warehouse/LocationsPage.jsx`
- `frontend/src/features/warehouse/SuppliersPage.jsx`
- `frontend/src/features/warehouse/WarehouseContext.jsx`
- `frontend/src/features/warehouse/WarehousePage.jsx`
- `frontend/src/features/warehouse/components.jsx`
- `frontend/src/features/warehouse/excelImport.js`
- `frontend/src/features/warehouse/excelWorkbook.js`
- `frontend/src/features/warehouse/model.js`
- `frontend/src/features/warehouse/rackLayout.js`

## Danh mục Java chính

- `backend/src/main/java/com/thors/ThorsApplication.java`
- `backend/src/main/java/com/thors/common/ApiErrors.java`
- `backend/src/main/java/com/thors/common/ApiException.java`
- `backend/src/main/java/com/thors/common/ContactNormalizer.java`
- `backend/src/main/java/com/thors/config/CloudinaryConfig.java`
- `backend/src/main/java/com/thors/config/OtpKeyProvider.java`
- `backend/src/main/java/com/thors/config/SecurityConfig.java`
- `backend/src/main/java/com/thors/config/Settings.java`
- `backend/src/main/java/com/thors/config/StartupChecks.java`
- `backend/src/main/java/com/thors/integration/otp/ConfiguredOtpSender.java`
- `backend/src/main/java/com/thors/integration/otp/OtpSender.java`
- `backend/src/main/java/com/thors/module/account/controller/AccountController.java`
- `backend/src/main/java/com/thors/module/account/controller/AuditLogController.java`
- `backend/src/main/java/com/thors/module/account/controller/PasswordResetRequestController.java`
- `backend/src/main/java/com/thors/module/account/dto/AccountDetail.java`
- `backend/src/main/java/com/thors/module/account/dto/AccountPage.java`
- `backend/src/main/java/com/thors/module/account/dto/AccountRequests.java`
- `backend/src/main/java/com/thors/module/account/dto/AccountSummary.java`
- `backend/src/main/java/com/thors/module/account/dto/AccountView.java`
- `backend/src/main/java/com/thors/module/account/dto/AuditLogViews.java`
- `backend/src/main/java/com/thors/module/account/entity/Account.java`
- `backend/src/main/java/com/thors/module/account/mapper/AccountMapper.java`
- `backend/src/main/java/com/thors/module/account/repository/AccountDetailRepository.java`
- `backend/src/main/java/com/thors/module/account/repository/AccountRepository.java`
- `backend/src/main/java/com/thors/module/account/repository/AuditLogRepository.java`
- `backend/src/main/java/com/thors/module/account/service/AccountService.java`
- `backend/src/main/java/com/thors/module/account/service/AuditLogService.java`
- `backend/src/main/java/com/thors/module/auth/controller/AuthController.java`
- `backend/src/main/java/com/thors/module/auth/controller/FacebookController.java`
- `backend/src/main/java/com/thors/module/auth/dto/AuthRequests.java`
- `backend/src/main/java/com/thors/module/auth/entity/OtpChallenge.java`
- `backend/src/main/java/com/thors/module/auth/repository/OtpRepository.java`
- `backend/src/main/java/com/thors/module/auth/service/AuthService.java`
- `backend/src/main/java/com/thors/module/auth/service/FacebookAccountService.java`
- `backend/src/main/java/com/thors/module/auth/service/FacebookLoginHandler.java`
- `backend/src/main/java/com/thors/module/auth/service/GoogleAccountService.java`
- `backend/src/main/java/com/thors/module/auth/service/GoogleLoginHandler.java`
- `backend/src/main/java/com/thors/module/auth/service/OtpService.java`
- `backend/src/main/java/com/thors/module/category/controller/CategoryController.java`
- `backend/src/main/java/com/thors/module/category/dto/CreateCategoryRequest.java`
- `backend/src/main/java/com/thors/module/category/dto/UpdateCategoryRequest.java`
- `backend/src/main/java/com/thors/module/category/dto/UpdateCategoryStatusRequest.java`
- `backend/src/main/java/com/thors/module/category/entity/Category.java`
- `backend/src/main/java/com/thors/module/category/mapper/CategoryMapper.java`
- `backend/src/main/java/com/thors/module/category/repository/CategoryRepository.java`
- `backend/src/main/java/com/thors/module/category/service/CategoryService.java`
- `backend/src/main/java/com/thors/module/product/controller/ProductController.java`
- `backend/src/main/java/com/thors/module/product/dto/ChangeProductStatusRequest.java`
- `backend/src/main/java/com/thors/module/product/dto/CreateProductRequest.java`
- `backend/src/main/java/com/thors/module/product/dto/UpdateProductRequest.java`
- `backend/src/main/java/com/thors/module/product/entity/Product.java`
- `backend/src/main/java/com/thors/module/product/mapper/ProductMapper.java`
- `backend/src/main/java/com/thors/module/product/repository/ProductImageRepository.java`
- `backend/src/main/java/com/thors/module/product/repository/ProductRepository.java`
- `backend/src/main/java/com/thors/module/product/service/ProductImageService.java`
- `backend/src/main/java/com/thors/module/product/service/ProductService.java`
- `backend/src/main/java/com/thors/module/warehouse/RackGeometry.java`
- `backend/src/main/java/com/thors/module/warehouse/WarehouseController.java`
- `backend/src/main/java/com/thors/module/warehouse/WarehouseDocuments.java`
- `backend/src/main/java/com/thors/module/warehouse/WarehouseLayout.java`
- `backend/src/main/java/com/thors/module/warehouse/WarehousePhotos.java`
- `backend/src/main/java/com/thors/module/warehouse/WarehousePolicy.java`
- `backend/src/main/java/com/thors/module/warehouse/WarehouseRequests.java`
- `backend/src/main/java/com/thors/module/warehouse/WarehouseStore.java`
- `backend/src/main/java/com/thors/security/AccountStateFilter.java`
- `backend/src/main/java/com/thors/security/RequestLimitFilter.java`
- `backend/src/main/java/com/thors/security/SessionAccess.java`
- `backend/src/main/java/com/thors/security/SessionUser.java`

## Hash một số file quyết định trạng thái

| File | SHA-256 |
|---|---|
| `frontend/src/routes/index.jsx` | `80a3b51d5bf2b8612408ed5c297d890494ad1433dd6f4a82e639a84a8ed7ee96` |
| `frontend/src/features/warehouse/DocumentForm.jsx` | `20cc7301923856e7897e26adad28e805a874eeb4b1135fad25ad4897f8dfdb70` |
| `frontend/src/features/warehouse/excelImport.js` | `cef542da3a5e7dbbb0ea5216d414f1444024fac79b9843962eceab6b8880c3c3` |
| `frontend/src/features/warehouse/excelWorkbook.js` | `a50532a8485c76e7d508cac45e8cfd660b057037ca3afd515f116eaee58dec13` |
| `frontend/src/features/warehouse/rackLayout.js` | `b0b11d19bd1d8f4ecf8542c7fe4a707791fa2f657b1de51bd95fd243e49beccd` |
| `backend/src/main/java/com/thors/module/warehouse/WarehouseDocuments.java` | `c700ccc448934f917694608589143e8fd9002a7ddd2da475d5afa413a6b42e7c` |
| `backend/src/main/java/com/thors/module/warehouse/WarehouseLayout.java` | `30045a9de2dc0afc72b994987f4d6bb6927859a02ff0392e36f145cf128e1698` |
| `backend/src/main/java/com/thors/module/warehouse/RackGeometry.java` | `89729facba4a8e007962e24eaaf939bdf46157c2bdc62891362b9b8a01b7691f` |
| `database/SQL_v1.sql` | `1949ef34e6d0b4d1be9bc3703913be3eab31c4bd363ba7b4d32117a5e0d7b92a` |

Không hash/copy giá trị local.properties vào tài liệu. Hash giúp nhận biết file đã đổi, không thay cho việc đọc diff hoặc kiểm thử.
