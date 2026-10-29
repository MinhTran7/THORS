package com.thors.module.warehouse;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import org.springframework.stereotype.Component;

@Component
public class WarehousePolicy {
    public void view(Account a) {
        if (!"OWNER".equals(a.role()) && !"FAMILY_MEMBER".equals(a.role())) deny();
    }

    public void owner(Account a) {
        view(a);
        if (!"OWNER".equals(a.role())) deny();
    }

    public void create(Account a, String type) {
        view(a);
        if (!"RECEIPT".equals(type)) owner(a);
    }

    public void edit(Account a, java.util.Map<String, Object> doc) {
        create(a, (String) doc.get("receipt_type"));
        if (!"OWNER".equals(a.role()) && WarehouseStore.num(doc, "created_by") != a.id()) deny();
    }

    private void deny() {
        throw new ApiException(
                403, "WAREHOUSE_FORBIDDEN", "Bạn không có quyền thực hiện thao tác kho này.");
    }
}
