import { createContext, useContext, useEffect } from 'react';

export const CrumbsContext = createContext({ setCrumbs: () => {} });

// Mỗi trang gọi useCrumbs(['Staff', 'Olivia Reed']) để hiển thị breadcrumb trên thanh đầu trang.
export function useCrumbs(crumbs) {
  const { setCrumbs } = useContext(CrumbsContext);
  const key = crumbs.join('\u0000');
  useEffect(() => {
    setCrumbs(key ? key.split('\u0000') : []);
    return () => setCrumbs([]);
  }, [key, setCrumbs]);
}