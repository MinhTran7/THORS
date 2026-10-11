package com.thors.config;

import com.thors.module.account.repository.AccountRepository;
import com.thors.module.auth.service.GoogleLoginHandler;
import com.thors.security.*;
import org.springframework.context.annotation.*;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.*;
import org.springframework.security.oauth2.client.registration.*;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.AuthorizationFilter;
import org.springframework.security.web.csrf.*;

@Configuration
public class SecurityConfig {
  @Bean
  PasswordEncoder passwords() {
    return new BCryptPasswordEncoder(12);
  }

  @Bean
  @org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(
      name = "thors.google.enabled",
      havingValue = "true")
  ClientRegistrationRepository googleRegistration(Settings settings) {
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
    return new InMemoryClientRegistrationRepository(registration);
  }

  @Bean
  SecurityFilterChain security(
      HttpSecurity http, Settings settings, AccountRepository users, GoogleLoginHandler handler)
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
            org.springframework.security.web.context.SecurityContextHolderFilter.class)
        .addFilterBefore(new RequestLimitFilter(), AuthorizationFilter.class);
    if (settings.google().enabled())
      http.oauth2Login(
          c ->
              c.successHandler(handler)
                  .failureHandler(
                      (req, res, e) -> {
                        var session = req.getSession(false);
                        if (session != null) {
                          session.removeAttribute("GOOGLE_LINK_USER");
                          session.removeAttribute("GOOGLE_LINK_AT");
                        }
                        res.sendRedirect(settings.frontendUrl() + "/login?error=google_failed");
                      }));
    return http.build();
  }
}
