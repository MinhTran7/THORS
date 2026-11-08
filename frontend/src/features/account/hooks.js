import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { accountsApi } from './api';

export function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
export function useProfile() {
  return useSWR('account-profile', accountsApi.profile, { revalidateOnFocus: false });
}

export function useBodyMeasurements() {
  return useSWR('account-body-measurements', accountsApi.bodyMeasurements, { revalidateOnFocus: false });
}