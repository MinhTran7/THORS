package com.thors.config;

import com.thors.module.account.repository.AccountRepository;
import com.thors.module.account.repository.PasswordChangeRequirementRepository;
import com.thors.module.auth.controller.GoogleLoginHandler;
import com.thors.module.auth.controller.FacebookLoginHandler;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.ClientAuthenticationMethod;
import java.util.ArrayList;
import com.thors.security.*;
import org.springframework.context.annotation.*;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.*;
import org.springframework.security.oauth2.client.registration.*;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.*;

@Configuration
public class SecurityConfig {
        // Bộ mã hóa mật khẩu BCrypt (độ khó 12). AuthService.authenticate dùng nó để so mật khẩu nhập vào
        // với password_hash trong bảng user.
        @Bean
        PasswordEncoder passwords() {
                return new BCryptPasswordEncoder(12);
        }

        @Bean
        @org.springframework.boot.autoconfigure.condition.ConditionalOnExpression("${thors.google.enabled:false} or ${thors.facebook.enabled:false}")
        ClientRegistrationRepository googleRegistration(Settings settings) {
                var registrations = new ArrayList<ClientRegistration>();
                if (settings.google().enabled()) {
                        var g = settings.google();
                        var registration = ClientRegistration.withRegistrationId("google")
                                        .clientId(g.clientId())
                                        .clientSecret(g.clientSecret())
                                        .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                                        .redirectUri(g.redirectUri())
                                        .scope("openid", "profile", "email")
                                        .authorizationUri("https://accounts.google.com/o/oauth2/v2/auth")
                                        .tokenUri("https://oauth2.googleapis.com/token")
                                        .jwkSetUri("https://www.googleapis.com/oauth2/v3/certs")
                                        .issuerUri("https://accounts.google.com")
                                        .userInfoUri("https://openidconnect.googleapis.com/v1/userinfo")
                                        .userNameAttributeName("sub")
                                        .clientName("Google")
                                        .build();
                        registrations.add(registration);
                }
                var f = settings.facebook();
                if (f != null && f.enabled()) {
                        if (f.clientId() == null || f.clientId().isBlank() || f.clientSecret() == null
                                        || f.clientSecret().isBlank()
                                        || f.apiVersion() == null || !f.apiVersion().matches("v[0-9]+\\.[0-9]+"))
                                throw new IllegalStateException(
                                                "Cần cấu hình FACEBOOK_CLIENT_ID, FACEBOOK_CLIENT_SECRET và FACEBOOK_API_VERSION.");
                        registrations.add(ClientRegistration.withRegistrationId("facebook")
                                        .clientId(f.clientId()).clientSecret(f.clientSecret())
                                        .clientAuthenticationMethod(ClientAuthenticationMethod.CLIENT_SECRET_POST)
                                        .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                                        .redirectUri(f.redirectUri()).scope("public_profile", "email")
                                        .authorizationUri(
                                                        "https://www.facebook.com/" + f.apiVersion() + "/dialog/oauth")
                                        .tokenUri("https://graph.facebook.com/" + f.apiVersion()
                                                        + "/oauth/access_token")
                                        .userInfoUri("https://graph.facebook.com/" + f.apiVersion()
                                                        + "/me?fields=id,name,email")
                                        .userNameAttributeName("id").clientName("Facebook").build());
                }
                return new InMemoryClientRegistrationRepository(registrations);
        }

        @Bean
        SecurityFilterChain security(
                        HttpSecurity http, Settings settings, AccountRepository users, GoogleLoginHandler handler,
                        FacebookLoginHandler facebookHandler, PasswordChangeRequirementRepository passwordChanges)
                        throws Exception {
                // CSRF: mọi POST/PUT/DELETE phải gửi kèm token lấy từ GET /api/auth/csrf (frontend: http.js
                // refreshCsrf). Token lưu trong session; thiếu hoặc sai → 403, request không tới controller.
                // Các đường dẫn ignoringRequestMatchers bên dưới là webhook do hệ thống ngoài gọi nên được bỏ qua.
                http.csrf(
                                c -> c.csrfTokenRepository(new HttpSessionCsrfTokenRepository())
                                                .csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler())
                                                .ignoringRequestMatchers("/api/payment/payos/webhook",
                                                                // Chỉ endpoint gốc do Meta gọi (không có cookie/CSRF); các
                                                                // endpoint con của màn hình POS vẫn phải gửi CSRF
                                                                "/api/facebook/webhook",
                                                                "/api/returns/public",
                                                                "/api/returns/upload-evidence",
                                                                // GHN gọi webhook từ máy chủ của họ, không có cookie/CSRF; được bảo vệ
                                                                // bằng chuỗi bí mật trong đường dẫn (thors.ghn.webhook-secret)
                                                                "/api/ghn/webhook/**"));
                // Các đường dẫn liệt kê dưới đây gọi được khi CHƯA đăng nhập (permitAll),
                // trong đó có /api/auth/login (đăng nhập bằng email + mật khẩu).
                http.authorizeHttpRequests(
                                a -> a.requestMatchers(
                                                "/api/auth/csrf",
                                                "/api/auth/capabilities",
                                                "/api/auth/facebook/context",
                                                "/api/auth/facebook/email",
                                                "/api/auth/facebook/resend",
                                                "/api/auth/facebook/verify",
                                                "/api/auth/register",
                                                "/api/auth/login",
                                                "/api/auth/activation",
                                                "/api/auth/forgot-password",
                                                "/api/auth/password-reset-requests",
                                                "/api/auth/otp/**",
                                                "/api/auth/reset-password",
                                                "/api/shop/**",
                                                "/oauth2/**",
                                                "/login/oauth2/**",
                                                "/api/payment/payos/webhook",
                                                // Meta xác thực (GET) và đẩy sự kiện (POST) vào đúng đường dẫn gốc này
                                                "/api/facebook/webhook",
                                                "/api/returns/track/**",
                                                "/api/returns/public",
                                                "/api/returns/upload-evidence",
                                                "/api/ghn/webhook/**",
                                                "/error")
                                                .permitAll()
                                                // ── Chặn theo vai trò ngay ở đường dẫn: sai vai trò là 403, không vào tới code
                                                // (các service vẫn tự kiểm tra; đây là lớp chặn thứ hai). Luật cụ thể đặt
                                                // TRƯỚC luật "/**" cùng nhánh vì Spring dừng ở luật khớp đầu tiên.
                                                // Đổi trả: khách chỉ được gửi yêu cầu cho đơn của mình (POST); còn lại là
                                                // màn quản lý của chủ shop. track/public/upload-evidence đã permitAll ở trên.
                                                .requestMatchers(HttpMethod.POST, "/api/returns")
                                                .hasAnyRole("CUSTOMER", "OWNER")
                                                .requestMatchers("/api/returns", "/api/returns/**")
                                                .hasRole("OWNER")
                                                // Danh mục bản quản trị (cửa hàng dùng /api/shop/categories)
                                                .requestMatchers(HttpMethod.GET, "/api/categories", "/api/categories/**")
                                                .hasAnyRole("OWNER", "FAMILY_MEMBER", "STAFF")
                                                // Khuyến mãi: khách chỉ xem voucher của mình lúc thanh toán (GET danh sách)
                                                .requestMatchers(HttpMethod.GET, "/api/promotions")
                                                .hasAnyRole("OWNER", "CUSTOMER")
                                                .requestMatchers("/api/promotions", "/api/promotions/**")
                                                .hasRole("OWNER")
                                                // Bán tại quầy, cài đặt website, nhật ký hệ thống
                                                .requestMatchers("/api/sales/**")
                                                .hasAnyRole("OWNER", "FAMILY_MEMBER")
                                                .requestMatchers("/api/website-settings")
                                                .hasRole("OWNER")
                                                .requestMatchers("/api/audit-logs", "/api/audit-logs/**")
                                                .hasRole("ADMIN")
                                                // Tài khoản: hồ sơ của chính mình thì ai cũng dùng; quản lý tài khoản là Admin/Owner
                                                .requestMatchers("/api/accounts/profile", "/api/accounts/profile/**")
                                                .authenticated()
                                                .requestMatchers("/api/accounts", "/api/accounts/**")
                                                .hasAnyRole("ADMIN", "OWNER")
                                                // Chat: hộp thư cửa hàng / cài đặt / khung chat của khách
                                                .requestMatchers("/api/chat/settings")
                                                .hasRole("OWNER")
                                                .requestMatchers("/api/chat/conversations", "/api/chat/conversations/**", "/api/chat/quick-replies")
                                                .hasAnyRole("OWNER", "FAMILY_MEMBER")
                                                .requestMatchers("/api/chat/me", "/api/chat/me/**")
                                                .hasRole("CUSTOMER")
                                                // Đơn online: các thao tác chỉ phía cửa hàng (khách vẫn xem / hủy đơn của mình)
                                                .requestMatchers("/api/ghn/suggest")
                                                .hasAnyRole("OWNER", "FAMILY_MEMBER")
                                                .requestMatchers("/api/orders/counts", "/api/orders/delivery-proof/required", "/api/orders/*/delivery-suggestion")
                                                .hasAnyRole("OWNER", "FAMILY_MEMBER")
                                                .requestMatchers(HttpMethod.POST, "/api/orders/*/delivered")
                                                .hasAnyRole("OWNER", "FAMILY_MEMBER")
                                                .requestMatchers(HttpMethod.POST, "/api/orders/*/refunded")
                                                .hasRole("OWNER")
                                                // Chức năng của khách: chỉ tài khoản khách hàng (quản trị không dùng giỏ hàng,
                                                // đặt hàng, sổ địa chỉ, số đo, phối đồ theo số đo, mặc thử)
                                                .requestMatchers(HttpMethod.POST, "/api/checkout")
                                                .hasRole("CUSTOMER")
                                                .requestMatchers("/api/cart", "/api/cart/**", "/api/addresses", "/api/addresses/**",
                                                                "/api/customer/addresses", "/api/customer/addresses/**",
                                                                "/api/body-profile/**", "/api/try-on/**")
                                                .hasRole("CUSTOMER")
                                                .requestMatchers("/api/warehouse", "/api/warehouse/**")
                                                .hasAnyRole("OWNER", "FAMILY_MEMBER")
                                                // Màn hình Social POS: đọc chat, gửi tin, tạo đơn — cùng quyền với route /facebook
                                                .requestMatchers("/api/facebook/webhook/**")
                                                .hasAnyRole("OWNER", "FAMILY_MEMBER")
                                                // Thêm/sửa/xóa sản phẩm và danh mục: chỉ Owner (cùng quyền với route
                                                // /products, /categories). Đọc (GET) vẫn mở cho POS, Facebook, kho...
                                                // Bảng điều khiển: Owner (toàn cửa hàng), Family Member (doanh số của mình)
                                                .requestMatchers("/api/dashboard/**")
                                                .hasAnyRole("OWNER", "FAMILY_MEMBER")
                                                // Xem danh sách/chi tiết sản phẩm quản trị (gồm sản phẩm ẩn, tồn thật):
                                                // Owner, Family Member, Staff (POS, Facebook, khuyến mãi, tra cứu kho). Khách dùng /api/shop/**
                                                .requestMatchers(HttpMethod.GET, "/api/products", "/api/products/**")
                                                .hasAnyRole("OWNER", "FAMILY_MEMBER", "STAFF")
                                                // Tạo danh mục: cả Family Member (hộp thoại tạo nhanh khi lập phiếu kho)
                                                .requestMatchers(HttpMethod.POST, "/api/categories")
                                                .hasAnyRole("OWNER", "FAMILY_MEMBER")
                                                .requestMatchers(HttpMethod.POST, "/api/products", "/api/products/**",
                                                                "/api/categories/**")
                                                .hasRole("OWNER")
                                                .requestMatchers(HttpMethod.PUT, "/api/products/**", "/api/categories/**")
                                                .hasRole("OWNER")
                                                .requestMatchers(HttpMethod.PATCH, "/api/products/**", "/api/categories/**")
                                                .hasRole("OWNER")
                                                .requestMatchers(HttpMethod.DELETE, "/api/products/**", "/api/categories/**")
                                                .hasRole("OWNER")
                                                .anyRequest()
                                                .authenticated());
                http.requestCache(c -> c.disable())
                                .formLogin(c -> c.disable())
                                .httpBasic(c -> c.disable())
                                .logout(c -> c.disable());
                http.exceptionHandling(
                                c -> c.authenticationEntryPoint(
                                                (req, res, e) -> {
                                                        res.setStatus(401);
                                                        res.setContentType("application/json;charset=UTF-8");
                                                        res.getWriter()
                                                                        .write(
                                                                                        "{\"code\":\"UNAUTHENTICATED\",\"message\":\"Vui lòng đăng nhập.\"}");
                                                })
                                                .accessDeniedHandler(
                                                                (req, res, e) -> {
                                                                        res.setStatus(403);
                                                                        res.setContentType(
                                                                                        "application/json;charset=UTF-8");
                                                                        res.getWriter()
                                                                                        .write(
                                                                                                        "{\"code\":\"FORBIDDEN\",\"message\":\"Yêu cầu không hợp lệ hoặc"
                                                                                                                        + " không có quyền truy cập.\"}");
                                                                }));
                http.addFilterAfter(
                                new AccountStateFilter(users, passwordChanges),
                                org.springframework.security.web.context.SecurityContextHolderFilter.class);
                if (settings.google().enabled() || (settings.facebook() != null && settings.facebook().enabled()))
                        http.oauth2Login(
                                        c -> c.successHandler((req, res, auth) -> {
                                                                           if (auth instanceof OAuth2AuthenticationToken token && "facebook"
                                                                .equals(token.getAuthorizedClientRegistrationId()))
                                                        facebookHandler.onAuthenticationSuccess(req, res, auth);
                                                else
                                                        handler.onAuthenticationSuccess(req, res, auth);
                                        })
                                                        .failureHandler(
                                                                        (req, res, e) -> {
                                                                                // Log the real cause (e.g. invalid_token_response, redirect_uri mismatch);
                                                                                // the user only sees a generic "failed" message.
                                                                                org.slf4j.LoggerFactory.getLogger(SecurityConfig.class)
                                                                                                .warn("OAuth2 login failed at {}: {}", req.getRequestURI(),
                                                                                                                e.getMessage(), e);
                                                                                var session = req.getSession(false);
                                                                                if (session != null) {
                                                                                        session.removeAttribute(
                                                                                                        "GOOGLE_LINK_USER");
                                                                                        session.removeAttribute(
                                                                                                        "GOOGLE_LINK_AT");
                                                                                        session.removeAttribute(
                                                                                                        "FACEBOOK_LINK_USER");
                                                                                        session.removeAttribute(
                                                                                                        "FACEBOOK_LINK_AT");
                                                                                        session.removeAttribute(
                                                                                                        "FACEBOOK_PENDING");
                                                                                        session.removeAttribute(
                                                                                                        "FACEBOOK_CHALLENGE");
                                                                                }
                                                                                res.sendRedirect(settings.frontendUrl()
                                                                                                + "/login?error="
                                                                                                + (req.getRequestURI()
                                                                                                                .endsWith("/facebook")
                                                                                                                                ? "facebook_failed"
                                                                                                                                : "google_failed"));
                                                                        }));
                return http.build();
        }
}
