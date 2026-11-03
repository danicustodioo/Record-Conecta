// Bloco 14A — Dados da central de documentos por cliente.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  documentosAplicaveis,
  pendenciasObrigatorias,
  type DocumentoCliente,
  type PerfilCliente,
  type StatusDocumento,
  type TipoDocumento,
} from "@/lib/documentos-catalogo";

export type TipoAnaliseDominio = "DRE" | "BALANCO" | "FORNECEDORES" | "FOLHA" | "SAIDAS";

export const CODIGO_DOCUMENTO_POR_TIPO_ANALISE: Record<TipoAnaliseDominio, string> = {
  DRE: "dre",
  BALANCO: "balanco",
  FORNECEDORES: "entradas",
  FOLHA: "folha",
  SAIDAS: "saidas",
};

export const TIPO_ANALISE_POR_CODIGO_DOCUMENTO: Record<string, TipoAnaliseDominio> = {
  dre: "DRE",
  balanco: "BALANCO",
  entradas: "FORNECEDORES",
  folha: "FOLHA",
  saidas: "SAIDAS",
};

type DocumentoAnaliseCliente = {
  id: string;
  analise_id: string;
  tipo: TipoAnaliseDominio;
  nome_arquivo: string;
  storage_path: string;
  status_extracao: "PENDENTE" | "PROCESSANDO" | "CONCLUIDO" | "ERRO_MANUAL";
  dados_extraidos: unknown;
  created_at: string;
};

function statusCentralPorExtracao(status: DocumentoAnaliseCliente["status_extracao"]): StatusDocumento {
  if (status === "CONCLUIDO") return "conferido";
  return "enviado";
}

function prioridadeDocumento(d: DocumentoCliente): number {
  if (d.status === "conferido" || d.status === "dispensado") return 5;
  if (d.status === "extraido") return 4;
  if (d.status === "enviado") return 3;
  return 1;
}

export function documentoClientePersistido(d: DocumentoCliente | undefined): boolean {
  return !!d && !d.id.startsWith("analise:");
}

export function melhorDocumentoPorCodigo(
  docs: DocumentoCliente[],
  codigo: string,
): DocumentoCliente | undefined {
  const candidatos = docs.filter((d) => d.codigo_documento === codigo);
  if (!candidatos.length) return undefined;
  return [...candidatos].sort((a, b) => {
    const p = prioridadeDocumento(b) - prioridadeDocumento(a);
    if (p !== 0) return p;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  })[0];
}

function documentosAnaliseComoCentral(
  clienteId: string,
  docs: DocumentoAnaliseCliente[],
): DocumentoCliente[] {
  return docs
    .filter((doc) => !!CODIGO_DOCUMENTO_POR_TIPO_ANALISE[doc.tipo])
    .map((doc) => ({
      id: `analise:${doc.id}`,
      cliente_id: clienteId,
      codigo_documento: CODIGO_DOCUMENTO_POR_TIPO_ANALISE[doc.tipo],
      arquivo_path: doc.storage_path,
      nome_arquivo: doc.nome_arquivo,
      status: statusCentralPorExtracao(doc.status_extracao),
      resumo_extracao: doc.dados_extraidos,
      extraido_em: doc.status_extracao === "CONCLUIDO" ? doc.created_at : null,
      conferido_por: null,
      conferido_em: doc.status_extracao === "CONCLUIDO" ? doc.created_at : null,
      observacao: doc.status_extracao === "CONCLUIDO" ? "Anexado e extraído na análise" : "Anexado na análise",
      created_at: doc.created_at,
    }));
}

export function useTiposDocumento() {
  return useQuery({
    queryKey: ["tipos-documento"],
    queryFn: async (): Promise<TipoDocumento[]> => {
      const { data, error } = await supabase
        .from("tipos_documento" as never)
        .select("*")
        .order("ordem", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as TipoDocumento[];
    },
    staleTime: 1000 * 60 * 30,
  });
}

export function useDocumentosCliente(clienteId: string | undefined) {
  return useQuery({
    queryKey: ["documentos-cliente", clienteId],
    enabled: !!clienteId,
    // Reavaliação em tempo real: sem cache velho travando o botão de cálculo.
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 15_000,
    queryFn: async (): Promise<DocumentoCliente[]> => {
      if (!clienteId) return [];
      const { data, error } = await supabase
        .from("documentos_cliente" as never)
        .select("*")
        .eq("cliente_id", clienteId)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as DocumentoCliente[];
    },
  });
}

export function useDocumentosAnaliseCliente(clienteId: string | undefined) {
  return useQuery({
    queryKey: ["documentos-analise-cliente", clienteId],
    enabled: !!clienteId,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 15_000,
    queryFn: async (): Promise<DocumentoCliente[]> => {
      if (!clienteId) return [];

      const { data: analises, error: analisesError } = await supabase
        .from("analises")
        .select("id")
        .eq("cliente_id", clienteId);
      if (analisesError) throw new Error(analisesError.message);

      const ids = ((analises ?? []) as Array<{ id: string }>).map((a) => a.id);
      if (!ids.length) return [];

      const { data, error } = await supabase
        .from("documentos")
        .select("id, analise_id, tipo, nome_arquivo, storage_path, status_extracao, dados_extraidos, created_at")
        .in("analise_id", ids)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);

      return documentosAnaliseComoCentral(clienteId, (data ?? []) as unknown as DocumentoAnaliseCliente[]);
    },
  });
}

export function useDocumentosClienteConsolidados(clienteId: string | undefined) {
  const central = useDocumentosCliente(clienteId);
  const anexados = useDocumentosAnaliseCliente(clienteId);

  return {
    ...central,
    data: [...(central.data ?? []), ...(anexados.data ?? [])],
    isLoading: central.isLoading || anexados.isLoading,
  };
}


/** Pendências obrigatórias que travam a geração de cenários. */
export function usePendenciasDocumentos(
  clienteId: string | undefined,
  cliente: PerfilCliente | null | undefined,
) {
  const { data: tipos = [] } = useTiposDocumento();
  const { data: docs = [], isLoading } = useDocumentosClienteConsolidados(clienteId);

  if (!cliente || isLoading || tipos.length === 0) {
    return { pendencias: [] as TipoDocumento[], carregando: isLoading, aplicaveis: [] as TipoDocumento[], docs };
  }
  const aplicaveis = documentosAplicaveis(tipos, cliente);
  return {
    pendencias: pendenciasObrigatorias(aplicaveis, docs),
    carregando: false,
    aplicaveis,
    docs,
  };
}
