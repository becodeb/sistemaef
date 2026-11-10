import { QueryCache, QueryClient, useQuery } from "@tanstack/react-query";
import type { Discipline, Me } from "@shared/contracts";
import { ApiError, api } from "./api";

const ME = "/api/auth/me";

export const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (err) => {
      if (!(err instanceof ApiError)) return;
      if (err.status === 401) queryClient.setQueryData([ME], null);
      if (err.code === "must_change_password") void queryClient.invalidateQueries({ queryKey: [ME] });
    },
  }),
  defaultOptions: {
    queries: {
      queryFn: ({ queryKey, signal }) => api.get(queryKey[0] as string, signal),
      staleTime: 15_000,
      // Sin señal muestra lo guardado en el teléfono y vuelve a pedir al reconectarse,
      // así cada profe ve lo que cargaron los demás.
      networkMode: "offlineFirst",
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
      retry: (count, err) => (err instanceof ApiError && !err.isNetwork && err.status < 500 ? false : count < 2),
    },
  },
});

/** Consulta GET por URL; la URL es la clave de la caché. Con null no consulta. */
export function useApi<T>(url: string | null) {
  return useQuery<T>({ queryKey: [url], enabled: url != null });
}

export function useMe() {
  return useQuery<Me | null>({
    queryKey: [ME],
    queryFn: async ({ signal }) => {
      try {
        return await api.get<Me>(ME, signal);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: Infinity,
  });
}

export const setMe = (me: Me | null) => queryClient.setQueryData([ME], me);

export function useDisciplines() {
  const q = useApi<Discipline[]>("/api/disciplines");
  return { ...q, list: q.data ?? [], byId: (id: string | null | undefined) => q.data?.find((d) => d.id === id) };
}

/** Después de cargar o borrar marcas, todo lo calculado queda viejo. */
export function refreshData() {
  return queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== ME });
}
