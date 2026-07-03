import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

const STORAGE_KEY = "norvo:empresa-id";

export function getSelectedEmpresaId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

export function setSelectedEmpresaId(id: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, id);
  window.dispatchEvent(new Event("norvo:empresa-changed"));
}

export function useSelectedEmpresaId() {
  const [id, setId] = useState<string | null>(() => getSelectedEmpresaId());
  useEffect(() => {
    const h = () => setId(getSelectedEmpresaId());
    window.addEventListener("norvo:empresa-changed", h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener("norvo:empresa-changed", h);
      window.removeEventListener("storage", h);
    };
  }, []);
  return id;
}

export function useEmpresaAtual() {
  const selectedId = useSelectedEmpresaId();
  return useQuery({
    queryKey: ["empresas", "atual", selectedId],
    queryFn: async () => {
      const { data, error } = await supabase.from("empresas").select("*").order("created_at");
      if (error) throw error;
      if (!data?.length) return null;
      return (selectedId && data.find((e) => e.id === selectedId)) || data[0];
    },
  });
}
