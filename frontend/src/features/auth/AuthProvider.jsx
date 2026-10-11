import { createContext, useContext, useEffect, useState } from 'react';
import { api, post, clearCsrf } from 'services/http';
const Context = createContext();
export function AuthProvider({ children }) {
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState('');
  async function reload() {
    try {
      setAccount(await api('/auth/me'));
      setFailure('');
    } catch (e) {
      setAccount(null);
      if (e.status !== 401) setFailure(e.message);
    }
  }
  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    const clear = () => setAccount(null);
    window.addEventListener('thors:unauthorized', clear);
    return () => window.removeEventListener('thors:unauthorized', clear);
  }, []);
  async function logout() {
    await post('/auth/logout');
    setAccount(null);
    clearCsrf();
  }
  return <Context.Provider value={{ account, setAccount, loading, failure, reload, logout }}>{children}</Context.Provider>;
}
export const useAuth = () => useContext(Context);
