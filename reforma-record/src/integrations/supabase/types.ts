export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      analises: {
        Row: {
          aliquota_cbs_utilizada: number | null
          cliente_id: string
          conferido_por: string | null
          created_at: string
          dados_balanco: Json | null
          dados_dre: Json | null
          dados_folha: Json | null
          dados_fornecedores: Json | null
          dados_saidas: Json | null
          data_base_calculo: string | null
          diagnostico_ia: Json | null
          id: string
          link_acessos: number
          link_expira_em: string | null
          link_token: string | null
          pdf_url: string | null
          pptx_url: string | null
          recomendacao_regime: string | null
          recomendacao_texto: string | null
          responsavel_id: string | null
          resultados_calculo: Json | null
          saldo_credor_cbs: number | null
          status: Database["public"]["Enums"]["analise_status"]
          updated_at: string
          versao_engine: string | null
        }
        Insert: {
          aliquota_cbs_utilizada?: number | null
          cliente_id: string
          conferido_por?: string | null
          created_at?: string
          dados_balanco?: Json | null
          dados_dre?: Json | null
          dados_folha?: Json | null
          dados_fornecedores?: Json | null
          dados_saidas?: Json | null
          data_base_calculo?: string | null
          diagnostico_ia?: Json | null
          id?: string
          link_acessos?: number
          link_expira_em?: string | null
          link_token?: string | null
          pdf_url?: string | null
          pptx_url?: string | null
          recomendacao_regime?: string | null
          recomendacao_texto?: string | null
          responsavel_id?: string | null
          resultados_calculo?: Json | null
          saldo_credor_cbs?: number | null
          status?: Database["public"]["Enums"]["analise_status"]
          updated_at?: string
          versao_engine?: string | null
        }
        Update: {
          aliquota_cbs_utilizada?: number | null
          cliente_id?: string
          conferido_por?: string | null
          created_at?: string
          dados_balanco?: Json | null
          dados_dre?: Json | null
          dados_folha?: Json | null
          dados_fornecedores?: Json | null
          dados_saidas?: Json | null
          data_base_calculo?: string | null
          diagnostico_ia?: Json | null
          id?: string
          link_acessos?: number
          link_expira_em?: string | null
          link_token?: string | null
          pdf_url?: string | null
          pptx_url?: string | null
          recomendacao_regime?: string | null
          recomendacao_texto?: string | null
          responsavel_id?: string | null
          resultados_calculo?: Json | null
          saldo_credor_cbs?: number | null
          status?: Database["public"]["Enums"]["analise_status"]
          updated_at?: string
          versao_engine?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analises_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          aliquota_iss_municipal: number | null
          base_creditavel_estimada: number | null
          cnae_principal: string | null
          cnaes_secundarios: string[] | null
          cnpj: string
          created_at: string
          email_cliente: string | null
          id: string
          iss_aliquota_efetiva: number | null
          municipio: string | null
          natureza_juridica: string | null
          nome_fantasia: string | null
          num_funcionarios: number | null
          obras_afetadas: string | null
          observacoes: string | null
          opcao_simples: boolean | null
          pct_b2b: number | null
          pct_b2c: number | null
          pct_creditavel: number | null
          pct_empreitada: number | null
          perfil_clientes: string | null
          porte: string | null
          razao_social: string
          rbt12: number
          regime_atual: Database["public"]["Enums"]["regime_tributario"]
          responsavel_id: string | null
          setor: string
          situacao_cadastral: string | null
          socios_habilitados: boolean | null
          subsetor: string | null
          tem_contrato_anterior_16012025: boolean | null
          tem_patrimonio_afetacao: boolean | null
          updated_at: string
        }
        Insert: {
          aliquota_iss_municipal?: number | null
          base_creditavel_estimada?: number | null
          cnae_principal?: string | null
          cnaes_secundarios?: string[] | null
          cnpj: string
          created_at?: string
          email_cliente?: string | null
          id?: string
          iss_aliquota_efetiva?: number | null
          municipio?: string | null
          natureza_juridica?: string | null
          nome_fantasia?: string | null
          num_funcionarios?: number | null
          obras_afetadas?: string | null
          observacoes?: string | null
          opcao_simples?: boolean | null
          pct_b2b?: number | null
          pct_b2c?: number | null
          pct_creditavel?: number | null
          pct_empreitada?: number | null
          perfil_clientes?: string | null
          porte?: string | null
          razao_social: string
          rbt12?: number
          regime_atual: Database["public"]["Enums"]["regime_tributario"]
          responsavel_id?: string | null
          setor: string
          situacao_cadastral?: string | null
          socios_habilitados?: boolean | null
          subsetor?: string | null
          tem_contrato_anterior_16012025?: boolean | null
          tem_patrimonio_afetacao?: boolean | null
          updated_at?: string
        }
        Update: {
          aliquota_iss_municipal?: number | null
          base_creditavel_estimada?: number | null
          cnae_principal?: string | null
          cnaes_secundarios?: string[] | null
          cnpj?: string
          created_at?: string
          email_cliente?: string | null
          id?: string
          iss_aliquota_efetiva?: number | null
          municipio?: string | null
          natureza_juridica?: string | null
          nome_fantasia?: string | null
          num_funcionarios?: number | null
          obras_afetadas?: string | null
          observacoes?: string | null
          opcao_simples?: boolean | null
          pct_b2b?: number | null
          pct_b2c?: number | null
          pct_creditavel?: number | null
          pct_empreitada?: number | null
          perfil_clientes?: string | null
          porte?: string | null
          razao_social?: string
          rbt12?: number
          regime_atual?: Database["public"]["Enums"]["regime_tributario"]
          responsavel_id?: string | null
          setor?: string
          situacao_cadastral?: string | null
          socios_habilitados?: boolean | null
          subsetor?: string | null
          tem_contrato_anterior_16012025?: boolean | null
          tem_patrimonio_afetacao?: boolean | null
          updated_at?: string
        }
        Relationships: []
      }
      configuracoes: {
        Row: {
          chave: string
          descricao: string | null
          updated_at: string
          valor: Json
        }
        Insert: {
          chave: string
          descricao?: string | null
          updated_at?: string
          valor: Json
        }
        Update: {
          chave?: string
          descricao?: string | null
          updated_at?: string
          valor?: Json
        }
        Relationships: []
      }
      documentos: {
        Row: {
          analise_id: string
          created_at: string
          dados_extraidos: Json | null
          erro_mensagem: string | null
          id: string
          nome_arquivo: string
          status_extracao: Database["public"]["Enums"]["extracao_status"]
          storage_path: string
          tipo: Database["public"]["Enums"]["documento_tipo"]
          updated_at: string
        }
        Insert: {
          analise_id: string
          created_at?: string
          dados_extraidos?: Json | null
          erro_mensagem?: string | null
          id?: string
          nome_arquivo: string
          status_extracao?: Database["public"]["Enums"]["extracao_status"]
          storage_path: string
          tipo: Database["public"]["Enums"]["documento_tipo"]
          updated_at?: string
        }
        Update: {
          analise_id?: string
          created_at?: string
          dados_extraidos?: Json | null
          erro_mensagem?: string | null
          id?: string
          nome_arquivo?: string
          status_extracao?: Database["public"]["Enums"]["extracao_status"]
          storage_path?: string
          tipo?: Database["public"]["Enums"]["documento_tipo"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documentos_analise_id_fkey"
            columns: ["analise_id"]
            isOneToOne: false
            referencedRelation: "analises"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos_cliente: {
        Row: {
          arquivo_path: string | null
          cliente_id: string
          codigo_documento: string
          conferido_em: string | null
          conferido_por: string | null
          created_at: string
          extraido_em: string | null
          id: string
          nome_arquivo: string | null
          observacao: string | null
          resumo_extracao: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          arquivo_path?: string | null
          cliente_id: string
          codigo_documento: string
          conferido_em?: string | null
          conferido_por?: string | null
          created_at?: string
          extraido_em?: string | null
          id?: string
          nome_arquivo?: string | null
          observacao?: string | null
          resumo_extracao?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          arquivo_path?: string | null
          cliente_id?: string
          codigo_documento?: string
          conferido_em?: string | null
          conferido_por?: string | null
          created_at?: string
          extraido_em?: string | null
          id?: string
          nome_arquivo?: string | null
          observacao?: string | null
          resumo_extracao?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documentos_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_cliente_codigo_documento_fkey"
            columns: ["codigo_documento"]
            isOneToOne: false
            referencedRelation: "tipos_documento"
            referencedColumns: ["codigo"]
          },
        ]
      }
      fornecedores_entradas: {
        Row: {
          cliente_id: string
          cnae: string | null
          cnpj: string | null
          cnpj_inserido_manualmente: boolean
          cpf: string | null
          created_at: string
          credito_cbs: number
          data_consulta_regime: string | null
          id: string
          nome: string
          nome_receita: string | null
          periodo_fim: string | null
          periodo_inicio: string | null
          regime: string | null
          situacao_receita: string | null
          tipo_imposto: string | null
          tipo_receita_fornecedor: string | null
          uf: string | null
          updated_at: string
          valor_total: number
        }
        Insert: {
          cliente_id: string
          cnae?: string | null
          cnpj?: string | null
          cnpj_inserido_manualmente?: boolean
          cpf?: string | null
          created_at?: string
          credito_cbs?: number
          data_consulta_regime?: string | null
          id?: string
          nome: string
          nome_receita?: string | null
          periodo_fim?: string | null
          periodo_inicio?: string | null
          regime?: string | null
          situacao_receita?: string | null
          tipo_imposto?: string | null
          tipo_receita_fornecedor?: string | null
          uf?: string | null
          updated_at?: string
          valor_total?: number
        }
        Update: {
          cliente_id?: string
          cnae?: string | null
          cnpj?: string | null
          cnpj_inserido_manualmente?: boolean
          cpf?: string | null
          created_at?: string
          credito_cbs?: number
          data_consulta_regime?: string | null
          id?: string
          nome?: string
          nome_receita?: string | null
          periodo_fim?: string | null
          periodo_inicio?: string | null
          regime?: string | null
          situacao_receita?: string | null
          tipo_imposto?: string | null
          tipo_receita_fornecedor?: string | null
          uf?: string | null
          updated_at?: string
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "fornecedores_entradas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fornecedores_entradas_tipo_receita_fkey"
            columns: ["tipo_receita_fornecedor"]
            isOneToOne: false
            referencedRelation: "regimes_setoriais"
            referencedColumns: ["tipo_receita"]
          },
        ]
      }
      link_acessos: {
        Row: {
          accessed_at: string
          analise_id: string
          id: string
          ip_address: string | null
          user_agent: string | null
        }
        Insert: {
          accessed_at?: string
          analise_id: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
        }
        Update: {
          accessed_at?: string
          analise_id?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "link_acessos_analise_id_fkey"
            columns: ["analise_id"]
            isOneToOne: false
            referencedRelation: "analises"
            referencedColumns: ["id"]
          },
        ]
      }
      parametros_reforma: {
        Row: {
          aliquota_cbs: number
          chave: string
          credito_simples_estimado: number
          descricao: string | null
          updated_at: string
          valor: number | null
          valor_texto: string | null
        }
        Insert: {
          aliquota_cbs?: number
          chave: string
          credito_simples_estimado?: number
          descricao?: string | null
          updated_at?: string
          valor?: number | null
          valor_texto?: string | null
        }
        Update: {
          aliquota_cbs?: number
          chave?: string
          credito_simples_estimado?: number
          descricao?: string | null
          updated_at?: string
          valor?: number | null
          valor_texto?: string | null
        }
        Relationships: []
      }
      receitas_cliente: {
        Row: {
          analise_id: string | null
          cfop: string | null
          cliente_id: string
          conferido_em: string | null
          conferido_por: string | null
          created_at: string
          cst: string | null
          descricao_livre: string | null
          descricao_operacao: string | null
          id: string
          imposto_destacado: string | null
          meses: number
          origem: string
          requer_atencao: boolean
          tipo_receita: string
          valor_anualizado: number | null
          valor_periodo: number
        }
        Insert: {
          analise_id?: string | null
          cfop?: string | null
          cliente_id: string
          conferido_em?: string | null
          conferido_por?: string | null
          created_at?: string
          cst?: string | null
          descricao_livre?: string | null
          descricao_operacao?: string | null
          id?: string
          imposto_destacado?: string | null
          meses?: number
          origem?: string
          requer_atencao?: boolean
          tipo_receita: string
          valor_anualizado?: number | null
          valor_periodo: number
        }
        Update: {
          analise_id?: string | null
          cfop?: string | null
          cliente_id?: string
          conferido_em?: string | null
          conferido_por?: string | null
          created_at?: string
          cst?: string | null
          descricao_livre?: string | null
          descricao_operacao?: string | null
          id?: string
          imposto_destacado?: string | null
          meses?: number
          origem?: string
          requer_atencao?: boolean
          tipo_receita?: string
          valor_anualizado?: number | null
          valor_periodo?: number
        }
        Relationships: [
          {
            foreignKeyName: "receitas_cliente_analise_id_fkey"
            columns: ["analise_id"]
            isOneToOne: false
            referencedRelation: "analises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receitas_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receitas_cliente_tipo_receita_fkey"
            columns: ["tipo_receita"]
            isOneToOne: false
            referencedRelation: "regimes_setoriais"
            referencedColumns: ["tipo_receita"]
          },
        ]
      }
      regimes_setoriais: {
        Row: {
          artigo: string
          created_at: string
          descricao: string
          gera_credito_adquirente: boolean
          id: string
          monofasico: boolean
          reducao: number
          requer_validacao_societaria: boolean
          status: string
          tipo_receita: string
        }
        Insert: {
          artigo: string
          created_at?: string
          descricao: string
          gera_credito_adquirente?: boolean
          id?: string
          monofasico?: boolean
          reducao?: number
          requer_validacao_societaria?: boolean
          status?: string
          tipo_receita: string
        }
        Update: {
          artigo?: string
          created_at?: string
          descricao?: string
          gera_credito_adquirente?: boolean
          id?: string
          monofasico?: boolean
          reducao?: number
          requer_validacao_societaria?: boolean
          status?: string
          tipo_receita?: string
        }
        Relationships: []
      }
      tipos_documento: {
        Row: {
          codigo: string
          condicao: string | null
          created_at: string
          descricao: string
          extraivel: boolean
          id: string
          nome: string
          obrigatorio_sempre: boolean
          ordem: number
          periodo_minimo: string | null
          por_que_precisamos: string
        }
        Insert: {
          codigo: string
          condicao?: string | null
          created_at?: string
          descricao: string
          extraivel?: boolean
          id?: string
          nome: string
          obrigatorio_sempre?: boolean
          ordem?: number
          periodo_minimo?: string | null
          por_que_precisamos: string
        }
        Update: {
          codigo?: string
          condicao?: string | null
          created_at?: string
          descricao?: string
          extraivel?: boolean
          id?: string
          nome?: string
          obrigatorio_sempre?: boolean
          ordem?: number
          periodo_minimo?: string | null
          por_que_precisamos?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      usuarios: {
        Row: {
          ativo: boolean
          created_at: string
          email: string
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          email: string
          id: string
          nome: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          email?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      analise_status: "RASCUNHO" | "EM_ANALISE" | "CONCLUIDO"
      app_role: "admin" | "analista"
      documento_tipo: "DRE" | "BALANCO" | "FORNECEDORES" | "FOLHA" | "SAIDAS"
      extracao_status: "PENDENTE" | "PROCESSANDO" | "CONCLUIDO" | "ERRO_MANUAL"
      regime_tributario:
        | "SIMPLES_I"
        | "SIMPLES_II"
        | "SIMPLES_III"
        | "SIMPLES_IV"
        | "SIMPLES_V"
        | "LUCRO_PRESUMIDO"
        | "LUCRO_REAL"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      analise_status: ["RASCUNHO", "EM_ANALISE", "CONCLUIDO"],
      app_role: ["admin", "analista"],
      documento_tipo: ["DRE", "BALANCO", "FORNECEDORES", "FOLHA", "SAIDAS"],
      extracao_status: ["PENDENTE", "PROCESSANDO", "CONCLUIDO", "ERRO_MANUAL"],
      regime_tributario: [
        "SIMPLES_I",
        "SIMPLES_II",
        "SIMPLES_III",
        "SIMPLES_IV",
        "SIMPLES_V",
        "LUCRO_PRESUMIDO",
        "LUCRO_REAL",
      ],
    },
  },
} as const
