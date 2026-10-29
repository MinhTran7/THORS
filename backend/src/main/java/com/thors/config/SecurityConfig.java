package com.thors.config;

import com.thors.module.account.repository.AccountRepository;
import com.thors.module.auth.service.GoogleLoginHandler;
import com.thors.module.auth.service.FacebookLoginHandler;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.ClientAuthenticationMethod;
import java.util.ArrayList;
import com.thors.security.*;
import org.springframework.context.annotation.*;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.*;
import org.springframework.security.oauth2.client.registration.*;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.*;

@Configuration
public class SecurityConfig {
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
            var registration =
                    ClientRegistration.withRegistrationId("google")
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
            if (f.clientId() == null || f.clientId().isBlank() || f.clientSecret() == null || f.clientSecret().isBlank()
                    || f.apiVersion() == null || !f.apiVersion().matches("v[0-9]+\\.[0-9]+"))
                throw new IllegalStateException("Cần cấu hình FACEBOOK_CLIENT_ID, FACEBOOK_CLIENT_SECRET và FACEBOOK_API_VERSION.");
            registrations.add(ClientRegistration.withRegistrationId("facebook")
                    .clientId(f.clientId()).clientSecret(f.clientSecret())
                    .clientAuthenticationMethod(ClientAuthenticationMethod.CLIENT_SECRET_POST)
                    .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                    .redirectUri(f.redirectUri()).scope("public_profile", "email")
                    .authorizationUri("https://www.facebook.com/" + f.apiVersion() + "/dialog/oauth")
                    .tokenUri("https://graph.facebook.com/" + f.apiVersion() + "/oauth/access_token")
                    .userInfoUri("https://graph.facebook.com/" + f.apiVersion() + "/me?fields=id,name,email")
                    .userNameAttributeName("id").clientName("Facebook").build());
        }
        return new InMemoryClientRegistrationRepository(registrations);
    }

    @Bean
    SecurityFilterChain security(
            HttpSecurity http, Settings settings, AccountRepository users, GoogleLoginHandler handler, FacebookLoginHandler facebookHandler)
            throws Exception {
        http.csrf(
                c ->
                        c.csrfTokenRepository(new HttpSessionCsrfTokenRepository())
                                .csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler()));
        http.authorizeHttpRequests(
                a ->
                        a.requestMatchers(
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
                                        "/api/auth/otp/**",
                                        "/api/auth/reset-password",
                                        "/oauth2/**",
                                        "/login/oauth2/**",
                                        "/error")
                                .permitAll()
                                .requestMatchers("/api/warehouse", "/api/warehouse/**")
                                .hasAnyRole("OWNER", "FAMILY_MEMBER")
                                .anyRequest()
                                .authenticated());
        http.requestCache(c -> c.disable())
                .formLogin(c -> c.disable())
                .httpBasic(c -> c.disable())
                .logout(c -> c.disable());
        http.exceptionHandling(
                c ->
                        c.authenticationEntryPoint(
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
                                            res.setContentType("application/json;charset=UTF-8");
                                            res.getWriter()
                                                    .write(
                                                            "{\"code\":\"FORBIDDEN\",\"message\":\"Yêu cầu không hợp lệ hoặc"
                                                                    + " không có quyền truy cập.\"}");
                                        }));
        http.addFilterAfter(
                new AccountStateFilter(users),
                org.springframework.security.web.context.SecurityContextHolderFilter.class);
        if (settings.google().enabled() || (settings.facebook() != null && settings.facebook().enabled()))
            http.oauth2Login(
                    c ->
                            c.successHandler((req, res, auth) -> {
                                        if (auth instanceof OAuth2AuthenticationToken token && "facebook".equals(token.getAuthorizedClientRegistrationId()))
                                            facebookHandler.onAuthenticationSuccess(req, res, auth);
                                        else handler.onAuthenticationSuccess(req, res, auth);
                                    })
                                    .failureHandler(
                                            (req, res, e) -> {
                                                var session = req.getSession(false);
                                                if (session != null) {
                                                    session.removeAttribute("GOOGLE_LINK_USER");
                                                    session.removeAttribute("GOOGLE_LINK_AT");
                                                    session.removeAttribute("FACEBOOK_LINK_USER");
                                                    session.removeAttribute("FACEBOOK_LINK_AT");
                                                    session.removeAttribute("FACEBOOK_PENDING");
                                                    session.removeAttribute("FACEBOOK_CHALLENGE");
                                                }
                                                res.sendRedirect(settings.frontendUrl() + "/login?error=" + (req.getRequestURI().endsWith("/facebook") ? "facebook_failed" : "google_failed"));
                                            }));
        return http.build();
    }
}
