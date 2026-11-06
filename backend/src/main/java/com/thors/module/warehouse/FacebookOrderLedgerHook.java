package com.thors.module.warehouse;

import java.util.Arrays;
import java.util.Map;
import org.aopalliance.intercept.MethodInterceptor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.aop.framework.Advised;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.aop.support.AopUtils;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.stereotype.Component;

/**
 * Chạy kèm sau hàm tạo đơn Facebook ({@code FacebookService.createOrderFromFacebook}) mà không sửa
 * code Facebook: hàm gốc chạy y nguyên và trả y nguyên kết quả; sau khi nó xong mới gọi {@link
 * FacebookOrderLedger} ghi thẻ kho. Lỗi khi ghi thẻ kho chỉ ghi log, không làm hỏng đơn vừa tạo.
 * Nếu bản code Facebook không có hàm này thì không làm gì cả.
 */
@Component
public class FacebookOrderLedgerHook implements BeanPostProcessor {
    private static final Logger log = LoggerFactory.getLogger(FacebookOrderLedgerHook.class);
    static final String TARGET_CLASS = "com.thors.module.facebook.service.FacebookService";
    static final String TARGET_METHOD = "createOrderFromFacebook";

    private final ObjectProvider<FacebookOrderLedger> ledger;
    private final String targetClass;

    @Autowired
    public FacebookOrderLedgerHook(ObjectProvider<FacebookOrderLedger> ledger) {
        this(ledger, TARGET_CLASS);
    }

    FacebookOrderLedgerHook(ObjectProvider<FacebookOrderLedger> ledger, String targetClass) {
        this.ledger = ledger;
        this.targetClass = targetClass;
    }

    @Override
    public Object postProcessAfterInitialization(Object bean, String beanName) {
        Class<?> type = AopUtils.getTargetClass(bean);
        if (!targetClass.equals(type.getName())
                || Arrays.stream(type.getMethods()).noneMatch(m -> TARGET_METHOD.equals(m.getName()))) return bean;
        MethodInterceptor after = call -> {
            Object result = call.proceed();
            if (TARGET_METHOD.equals(call.getMethod().getName())) afterOrder(result);
            return result;
        };
        // Hàm Facebook có @Transactional nên bean đã là proxy giao dịch: gắn vào vị trí ngoài cùng để
        // chỉ ghi thẻ kho sau khi giao dịch của hàm Facebook đã lưu xong. Không có proxy thì tự bọc.
        if (bean instanceof Advised advised && !advised.isFrozen()) {
            advised.addAdvice(0, after);
            return bean;
        }
        var proxy = new ProxyFactory(bean);
        proxy.setProxyTargetClass(true);
        proxy.addAdvice(after);
        return proxy.getProxy(type.getClassLoader());
    }

    private void afterOrder(Object result) {
        try {
            if (result instanceof Map<?, ?> m && m.get("orderId") instanceof Number id)
                ledger.getObject().record(id.intValue());
        } catch (RuntimeException e) {
            log.error("Không ghi được thẻ kho cho đơn Facebook {}: {}", result, e.getMessage(), e);
        }
    }
}
