package com.thors.it;

import java.lang.reflect.InvocationHandler;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.util.Map;
import javax.sql.DataSource;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;

/**
 * Chỉ dùng trong test: vài câu SQL MySQL mà H2 (MODE=MySQL) không phân tích được thì đổi sang cú pháp H2 tương đương
 * ngay trước khi gửi xuống H2. Không đổi gì trong src/main.
 *
 * <ul>
 *   <li>CheckoutRepository.setPaymentDeadline: DATE_ADD(NOW(), INTERVAL ? MINUTE) → DATEADD(MINUTE, ?, NOW())
 *   <li>ChatRepository / ChatKnowledgeRepository: UTC_TIMESTAMP() → LOCALTIMESTAMP
 * </ul>
 */
@TestConfiguration(proxyBeanMethods = false)
class H2MysqlShim {
    static final Map<String, String> REWRITES = Map.of(
            "DATE_ADD(NOW(), INTERVAL ? MINUTE)", "DATEADD(MINUTE, ?, NOW())",
            // Kết nối H2 đã SET TIME ZONE 'UTC' (application-test.yml) nên LOCALTIMESTAMP = giờ UTC
            "UTC_TIMESTAMP()", "LOCALTIMESTAMP");

    static String rewrite(String sql) {
        if (sql == null) return null;
        String out = sql;
        for (var e : REWRITES.entrySet()) out = out.replace(e.getKey(), e.getValue());
        return out;
    }

    @Bean
    static BeanPostProcessor h2MysqlShimPostProcessor() {
        return new BeanPostProcessor() {
            @Override
            public Object postProcessAfterInitialization(Object bean, String name) {
                if (!(bean instanceof DataSource ds) || bean instanceof ShimmedDataSource) return bean;
                return Proxy.newProxyInstance(
                        H2MysqlShim.class.getClassLoader(),
                        new Class<?>[] {DataSource.class, ShimmedDataSource.class},
                        (proxy, method, args) -> {
                            Object result = invoke(ds, method, args);
                            return result instanceof Connection c ? shim(c) : result;
                        });
            }
        };
    }

    /** Đánh dấu DataSource đã bọc. */
    interface ShimmedDataSource {}

    static Connection shim(Connection c) {
        InvocationHandler h = (proxy, method, args) -> {
            if (args != null && args.length > 0 && args[0] instanceof String sql
                    && (method.getName().equals("prepareStatement") || method.getName().equals("prepareCall")
                            || method.getName().equals("nativeSQL"))) {
                args[0] = rewrite(sql);
            }
            return invoke(c, method, args);
        };
        return (Connection) Proxy.newProxyInstance(H2MysqlShim.class.getClassLoader(), new Class<?>[] {Connection.class}, h);
    }

    private static Object invoke(Object target, java.lang.reflect.Method method, Object[] args) throws Throwable {
        try {
            return method.invoke(target, args);
        } catch (InvocationTargetException e) {
            throw e.getCause();
        }
    }
}
