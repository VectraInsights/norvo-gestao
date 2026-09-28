export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      adiantamentos: {
        Row: {
          colaborador_id: string | null;
          created_at: string;
          created_by: string | null;
          data: string;
          dia_recorrente: number | null;
          empresa_id: string;
          id: string;
          lancamento_id: string | null;
          motivo: string | null;
          parcelas_desconto: number;
          recorrente: boolean;
          status: Database["public"]["Enums"]["adiantamento_status"];
          ultimo_mes_gerado: string | null;
          updated_at: string;
          valor: number;
        };
        Insert: {
          colaborador_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          data?: string;
          dia_recorrente?: number | null;
          empresa_id: string;
          id?: string;
          lancamento_id?: string | null;
          motivo?: string | null;
          parcelas_desconto?: number;
          recorrente?: boolean;
          status?: Database["public"]["Enums"]["adiantamento_status"];
          ultimo_mes_gerado?: string | null;
          updated_at?: string;
          valor?: number;
        };
        Update: {
          colaborador_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          data?: string;
          dia_recorrente?: number | null;
          empresa_id?: string;
          id?: string;
          lancamento_id?: string | null;
          motivo?: string | null;
          parcelas_desconto?: number;
          recorrente?: boolean;
          status?: Database["public"]["Enums"]["adiantamento_status"];
          ultimo_mes_gerado?: string | null;
          updated_at?: string;
          valor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "adiantamentos_colaborador_id_fkey";
            columns: ["colaborador_id"];
            isOneToOne: false;
            referencedRelation: "colaboradores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "adiantamentos_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "adiantamentos_lancamento_id_fkey";
            columns: ["lancamento_id"];
            isOneToOne: false;
            referencedRelation: "lancamentos_financeiros";
            referencedColumns: ["id"];
          },
        ];
      };
      alertas: {
        Row: {
          created_at: string;
          empresa_id: string;
          id: string;
          lido: boolean;
          mensagem: string | null;
          ref_id: string | null;
          ref_tabela: string | null;
          severidade: string;
          tipo: string;
          titulo: string;
        };
        Insert: {
          created_at?: string;
          empresa_id: string;
          id?: string;
          lido?: boolean;
          mensagem?: string | null;
          ref_id?: string | null;
          ref_tabela?: string | null;
          severidade?: string;
          tipo: string;
          titulo: string;
        };
        Update: {
          created_at?: string;
          empresa_id?: string;
          id?: string;
          lido?: boolean;
          mensagem?: string | null;
          ref_id?: string | null;
          ref_tabela?: string | null;
          severidade?: string;
          tipo?: string;
          titulo?: string;
        };
        Relationships: [
          {
            foreignKeyName: "alertas_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
        ];
      };
      auditoria_eventos: {
        Row: {
          acao: string;
          created_at: string;
          detalhes: Json;
          empresa_id: string | null;
          entidade: string | null;
          entidade_id: string | null;
          id: string;
          modulo: string;
          user_id: string | null;
        };
        Insert: {
          acao: string;
          created_at?: string;
          detalhes?: Json;
          empresa_id?: string | null;
          entidade?: string | null;
          entidade_id?: string | null;
          id?: string;
          modulo: string;
          user_id?: string | null;
        };
        Update: {
          acao?: string;
          created_at?: string;
          detalhes?: Json;
          empresa_id?: string | null;
          entidade?: string | null;
          entidade_id?: string | null;
          id?: string;
          modulo?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "auditoria_eventos_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
        ];
      };
      cargos: {
        Row: {
          created_at: string;
          empresa_id: string | null;
          id: string;
          nome: string;
        };
        Insert: {
          created_at?: string;
          empresa_id?: string | null;
          id?: string;
          nome: string;
        };
        Update: {
          created_at?: string;
          empresa_id?: string | null;
          id?: string;
          nome?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cargos_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
        ];
      };
      categorias_financeiras: {
        Row: {
          cor: string | null;
          created_at: string;
          empresa_id: string;
          id: string;
          nome: string;
          parent_id: string | null;
          tipo: Database["public"]["Enums"]["lancamento_tipo"];
        };
        Insert: {
          cor?: string | null;
          created_at?: string;
          empresa_id: string;
          id?: string;
          nome: string;
          parent_id?: string | null;
          tipo: Database["public"]["Enums"]["lancamento_tipo"];
        };
        Update: {
          cor?: string | null;
          created_at?: string;
          empresa_id?: string;
          id?: string;
          nome?: string;
          parent_id?: string | null;
          tipo?: Database["public"]["Enums"]["lancamento_tipo"];
        };
        Relationships: [
          {
            foreignKeyName: "categorias_financeiras_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "categorias_financeiras_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "categorias_financeiras";
            referencedColumns: ["id"];
          },
        ];
      };
      centros_custo: {
        Row: {
          ativo: boolean;
          codigo: string | null;
          created_at: string;
          descricao: string | null;
          empresa_id: string;
          id: string;
          nome: string;
          updated_at: string;
        };
        Insert: {
          ativo?: boolean;
          codigo?: string | null;
          created_at?: string;
          descricao?: string | null;
          empresa_id: string;
          id?: string;
          nome: string;
          updated_at?: string;
        };
        Update: {
          ativo?: boolean;
          codigo?: string | null;
          created_at?: string;
          descricao?: string | null;
          empresa_id?: string;
          id?: string;
          nome?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "centros_custo_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
        ];
      };
      certificados_digitais: {
        Row: {
          arquivo_nome: string;
          arquivo_path: string;
          ativo: boolean;
          created_at: string;
          empresa_id: string;
          id: string;
          nome: string;
          senha_cript: string;
          thumbprint: string | null;
          updated_at: string;
          validade: string | null;
        };
        Insert: {
          arquivo_nome: string;
          arquivo_path: string;
          ativo?: boolean;
          created_at?: string;
          empresa_id: string;
          id?: string;
          nome: string;
          senha_cript: string;
          thumbprint?: string | null;
          updated_at?: string;
          validade?: string | null;
        };
        Update: {
          arquivo_nome?: string;
          arquivo_path?: string;
          ativo?: boolean;
          created_at?: string;
          empresa_id?: string;
          id?: string;
          nome?: string;
          senha_cript?: string;
          thumbprint?: string | null;
          updated_at?: string;
          validade?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "certificados_digitais_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
        ];
      };
      colaboradores: {
        Row: {
          agencia: string | null;
          banco: string | null;
          cargo: string | null;
          cnh_categoria: string | null;
          cnh_numero: string | null;
          cnh_validade: string | null;
          conta: string | null;
          cpf: string | null;
          created_at: string;
          data_admissao: string | null;
          data_demissao: string | null;
          email: string | null;
          empresa_id: string;
          id: string;
          nome: string;
          observacoes: string | null;
          optante_vt: boolean;
          pix: string | null;
          salario_base: number;
          status: Database["public"]["Enums"]["colaborador_status"];
          telefone: string | null;
          toxico_exame: string | null;
          updated_at: string;
        };
        Insert: {
          agencia?: string | null;
          banco?: string | null;
          cargo?: string | null;
          cnh_categoria?: string | null;
          cnh_numero?: string | null;
          cnh_validade?: string | null;
          conta?: string | null;
          cpf?: string | null;
          created_at?: string;
          data_admissao?: string | null;
          data_demissao?: string | null;
          email?: string | null;
          empresa_id: string;
          id?: string;
          nome: string;
          observacoes?: string | null;
          optante_vt?: boolean;
          pix?: string | null;
          salario_base?: number;
          status?: Database["public"]["Enums"]["colaborador_status"];
          telefone?: string | null;
          toxico_exame?: string | null;
          updated_at?: string;
        };
        Update: {
          agencia?: string | null;
          banco?: string | null;
          cargo?: string | null;
          cnh_categoria?: string | null;
          cnh_numero?: string | null;
          cnh_validade?: string | null;
          conta?: string | null;
          cpf?: string | null;
          created_at?: string;
          data_admissao?: string | null;
          data_demissao?: string | null;
          email?: string | null;
          empresa_id?: string;
          id?: string;
          nome?: string;
          observacoes?: string | null;
          optante_vt?: boolean;
          pix?: string | null;
          salario_base?: number;
          status?: Database["public"]["Enums"]["colaborador_status"];
          telefone?: string | null;
          toxico_exame?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "colaboradores_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
        ];
      };
      comissoes: {
        Row: {
          base_valor: number;
          colaborador_id: string | null;
          competencia: string;
          created_at: string;
          created_by: string | null;
          descricao: string | null;
          empresa_id: string;
          id: string;
          lancamento_id: string | null;
          percentual: number;
          status: Database["public"]["Enums"]["comissao_status"];
          updated_at: string;
          valor: number;
          venda_id: string | null;
        };
        Insert: {
          base_valor?: number;
          colaborador_id?: string | null;
          competencia?: string;
          created_at?: string;
          created_by?: string | null;
          descricao?: string | null;
          empresa_id: string;
          id?: string;
          lancamento_id?: string | null;
          percentual?: number;
          status?: Database["public"]["Enums"]["comissao_status"];
          updated_at?: string;
          valor?: number;
          venda_id?: string | null;
        };
        Update: {
          base_valor?: number;
          colaborador_id?: string | null;
          competencia?: string;
          created_at?: string;
          created_by?: string | null;
          descricao?: string | null;
          empresa_id?: string;
          id?: string;
          lancamento_id?: string | null;
          percentual?: number;
          status?: Database["public"]["Enums"]["comissao_status"];
          updated_at?: string;
          valor?: number;
          venda_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "comissoes_colaborador_id_fkey";
            columns: ["colaborador_id"];
            isOneToOne: false;
            referencedRelation: "colaboradores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comissoes_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comissoes_lancamento_id_fkey";
            columns: ["lancamento_id"];
            isOneToOne: false;
            referencedRelation: "lancamentos_financeiros";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comissoes_venda_id_fkey";
            columns: ["venda_id"];
            isOneToOne: false;
            referencedRelation: "vendas";
            referencedColumns: ["id"];
          },
        ];
      };
      condicoes_pagamento: {
        Row: {
          ativo: boolean;
          created_at: string;
          empresa_id: string;
          entrada: boolean;
          id: string;
          intervalo_dias: number;
          nome: string;
          parcelas: number;
          updated_at: string;
        };
        Insert: {
          ativo?: boolean;
          created_at?: string;
          empresa_id: string;
          entrada?: boolean;
          id?: string;
          intervalo_dias?: number;
          nome: string;
          parcelas?: number;
          updated_at?: string;
        };
        Update: {
          ativo?: boolean;
          created_at?: string;
          empresa_id?: string;
          entrada?: boolean;
          id?: string;
          intervalo_dias?: number;
          nome?: string;
          parcelas?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "condicoes_pagamento_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
        ];
      };
      contas_bancarias: {
        Row: {
          agencia: string | null;
          ativo: boolean;
          banco: string | null;
          cartao_bandeira: string | null;
          cartao_conta_pagamento_id: string | null;
          cartao_dia_fechamento: number | null;
          cartao_dia_vencimento: number | null;
          cartao_emissor: string | null;
          cartao_ultimos4: string | null;
          conta: string | null;
          conta_vinculada_id: string | null;
          created_at: string;
          data_inicio_lancamentos: string | null;
          empresa_id: string;
          id: string;
          modalidade: string | null;
          nome: string | null;
          padrao: boolean;
          saldo_atual: number;
          saldo_inicial: number;
          tipo: Database["public"]["Enums"]["conta_financeira_tipo"];
          updated_at: string;
        };
        Insert: {
          agencia?: string | null;
          ativo?: boolean;
          banco?: string | null;
          cartao_bandeira?: string | null;
          cartao_conta_pagamento_id?: string | null;
          cartao_dia_fechamento?: number | null;
          cartao_dia_vencimento?: number | null;
          cartao_emissor?: string | null;
          cartao_ultimos4?: string | null;
          conta?: string | null;
          conta_vinculada_id?: string | null;
          created_at?: string;
          data_inicio_lancamentos?: string | null;
          empresa_id: string;
          id?: string;
          modalidade?: string | null;
          nome?: string | null;
          padrao?: boolean;
          saldo_atual?: number;
          saldo_inicial?: number;
          tipo?: Database["public"]["Enums"]["conta_financeira_tipo"];
          updated_at?: string;
        };
        Update: {
          agencia?: string | null;
          ativo?: boolean;
          banco?: string | null;
          cartao_bandeira?: string | null;
          cartao_conta_pagamento_id?: string | null;
          cartao_dia_fechamento?: number | null;
          cartao_dia_vencimento?: number | null;
          cartao_emissor?: string | null;
          cartao_ultimos4?: string | null;
          conta?: string | null;
          conta_vinculada_id?: string | null;
          created_at?: string;
          data_inicio_lancamentos?: string | null;
          empresa_id?: string;
          id?: string;
          modalidade?: string | null;
          nome?: string | null;
          padrao?: boolean;
          saldo_atual?: number;
          saldo_inicial?: number;
          tipo?: Database["public"]["Enums"]["conta_financeira_tipo"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contas_bancarias_cartao_conta_pagamento_id_fkey";
            columns: ["cartao_conta_pagamento_id"];
            isOneToOne: false;
            referencedRelation: "contas_bancarias";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contas_bancarias_conta_vinculada_id_fkey";
            columns: ["conta_vinculada_id"];
            isOneToOne: false;
            referencedRelation: "contas_bancarias";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contas_bancarias_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
        ];
      };
      contatos: {
        Row: {
          ativo: boolean;
          bairro: string | null;
          cep: string | null;
          cidade: string | null;
          complemento: string | null;
          created_at: string;
          documento: string | null;
          email: string | null;
          empresa_id: string;
          id: string;
          ie: string | null;
          logradouro: string | null;
          nome: string;
          numero: string | null;
          observacoes: string | null;
          telefone: string | null;
          tipo: Database["public"]["Enums"]["contato_tipo"];
          uf: string | null;
          updated_at: string;
        };
        Insert: {
          ativo?: boolean;
          bairro?: string | null;
          cep?: string | null;
          cidade?: string | null;
          complemento?: string | null;
          created_at?: string;
          documento?: string | null;
          email?: string | null;
          empresa_id: string;
          id?: string;
          ie?: string | null;
          logradouro?: string | null;
          nome: string;
          numero?: string | null;
          observacoes?: string | null;
          telefone?: string | null;
          tipo?: Database["public"]["Enums"]["contato_tipo"];
          uf?: string | null;
          updated_at?: string;
        };
        Update: {
          ativo?: boolean;
          bairro?: string | null;
          cep?: string | null;
          cidade?: string | null;
          complemento?: string | null;
          created_at?: string;
          documento?: string | null;
          email?: string | null;
          empresa_id?: string;
          id?: string;
          ie?: string | null;
          logradouro?: string | null;
          nome?: string;
          numero?: string | null;
          observacoes?: string | null;
          telefone?: string | null;
          tipo?: Database["public"]["Enums"]["contato_tipo"];
          uf?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contatos_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_etapas: {
        Row: {
          cor: string | null;
          created_at: string;
          empresa_id: string;
          ganho: boolean | null;
          id: string;
          nome: string;
          ordem: number;
          perdido: boolean | null;
          updated_at: string;
        };
        Insert: {
          cor?: string | null;
          created_at?: string;
          empresa_id: string;
          ganho?: boolean | null;
          id?: string;
          nome: string;
          ordem?: number;
          perdido?: boolean | null;
          updated_at?: string;
        };
        Update: {
          cor?: string | null;
          created_at?: string;
          empresa_id?: string;
          ganho?: boolean | null;
          id?: string;
          nome?: string;
          ordem?: number;
          perdido?: boolean | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "crm_etapas_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_oportunidades: {
        Row: {
          contato_id: string | null;
          created_at: string;
          data_prevista: string | null;
          descricao: string | null;
          empresa_id: string;
          etapa_id: string | null;
          id: string;
          ordem: number;
          probabilidade: number | null;
          responsavel_id: string | null;
          status: string;
          titulo: string;
          updated_at: string;
          valor: number | null;
        };
        Insert: {
          contato_id?: string | null;
          created_at?: string;
          data_prevista?: string | null;
          descricao?: string | null;
          empresa_id: string;
          etapa_id?: string | null;
          id?: string;
          ordem?: number;
          probabilidade?: number | null;
          responsavel_id?: string | null;
          status?: string;
          titulo: string;
          updated_at?: string;
          valor?: number | null;
        };
        Update: {
          contato_id?: string | null;
          created_at?: string;
          data_prevista?: string | null;
          descricao?: string | null;
          empresa_id?: string;
          etapa_id?: string | null;
          id?: string;
          ordem?: number;
          probabilidade?: number | null;
          responsavel_id?: string | null;
          status?: string;
          titulo?: string;
          updated_at?: string;
          valor?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "crm_oportunidades_contato_id_fkey";
            columns: ["contato_id"];
            isOneToOne: false;
            referencedRelation: "contatos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_oportunidades_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "crm_oportunidades_etapa_id_fkey";
            columns: ["etapa_id"];
            isOneToOne: false;
            referencedRelation: "crm_etapas";
            referencedColumns: ["id"];
          },
        ];
      };
      cte_documentos: {
        Row: {
          ambiente: string | null;
          chave_acesso: string | null;
          created_at: string | null;
          created_by: string | null;
          data_autorizacao: string | null;
          data_emissao: string | null;
          empresa_id: string;
          id: string;
          modelo: string | null;
          motivo_rejeicao: string | null;
          numero: string | null;
          peso_carga: number | null;
          protocolo_sefaz: string | null;
          responsavel_emissao: string | null;
          serie: string | null;
          status: string;
          tomador_id: string | null;
          updated_at: string | null;
          valor_carga: number | null;
          valor_servico: number | null;
          veiculo_id: string | null;
          viagem_id: string | null;
          xml_assinado: string | null;
          xml_protocolo: string | null;
        };
        Insert: {
          ambiente?: string | null;
          chave_acesso?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          data_autorizacao?: string | null;
          data_emissao?: string | null;
          empresa_id: string;
          id?: string;
          modelo?: string | null;
          motivo_rejeicao?: string | null;
          numero?: string | null;
          peso_carga?: number | null;
          protocolo_sefaz?: string | null;
          responsavel_emissao?: string | null;
          serie?: string | null;
          status?: string;
          tomador_id?: string | null;
          updated_at?: string | null;
          valor_carga?: number | null;
          valor_servico?: number | null;
          veiculo_id?: string | null;
          viagem_id?: string | null;
          xml_assinado?: string | null;
          xml_protocolo?: string | null;
        };
        Update: {
          ambiente?: string | null;
          chave_acesso?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          data_autorizacao?: string | null;
          data_emissao?: string | null;
          empresa_id?: string;
          id?: string;
          modelo?: string | null;
          motivo_rejeicao?: string | null;
          numero?: string | null;
          peso_carga?: number | null;
          protocolo_sefaz?: string | null;
          responsavel_emissao?: string | null;
          serie?: string | null;
          status?: string;
          tomador_id?: string | null;
          updated_at?: string | null;
          valor_carga?: number | null;
          valor_servico?: number | null;
          veiculo_id?: string | null;
          viagem_id?: string | null;
          xml_assinado?: string | null;
          xml_protocolo?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "cte_documentos_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cte_documentos_tomador_id_fkey";
            columns: ["tomador_id"];
            isOneToOne: false;
            referencedRelation: "contatos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cte_documentos_veiculo_id_fkey";
            columns: ["veiculo_id"];
            isOneToOne: false;
            referencedRelation: "veiculos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cte_documentos_viagem_id_fkey";
            columns: ["viagem_id"];
            isOneToOne: false;
            referencedRelation: "viagens";
            referencedColumns: ["id"];
          },
        ];
      };
      cte_nfes_pendentes: {
        Row: {
          chave: string;
          created_at: string | null;
          data_emissao: string | null;
          dest_cmun: string | null;
          dest_cnpj: string | null;
          dest_nome: string | null;
          dest_uf: string | null;
          dest_xmun: string | null;
          emit_cmun: string | null;
          emit_cnpj: string | null;
          emit_nome: string | null;
          emit_uf: string | null;
          emit_xmun: string | null;
          empresa_id: string;
          id: string;
          mod_frete: string | null;
          n_nf: string | null;
          peso: number | null;
          qvol: number | null;
          serie: string | null;
          status: string;
          tomador_bairro: string | null;
          tomador_cep: string | null;
          tomador_cmun: string | null;
          tomador_cnpj: string | null;
          tomador_ie: string | null;
          tomador_logradouro: string | null;
          tomador_nome: string | null;
          tomador_uf: string | null;
          tomador_xmun: string | null;
          updated_at: string | null;
          valor: number | null;
          xml_text: string | null;
        };
        Insert: {
          chave: string;
          created_at?: string | null;
          data_emissao?: string | null;
          dest_cmun?: string | null;
          dest_cnpj?: string | null;
          dest_nome?: string | null;
          dest_uf?: string | null;
          dest_xmun?: string | null;
          emit_cmun?: string | null;
          emit_cnpj?: string | null;
          emit_nome?: string | null;
          emit_uf?: string | null;
          emit_xmun?: string | null;
          empresa_id: string;
          id?: string;
          mod_frete?: string | null;
          n_nf?: string | null;
          peso?: number | null;
          qvol?: number | null;
          serie?: string | null;
          status?: string;
          tomador_bairro?: string | null;
          tomador_cep?: string | null;
          tomador_cmun?: string | null;
          tomador_cnpj?: string | null;
          tomador_ie?: string | null;
          tomador_logradouro?: string | null;
          tomador_nome?: string | null;
          tomador_uf?: string | null;
          tomador_xmun?: string | null;
          updated_at?: string | null;
          valor?: number | null;
          xml_text?: string | null;
        };
        Update: {
          chave?: string;
          created_at?: string | null;
          data_emissao?: string | null;
          dest_cmun?: string | null;
          dest_cnpj?: string | null;
          dest_nome?: string | null;
          dest_uf?: string | null;
          dest_xmun?: string | null;
          emit_cmun?: string | null;
          emit_cnpj?: string | null;
          emit_nome?: string | null;
          emit_uf?: string | null;
          emit_xmun?: string | null;
          empresa_id?: string;
          id?: string;
          mod_frete?: string | null;
          n_nf?: string | null;
          peso?: number | null;
          qvol?: number | null;
          serie?: string | null;
          status?: string;
          tomador_bairro?: string | null;
          tomador_cep?: string | null;
          tomador_cmun?: string | null;
          tomador_cnpj?: string | null;
          tomador_ie?: string | null;
          tomador_logradouro?: string | null;
          tomador_nome?: string | null;
          tomador_uf?: string | null;
          tomador_xmun?: string | null;
          updated_at?: string | null;
          valor?: number | null;
          xml_text?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "cte_nfes_pendentes_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
        ];
      };
      cte_percursos: {
        Row: {
          cfop: string | null;
          codigo: string | null;
          cofins_aliq: string | null;
          coleta_cmun: string | null;
          coleta_uf: string | null;
          coleta_xmun: string | null;
          consig_bairro: string | null;
          consig_cep: string | null;
          consig_cnpj: string | null;
          consig_ie: string | null;
          consig_logradouro: string | null;
          consig_nome: string | null;
          consig_nro: string | null;
          consig_uf: string | null;
          consig_xmun: string | null;
          created_at: string | null;
          credito_outorgado: string | null;
          csll_aliq: string | null;
          dest_bairro: string | null;
          dest_cep: string | null;
          dest_cmun: string | null;
          dest_cnpj: string;
          dest_fone: string | null;
          dest_ie: string | null;
          dest_logradouro: string | null;
          dest_nome: string | null;
          dest_nro: string | null;
          dest_uf: string | null;
          dest_xmun: string | null;
          distancia_km: string | null;
          duracao_horas: string | null;
          emissao_cmun: string | null;
          emissao_uf: string | null;
          emissao_xmun: string | null;
          empresa_id: string;
          entrega_cmun: string | null;
          entrega_uf: string | null;
          entrega_xmun: string | null;
          icms_aliq: string | null;
          icms_cst: string | null;
          id: string;
          inss_aliq: string | null;
          ir_aliq: string | null;
          nome: string;
          obs_gerais: string | null;
          pedagio_cnpj: string | null;
          pedagio_operadora: string | null;
          pedagio_pagto: string | null;
          pedagio_tag: string | null;
          pedagio_vale: string | null;
          pis_aliq: string | null;
          redesp_bairro: string | null;
          redesp_cep: string | null;
          redesp_cnpj: string | null;
          redesp_ie: string | null;
          redesp_logradouro: string | null;
          redesp_nome: string | null;
          redesp_nro: string | null;
          redesp_uf: string | null;
          redesp_xmun: string | null;
          reducao_base: string | null;
          rem_bairro: string | null;
          rem_cep: string | null;
          rem_cmun: string | null;
          rem_cnpj: string;
          rem_fone: string | null;
          rem_ie: string | null;
          rem_logradouro: string | null;
          rem_nome: string | null;
          rem_nro: string | null;
          rem_uf: string | null;
          rem_xmun: string | null;
          seg_adicional: string | null;
          seg_apolice: string | null;
          seg_averbacao: string | null;
          seg_nome: string | null;
          seg_rcf_dc: string | null;
          seg_rctr_c: string | null;
          seg_repassar: boolean | null;
          seg_responsavel: string | null;
          seg_total: string | null;
          toma_bairro: string | null;
          toma_cep: string | null;
          toma_cmun: string | null;
          toma_cnpj: string;
          toma_email: string | null;
          toma_fone: string | null;
          toma_ie: string | null;
          toma_logradouro: string | null;
          toma_nome: string | null;
          toma_nro: string | null;
          toma_tipo: string | null;
          toma_uf: string | null;
          toma_xmun: string | null;
        };
        Insert: {
          cfop?: string | null;
          codigo?: string | null;
          cofins_aliq?: string | null;
          coleta_cmun?: string | null;
          coleta_uf?: string | null;
          coleta_xmun?: string | null;
          consig_bairro?: string | null;
          consig_cep?: string | null;
          consig_cnpj?: string | null;
          consig_ie?: string | null;
          consig_logradouro?: string | null;
          consig_nome?: string | null;
          consig_nro?: string | null;
          consig_uf?: string | null;
          consig_xmun?: string | null;
          created_at?: string | null;
          credito_outorgado?: string | null;
          csll_aliq?: string | null;
          dest_bairro?: string | null;
          dest_cep?: string | null;
          dest_cmun?: string | null;
          dest_cnpj?: string;
          dest_fone?: string | null;
          dest_ie?: string | null;
          dest_logradouro?: string | null;
          dest_nome?: string | null;
          dest_nro?: string | null;
          dest_uf?: string | null;
          dest_xmun?: string | null;
          distancia_km?: string | null;
          duracao_horas?: string | null;
          emissao_cmun?: string | null;
          emissao_uf?: string | null;
          emissao_xmun?: string | null;
          empresa_id: string;
          entrega_cmun?: string | null;
          entrega_uf?: string | null;
          entrega_xmun?: string | null;
          icms_aliq?: string | null;
          icms_cst?: string | null;
          id?: string;
          inss_aliq?: string | null;
          ir_aliq?: string | null;
          nome: string;
          obs_gerais?: string | null;
          pedagio_cnpj?: string | null;
          pedagio_operadora?: string | null;
          pedagio_pagto?: string | null;
          pedagio_tag?: string | null;
          pedagio_vale?: string | null;
          pis_aliq?: string | null;
          redesp_bairro?: string | null;
          redesp_cep?: string | null;
          redesp_cnpj?: string | null;
          redesp_ie?: string | null;
          redesp_logradouro?: string | null;
          redesp_nome?: string | null;
          redesp_nro?: string | null;
          redesp_uf?: string | null;
          redesp_xmun?: string | null;
          reducao_base?: string | null;
          rem_bairro?: string | null;
          rem_cep?: string | null;
          rem_cmun?: string | null;
          rem_cnpj?: string;
          rem_fone?: string | null;
          rem_ie?: string | null;
          rem_logradouro?: string | null;
          rem_nome?: string | null;
          rem_nro?: string | null;
          rem_uf?: string | null;
          rem_xmun?: string | null;
          seg_adicional?: string | null;
          seg_apolice?: string | null;
          seg_averbacao?: string | null;
          seg_nome?: string | null;
          seg_rcf_dc?: string | null;
          seg_rctr_c?: string | null;
          seg_repassar?: boolean | null;
          seg_responsavel?: string | null;
          seg_total?: string | null;
          toma_bairro?: string | null;
          toma_cep?: string | null;
          toma_cmun?: string | null;
          toma_cnpj?: string;
          toma_email?: string | null;
          toma_fone?: string | null;
          toma_ie?: string | null;
          toma_logradouro?: string | null;
          toma_nome?: string | null;
          toma_nro?: string | null;
          toma_tipo?: string | null;
          toma_uf?: string | null;
          toma_xmun?: string | null;
        };
        Update: {
          cfop?: string | null;
          codigo?: string | null;
          cofins_aliq?: string | null;
          coleta_cmun?: string | null;
          coleta_uf?: string | null;
          coleta_xmun?: string | null;
          consig_bairro?: string | null;
          consig_cep?: string | null;
          consig_cnpj?: string | null;
          consig_ie?: string | null;
          consig_logradouro?: string | null;
          consig_nome?: string | null;
          consig_nro?: string | null;
          consig_uf?: string | null;
          consig_xmun?: string | null;
          created_at?: string | null;
          credito_outorgado?: string | null;
          csll_aliq?: string | null;
          dest_bairro?: string | null;
          dest_cep?: string | null;
          dest_cmun?: string | null;
          dest_cnpj?: string;
          dest_fone?: string | null;
          dest_ie?: string | null;
          dest_logradouro?: string | null;
          dest_nome?: string | null;
          dest_nro?: string | null;
          dest_uf?: string | null;
          dest_xmun?: string | null;
          distancia_km?: string | null;
          duracao_horas?: string | null;
          emissao_cmun?: string | null;
          emissao_uf?: string | null;
          emissao_xmun?: string | null;
          empresa_id?: string;
          entrega_cmun?: string | null;
          entrega_uf?: string | null;
          entrega_xmun?: string | null;
          icms_aliq?: string | null;
          icms_cst?: string | null;
          id?: string;
          inss_aliq?: string | null;
          ir_aliq?: string | null;
          nome?: string;
          obs_gerais?: string | null;
          pedagio_cnpj?: string | null;
          pedagio_operadora?: string | null;
          pedagio_pagto?: string | null;
          pedagio_tag?: string | null;
          pedagio_vale?: string | null;
          pis_aliq?: string | null;
          redesp_bairro?: string | null;
          redesp_cep?: string | null;
          redesp_cnpj?: string | null;
          redesp_ie?: string | null;
          redesp_logradouro?: string | null;
          redesp_nome?: string | null;
          redesp_nro?: string | null;
          redesp_uf?: string | null;
          redesp_xmun?: string | null;
          reducao_base?: string | null;
          rem_bairro?: string | null;
          rem_cep?: string | null;
          rem_cmun?: string | null;
          rem_cnpj?: string;
          rem_fone?: string | null;
          rem_ie?: string | null;
          rem_logradouro?: string | null;
          rem_nome?: string | null;
          rem_nro?: string | null;
          rem_uf?: string | null;
          rem_xmun?: string | null;
          seg_adicional?: string | null;
          seg_apolice?: string | null;
          seg_averbacao?: string | null;
          seg_nome?: string | null;
          seg_rcf_dc?: string | null;
          seg_rctr_c?: string | null;
          seg_repassar?: boolean | null;
          seg_responsavel?: string | null;
          seg_total?: string | null;
          toma_bairro?: string | null;
          toma_cep?: string | null;
          toma_cmun?: string | null;
          toma_cnpj?: string;
          toma_email?: string | null;
          toma_fone?: string | null;
          toma_ie?: string | null;
          toma_logradouro?: string | null;
          toma_nome?: string | null;
          toma_nro?: string | null;
          toma_tipo?: string | null;
          toma_uf?: string | null;
          toma_xmun?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "cte_rotas_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
        ];
      };
      cte_templates: {
        Row: {
          c_mun_env: string | null;
          c_mun_fim: string | null;
          c_mun_ini: string | null;
          c_mun_tomador: string | null;
          cfop: string | null;
          cnpj_tomador: string | null;
          created_at: string | null;
          created_by: string | null;
          dados: Json | null;
          empresa_id: string;
          id: string;
          nome: string;
          rntrc: string | null;
          toma: string;
          uf_env: string | null;
          uf_fim: string | null;
          uf_ini: string | null;
          uf_tomador: string | null;
          updated_at: string | null;
          x_mun_env: string | null;
          x_mun_fim: string | null;
          x_mun_ini: string | null;
          x_mun_tomador: string | null;
          x_nome_tomador: string | null;
        };
        Insert: {
          c_mun_env?: string | null;
          c_mun_fim?: string | null;
          c_mun_ini?: string | null;
          c_mun_tomador?: string | null;
          cfop?: string | null;
          cnpj_tomador?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          dados?: Json | null;
          empresa_id: string;
          id?: string;
          nome: string;
          rntrc?: string | null;
          toma?: string;
          uf_env?: string | null;
          uf_fim?: string | null;
          uf_ini?: string | null;
          uf_tomador?: string | null;
          updated_at?: string | null;
          x_mun_env?: string | null;
          x_mun_fim?: string | null;
          x_mun_ini?: string | null;
          x_mun_tomador?: string | null;
          x_nome_tomador?: string | null;
        };
        Update: {
          c_mun_env?: string | null;
          c_mun_fim?: string | null;
          c_mun_ini?: string | null;
          c_mun_tomador?: string | null;
          cfop?: string | null;
          cnpj_tomador?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          dados?: Json | null;
          empresa_id?: string;
          id?: string;
          nome?: string;
          rntrc?: string | null;
          toma?: string;
          uf_env?: string | null;
          uf_fim?: string | null;
          uf_ini?: string | null;
          uf_tomador?: string | null;
          updated_at?: string | null;
          x_mun_env?: string | null;
          x_mun_fim?: string | null;
          x_mun_ini?: string | null;
          x_mun_tomador?: string | null;
          x_nome_tomador?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "cte_templates_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
        ];
      };
      depositos: {
        Row: {
          ativo: boolean;
          created_at: string;
          empresa_id: string;
          id: string;
          nome: string;
          padrao: boolean;
          updated_at: string;
        };
        Insert: {
          ativo?: boolean;
          created_at?: string;
          empresa_id: string;
          id?: string;
          nome: string;
          padrao?: boolean;
          updated_at?: string;
        };
        Update: {
          ativo?: boolean;
          created_at?: string;
          empresa_id?: string;
          id?: string;
          nome?: string;
          padrao?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "depositos_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
        ];
      };
      empresa_users: {
        Row: {
          created_at: string;
          email: string | null;
          empresa_id: string;
          id: string;
          modulos: string[];
          nome: string | null;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          empresa_id: string;
          id?: string;
          modulos?: string[];
          nome?: string | null;
          role?: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          empresa_id?: string;
          id?: string;
          modulos?: string[];
          nome?: string | null;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "empresa_users_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
        ];
      };
      empresas: {
        Row: {
          bairro: string | null;
          cep: string | null;
          cidade: string | null;
          cnpj: string | null;
          complemento: string | null;
          created_at: string;
          created_by: string;
          email: string | null;
          id: string;
          ie: string | null;
          logradouro: string | null;
          nome_fantasia: string;
          numero: string | null;
          razao_social: string | null;
          regime_tributario: string | null;
          telefone: string | null;
          uf: string | null;
          updated_at: string;
        };
        Insert: {
          bairro?: string | null;
          cep?: string | null;
          cidade?: string | null;
          cnpj?: string | null;
          complemento?: string | null;
          created_at?: string;
          created_by: string;
          email?: string | null;
          id?: string;
          ie?: string | null;
          logradouro?: string | null;
          nome_fantasia: string;
          numero?: string | null;
          razao_social?: string | null;
          regime_tributario?: string | null;
          telefone?: string | null;
          uf?: string | null;
          updated_at?: string;
        };
        Update: {
          bairro?: string | null;
          cep?: string | null;
          cidade?: string | null;
          cnpj?: string | null;
          complemento?: string | null;
          created_at?: string;
          created_by?: string;
          email?: string | null;
          id?: string;
          ie?: string | null;
          logradouro?: string | null;
          nome_fantasia?: string;
          numero?: string | null;
          razao_social?: string | null;
          regime_tributario?: string | null;
          telefone?: string | null;
          uf?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      emprestimo_parcelas: {
        Row: {
          created_at: string;
          data_vencimento: string;
          empresa_id: string;
          emprestimo_id: string;
          id: string;
          lancamento_id: string | null;
          numero: number;
          status: Database["public"]["Enums"]["parcela_status"];
          updated_at: string;
          valor: number;
          valor_amortizacao: number;
          valor_juros: number;
        };
        Insert: {
          created_at?: string;
          data_vencimento: string;
          empresa_id: string;
          emprestimo_id: string;
          id?: string;
          lancamento_id?: string | null;
          numero: number;
          status?: Database["public"]["Enums"]["parcela_status"];
          updated_at?: string;
          valor?: number;
          valor_amortizacao?: number;
          valor_juros?: number;
        };
        Update: {
          created_at?: string;
          data_vencimento?: string;
          empresa_id?: string;
          emprestimo_id?: string;
          id?: string;
          lancamento_id?: string | null;
          numero?: number;
          status?: Database["public"]["Enums"]["parcela_status"];
          updated_at?: string;
          valor?: number;
          valor_amortizacao?: number;
          valor_juros?: number;
        };
        Relationships: [
          {
            foreignKeyName: "emprestimo_parcelas_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "emprestimo_parcelas_emprestimo_id_fkey";
            columns: ["emprestimo_id"];
            isOneToOne: false;
            referencedRelation: "emprestimos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "emprestimo_parcelas_lancamento_id_fkey";
            columns: ["lancamento_id"];
            isOneToOne: false;
            referencedRelation: "lancamentos_financeiros";
            referencedColumns: ["id"];
          },
        ];
      };
      emprestimos: {
        Row: {
          categoria_id: string | null;
          conta_credito_id: string | null;
          created_at: string;
          created_by: string | null;
          credor: string | null;
          data_contratacao: string;
          descricao: string;
          empresa_id: string;
          id: string;
          observacoes: string | null;
          parcelas: number;
          primeiro_vencimento: string | null;
          status: Database["public"]["Enums"]["emprestimo_status"];
          taxa_juros_mensal: number;
          tipo: Database["public"]["Enums"]["emprestimo_tipo"];
          updated_at: string;
          valor_principal: number;
        };
        Insert: {
          categoria_id?: string | null;
          conta_credito_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          credor?: string | null;
          data_contratacao?: string;
          descricao: string;
          empresa_id: string;
          id?: string;
          observacoes?: string | null;
          parcelas?: number;
          primeiro_vencimento?: string | null;
          status?: Database["public"]["Enums"]["emprestimo_status"];
          taxa_juros_mensal?: number;
          tipo?: Database["public"]["Enums"]["emprestimo_tipo"];
          updated_at?: string;
          valor_principal?: number;
        };
        Update: {
          categoria_id?: string | null;
          conta_credito_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          credor?: string | null;
          data_contratacao?: string;
          descricao?: string;
          empresa_id?: string;
          id?: string;
          observacoes?: string | null;
          parcelas?: number;
          primeiro_vencimento?: string | null;
          status?: Database["public"]["Enums"]["emprestimo_status"];
          taxa_juros_mensal?: number;
          tipo?: Database["public"]["Enums"]["emprestimo_tipo"];
          updated_at?: string;
          valor_principal?: number;
        };
        Relationships: [
          {
            foreignKeyName: "emprestimos_categoria_id_fkey";
            columns: ["categoria_id"];
            isOneToOne: false;
            referencedRelation: "categorias_financeiras";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "emprestimos_conta_credito_id_fkey";
            columns: ["conta_credito_id"];
            isOneToOne: false;
            referencedRelation: "contas_bancarias";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "emprestimos_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
        ];
      };
      ferias_concessoes: {
        Row: {
          abono_dias: number;
          adiantar_decimo: boolean;
          colaborador_id: string;
          created_at: string;
          data_fim_gozo: string;
          data_inicio_gozo: string;
          dias: number | null;
          empresa_id: string;
          id: string;
          observacoes: string | null;
          periodo_inicio: string;
          status: Database["public"]["Enums"]["ferias_concessao_status"];
          updated_at: string;
        };
        Insert: {
          abono_dias?: number;
          adiantar_decimo?: boolean;
          colaborador_id: string;
          created_at?: string;
          data_fim_gozo: string;
          data_inicio_gozo: string;
          dias?: number | null;
          empresa_id: string;
          id?: string;
          observacoes?: string | null;
          periodo_inicio: string;
          status?: Database["public"]["Enums"]["ferias_concessao_status"];
          updated_at?: string;
        };
        Update: {
          abono_dias?: number;
          adiantar_decimo?: boolean;
          colaborador_id?: string;
          created_at?: string;
          data_fim_gozo?: string;
          data_inicio_gozo?: string;
          dias?: number | null;
          empresa_id?: string;
          id?: string;
          observacoes?: string | null;
          periodo_inicio?: string;
          status?: Database["public"]["Enums"]["ferias_concessao_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ferias_concessoes_colaborador_id_fkey";
            columns: ["colaborador_id"];
            isOneToOne: false;
            referencedRelation: "colaboradores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ferias_concessoes_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
        ];
      };
      filtros_salvos: {
        Row: {
          created_at: string;
          empresa_id: string;
          filtros: Json;
          id: string;
          modulo: string;
          nome: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          empresa_id: string;
          filtros?: Json;
          id?: string;
          modulo: string;
          nome: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          empresa_id?: string;
          filtros?: Json;
          id?: string;
          modulo?: string;
          nome?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "filtros_salvos_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
        ];
      };
      fiscal_cadastros: {
        Row: {
          ativo: boolean;
          bairro: string | null;
          cep: string | null;
          cidade: string | null;
          complemento: string | null;
          created_at: string;
          documento: string | null;
          email: string | null;
          empresa_id: string;
          id: string;
          ie: string | null;
          logradouro: string | null;
          nome: string;
          numero: string | null;
          observacoes: string | null;
          telefone: string | null;
          uf: string | null;
          updated_at: string;
        };
        Insert: {
          ativo?: boolean;
          bairro?: string | null;
          cep?: string | null;
          cidade?: string | null;
          complemento?: string | null;
          created_at?: string;
          documento?: string | null;
          email?: string | null;
          empresa_id: string;
          id?: string;
          ie?: string | null;
          logradouro?: string | null;
          nome: string;
          numero?: string | null;
          observacoes?: string | null;
          telefone?: string | null;
          uf?: string | null;
          updated_at?: string;
        };
        Update: {
          ativo?: boolean;
          bairro?: string | null;
          cep?: string | null;
          cidade?: string | null;
          complemento?: string | null;
          created_at?: string;
          documento?: string | null;
          email?: string | null;
          empresa_id?: string;
          id?: string;
          ie?: string | null;
          logradouro?: string | null;
          nome?: string;
          numero?: string | null;
          observacoes?: string | null;
          telefone?: string | null;
          uf?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fiscal_cadastros_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
        ];
      };
      folha_pagamento: {
        Row: {
          beneficios: number;
          colaborador_id: string;
          competencia_ano: number;
          competencia_mes: number;
          created_at: string;
          data_pagamento: string | null;
          descontos: number;
          descontos_detalhe: Json | null;
          empresa_id: string;
          horas_extras: number;
          id: string;
          inss: number;
          irrf: number;
          lancamento_id: string | null;
          liquido: number;
          observacoes: string | null;
          salario: number;
          status: Database["public"]["Enums"]["folha_status"];
          updated_at: string;
        };
        Insert: {
          beneficios?: number;
          colaborador_id: string;
          competencia_ano: number;
          competencia_mes: number;
          created_at?: string;
          data_pagamento?: string | null;
          descontos?: number;
          descontos_detalhe?: Json | null;
          empresa_id: string;
          horas_extras?: number;
          id?: string;
          inss?: number;
          irrf?: number;
          lancamento_id?: string | null;
          liquido?: number;
          observacoes?: string | null;
          salario?: number;
          status?: Database["public"]["Enums"]["folha_status"];
          updated_at?: string;
        };
        Update: {
          beneficios?: number;
          colaborador_id?: string;
          competencia_ano?: number;
          competencia_mes?: number;
          created_at?: string;
          data_pagamento?: string | null;
          descontos?: number;
          descontos_detalhe?: Json | null;
          empresa_id?: string;
          horas_extras?: number;
          id?: string;
          inss?: number;
          irrf?: number;
          lancamento_id?: string | null;
          liquido?: number;
          observacoes?: string | null;
          salario?: number;
          status?: Database["public"]["Enums"]["folha_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "folha_pagamento_colaborador_id_fkey";
            columns: ["colaborador_id"];
            isOneToOne: false;
            referencedRelation: "colaboradores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "folha_pagamento_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "folha_pagamento_lancamento_id_fkey";
            columns: ["lancamento_id"];
            isOneToOne: false;
            referencedRelation: "lancamentos_financeiros";
            referencedColumns: ["id"];
          },
        ];
      };
      lancamentos_financeiros: {
        Row: {
          categoria_id: string | null;
          centro_custo_id: string | null;
          conta_bancaria_id: string | null;
          contato_id: string | null;
          created_at: string;
          created_by: string | null;
          data_emissao: string;
          data_pagamento: string | null;
          data_vencimento: string;
          descricao: string;
          documento: string | null;
          empresa_id: string;
          forma_pagamento: string | null;
          id: string;
          observacoes: string | null;
          status: Database["public"]["Enums"]["lancamento_status"];
          tipo: Database["public"]["Enums"]["lancamento_tipo"];
          transferencia_id: string | null;
          updated_at: string;
          valor: number;
          valor_pago: number;
        };
        Insert: {
          categoria_id?: string | null;
          centro_custo_id?: string | null;
          conta_bancaria_id?: string | null;
          contato_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          data_emissao?: string;
          data_pagamento?: string | null;
          data_vencimento: string;
          descricao: string;
          documento?: string | null;
          empresa_id: string;
          forma_pagamento?: string | null;
          id?: string;
          observacoes?: string | null;
          status?: Database["public"]["Enums"]["lancamento_status"];
          tipo: Database["public"]["Enums"]["lancamento_tipo"];
          transferencia_id?: string | null;
          updated_at?: string;
          valor: number;
          valor_pago?: number;
        };
        Update: {
          categoria_id?: string | null;
          centro_custo_id?: string | null;
          conta_bancaria_id?: string | null;
          contato_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          data_emissao?: string;
          data_pagamento?: string | null;
          data_vencimento?: string;
          descricao?: string;
          documento?: string | null;
          empresa_id?: string;
          forma_pagamento?: string | null;
          id?: string;
          observacoes?: string | null;
          status?: Database["public"]["Enums"]["lancamento_status"];
          tipo?: Database["public"]["Enums"]["lancamento_tipo"];
          transferencia_id?: string | null;
          updated_at?: string;
          valor?: number;
          valor_pago?: number;
        };
        Relationships: [
          {
            foreignKeyName: "lancamentos_financeiros_categoria_id_fkey";
            columns: ["categoria_id"];
            isOneToOne: false;
            referencedRelation: "categorias_financeiras";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lancamentos_financeiros_centro_custo_id_fkey";
            columns: ["centro_custo_id"];
            isOneToOne: false;
            referencedRelation: "centros_custo";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lancamentos_financeiros_conta_bancaria_id_fkey";
            columns: ["conta_bancaria_id"];
            isOneToOne: false;
            referencedRelation: "contas_bancarias";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lancamentos_financeiros_contato_id_fkey";
            columns: ["contato_id"];
            isOneToOne: false;
            referencedRelation: "contatos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lancamentos_financeiros_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lancamentos_financeiros_transferencia_id_fkey";
            columns: ["transferencia_id"];
            isOneToOne: false;
            referencedRelation: "transferencias_contas";
            referencedColumns: ["id"];
          },
        ];
      };
      mdf_cte_vinculos: {
        Row: {
          chave_cte: string;
          created_at: string | null;
          cte_id: string | null;
          id: string;
          mdf_id: string;
        };
        Insert: {
          chave_cte: string;
          created_at?: string | null;
          cte_id?: string | null;
          id?: string;
          mdf_id: string;
        };
        Update: {
          chave_cte?: string;
          created_at?: string | null;
          cte_id?: string | null;
          id?: string;
          mdf_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mdf_cte_vinculos_cte_id_fkey";
            columns: ["cte_id"];
            isOneToOne: false;
            referencedRelation: "cte_documentos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mdf_cte_vinculos_mdf_id_fkey";
            columns: ["mdf_id"];
            isOneToOne: false;
            referencedRelation: "mdf_documentos";
            referencedColumns: ["id"];
          },
        ];
      };
      mdf_documentos: {
        Row: {
          ambiente: string | null;
          chave_acesso: string | null;
          created_at: string | null;
          created_by: string | null;
          data_autorizacao: string | null;
          data_emissao: string | null;
          data_encerramento: string | null;
          empresa_id: string;
          id: string;
          modelo: string | null;
          motivo_rejeicao: string | null;
          motorista_id: string | null;
          numero: string | null;
          peso_total: number | null;
          protocolo_sefaz: string | null;
          qtd_cte: number | null;
          responsavel_emissao: string | null;
          responsavel_encerramento: string | null;
          serie: string | null;
          status: string;
          uf_carregamento: string | null;
          uf_descarregamento: string | null;
          updated_at: string | null;
          valor_total_carga: number | null;
          veiculo_tracao_id: string | null;
          xml_assinado: string | null;
          xml_protocolo: string | null;
        };
        Insert: {
          ambiente?: string | null;
          chave_acesso?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          data_autorizacao?: string | null;
          data_emissao?: string | null;
          data_encerramento?: string | null;
          empresa_id: string;
          id?: string;
          modelo?: string | null;
          motivo_rejeicao?: string | null;
          motorista_id?: string | null;
          numero?: string | null;
          peso_total?: number | null;
          protocolo_sefaz?: string | null;
          qtd_cte?: number | null;
          responsavel_emissao?: string | null;
          responsavel_encerramento?: string | null;
          serie?: string | null;
          status?: string;
          uf_carregamento?: string | null;
          uf_descarregamento?: string | null;
          updated_at?: string | null;
          valor_total_carga?: number | null;
          veiculo_tracao_id?: string | null;
          xml_assinado?: string | null;
          xml_protocolo?: string | null;
        };
        Update: {
          ambiente?: string | null;
          chave_acesso?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          data_autorizacao?: string | null;
          data_emissao?: string | null;
          data_encerramento?: string | null;
          empresa_id?: string;
          id?: string;
          modelo?: string | null;
          motivo_rejeicao?: string | null;
          motorista_id?: string | null;
          numero?: string | null;
          peso_total?: number | null;
          protocolo_sefaz?: string | null;
          qtd_cte?: number | null;
          responsavel_emissao?: string | null;
          responsavel_encerramento?: string | null;
          serie?: string | null;
          status?: string;
          uf_carregamento?: string | null;
          uf_descarregamento?: string | null;
          updated_at?: string | null;
          valor_total_carga?: number | null;
          veiculo_tracao_id?: string | null;
          xml_assinado?: string | null;
          xml_protocolo?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "mdf_documentos_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mdf_documentos_motorista_id_fkey";
            columns: ["motorista_id"];
            isOneToOne: false;
            referencedRelation: "colaboradores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mdf_documentos_veiculo_tracao_id_fkey";
            columns: ["veiculo_tracao_id"];
            isOneToOne: false;
            referencedRelation: "veiculos";
            referencedColumns: ["id"];
          },
        ];
      };
      movimentacoes_estoque: {
        Row: {
          created_at: string;
          created_by: string | null;
          custo_unitario: number | null;
          data: string;
          deposito_id: string | null;
          empresa_id: string;
          id: string;
          observacoes: string | null;
          produto_id: string;
          quantidade: number;
          tipo: Database["public"]["Enums"]["estoque_movimento"];
          venda_id: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          custo_unitario?: number | null;
          data?: string;
          deposito_id?: string | null;
          empresa_id: string;
          id?: string;
          observacoes?: string | null;
          produto_id: string;
          quantidade: number;
          tipo: Database["public"]["Enums"]["estoque_movimento"];
          venda_id?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          custo_unitario?: number | null;
          data?: string;
          deposito_id?: string | null;
          empresa_id?: string;
          id?: string;
          observacoes?: string | null;
          produto_id?: string;
          quantidade?: number;
          tipo?: Database["public"]["Enums"]["estoque_movimento"];
          venda_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "movimentacoes_estoque_deposito_id_fkey";
            columns: ["deposito_id"];
            isOneToOne: false;
            referencedRelation: "depositos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "movimentacoes_estoque_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "movimentacoes_estoque_produto_id_fkey";
            columns: ["produto_id"];
            isOneToOne: false;
            referencedRelation: "produtos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "movimentacoes_estoque_venda_id_fkey";
            columns: ["venda_id"];
            isOneToOne: false;
            referencedRelation: "vendas";
            referencedColumns: ["id"];
          },
        ];
      };
      multas: {
        Row: {
          auto_infracao: string | null;
          created_at: string;
          data_infracao: string;
          data_vencimento: string | null;
          descricao: string | null;
          empresa_id: string;
          id: string;
          orgao_autuador: string | null;
          origem: string;
          placa: string;
          pontos: number | null;
          renavam: string | null;
          status: Database["public"]["Enums"]["multa_status"];
          updated_at: string;
          valor: number;
          veiculo_id: string | null;
        };
        Insert: {
          auto_infracao?: string | null;
          created_at?: string;
          data_infracao?: string;
          data_vencimento?: string | null;
          descricao?: string | null;
          empresa_id: string;
          id?: string;
          orgao_autuador?: string | null;
          origem?: string;
          placa: string;
          pontos?: number | null;
          renavam?: string | null;
          status?: Database["public"]["Enums"]["multa_status"];
          updated_at?: string;
          valor?: number;
          veiculo_id?: string | null;
        };
        Update: {
          auto_infracao?: string | null;
          created_at?: string;
          data_infracao?: string;
          data_vencimento?: string | null;
          descricao?: string | null;
          empresa_id?: string;
          id?: string;
          orgao_autuador?: string | null;
          origem?: string;
          placa?: string;
          pontos?: number | null;
          renavam?: string | null;
          status?: Database["public"]["Enums"]["multa_status"];
          updated_at?: string;
          valor?: number;
          veiculo_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "multas_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "multas_veiculo_id_fkey";
            columns: ["veiculo_id"];
            isOneToOne: false;
            referencedRelation: "veiculos";
            referencedColumns: ["id"];
          },
        ];
      };
      multas_config: {
        Row: {
          ativo: boolean;
          empresa_id: string;
          endpoint: string | null;
          senha: string | null;
          ultima_sync: string | null;
          updated_at: string;
          usuario: string | null;
        };
        Insert: {
          ativo?: boolean;
          empresa_id: string;
          endpoint?: string | null;
          senha?: string | null;
          ultima_sync?: string | null;
          updated_at?: string;
          usuario?: string | null;
        };
        Update: {
          ativo?: boolean;
          empresa_id?: string;
          endpoint?: string | null;
          senha?: string | null;
          ultima_sync?: string | null;
          updated_at?: string;
          usuario?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "multas_config_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: true;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
        ];
      };
      nfe_config: {
        Row: {
          ambiente: string;
          cnae: string | null;
          created_at: string;
          empresa_id: string;
          id: string;
          last_nsu: string | null;
          last_query_at: string | null;
          natureza_operacao: string | null;
          proximo_numero: number;
          regime_tributario: string;
          serie: number;
          updated_at: string;
        };
        Insert: {
          ambiente?: string;
          cnae?: string | null;
          created_at?: string;
          empresa_id: string;
          id?: string;
          last_nsu?: string | null;
          last_query_at?: string | null;
          natureza_operacao?: string | null;
          proximo_numero?: number;
          regime_tributario?: string;
          serie?: number;
          updated_at?: string;
        };
        Update: {
          ambiente?: string;
          cnae?: string | null;
          created_at?: string;
          empresa_id?: string;
          id?: string;
          last_nsu?: string | null;
          last_query_at?: string | null;
          natureza_operacao?: string | null;
          proximo_numero?: number;
          regime_tributario?: string;
          serie?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "nfe_config_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: true;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
        ];
      };
      notas_fiscais: {
        Row: {
          chave: string | null;
          contato_id: string | null;
          created_at: string;
          data_emissao: string | null;
          empresa_id: string;
          id: string;
          mensagem: string | null;
          numero: string | null;
          pdf_url: string | null;
          serie: string | null;
          status: Database["public"]["Enums"]["nf_status"];
          tipo: Database["public"]["Enums"]["nf_tipo"];
          updated_at: string;
          valor_total: number | null;
          venda_id: string | null;
          xml_url: string | null;
        };
        Insert: {
          chave?: string | null;
          contato_id?: string | null;
          created_at?: string;
          data_emissao?: string | null;
          empresa_id: string;
          id?: string;
          mensagem?: string | null;
          numero?: string | null;
          pdf_url?: string | null;
          serie?: string | null;
          status?: Database["public"]["Enums"]["nf_status"];
          tipo?: Database["public"]["Enums"]["nf_tipo"];
          updated_at?: string;
          valor_total?: number | null;
          venda_id?: string | null;
          xml_url?: string | null;
        };
        Update: {
          chave?: string | null;
          contato_id?: string | null;
          created_at?: string;
          data_emissao?: string | null;
          empresa_id?: string;
          id?: string;
          mensagem?: string | null;
          numero?: string | null;
          pdf_url?: string | null;
          serie?: string | null;
          status?: Database["public"]["Enums"]["nf_status"];
          tipo?: Database["public"]["Enums"]["nf_tipo"];
          updated_at?: string;
          valor_total?: number | null;
          venda_id?: string | null;
          xml_url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "notas_fiscais_contato_id_fkey";
            columns: ["contato_id"];
            isOneToOne: false;
            referencedRelation: "contatos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notas_fiscais_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notas_fiscais_venda_id_fkey";
            columns: ["venda_id"];
            isOneToOne: false;
            referencedRelation: "vendas";
            referencedColumns: ["id"];
          },
        ];
      };
      notas_importadas: {
        Row: {
          chave_acesso: string;
          cnpj_emitente: string;
          created_at: string | null;
          data_emissao: string | null;
          emitente: string;
          empresa_id: string;
          id: string;
          numero_nf: string | null;
          situacao: string | null;
          updated_at: string | null;
          valor_total: number | null;
          xml_completo: string | null;
        };
        Insert: {
          chave_acesso: string;
          cnpj_emitente: string;
          created_at?: string | null;
          data_emissao?: string | null;
          emitente: string;
          empresa_id: string;
          id?: string;
          numero_nf?: string | null;
          situacao?: string | null;
          updated_at?: string | null;
          valor_total?: number | null;
          xml_completo?: string | null;
        };
        Update: {
          chave_acesso?: string;
          cnpj_emitente?: string;
          created_at?: string | null;
          data_emissao?: string | null;
          emitente?: string;
          empresa_id?: string;
          id?: string;
          numero_nf?: string | null;
          situacao?: string | null;
          updated_at?: string | null;
          valor_total?: number | null;
          xml_completo?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "notas_importadas_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
        ];
      };
      notas_importadas_itens: {
        Row: {
          categoria: string | null;
          codigo: string | null;
          created_at: string | null;
          id: string;
          nome: string;
          nota_id: string;
          quantidade: number | null;
          unidade: string | null;
          valor_total: number | null;
          valor_unitario: number | null;
        };
        Insert: {
          categoria?: string | null;
          codigo?: string | null;
          created_at?: string | null;
          id?: string;
          nome: string;
          nota_id: string;
          quantidade?: number | null;
          unidade?: string | null;
          valor_total?: number | null;
          valor_unitario?: number | null;
        };
        Update: {
          categoria?: string | null;
          codigo?: string | null;
          created_at?: string | null;
          id?: string;
          nome?: string;
          nota_id?: string;
          quantidade?: number | null;
          unidade?: string | null;
          valor_total?: number | null;
          valor_unitario?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "notas_importadas_itens_nota_id_fkey";
            columns: ["nota_id"];
            isOneToOne: false;
            referencedRelation: "notas_importadas";
            referencedColumns: ["id"];
          },
        ];
      };
      notas_importadas_parcelas: {
        Row: {
          created_at: string | null;
          data_vencimento: string;
          id: string;
          lancamento_id: string | null;
          nota_id: string;
          numero: string;
          valor: number;
        };
        Insert: {
          created_at?: string | null;
          data_vencimento: string;
          id?: string;
          lancamento_id?: string | null;
          nota_id: string;
          numero: string;
          valor: number;
        };
        Update: {
          created_at?: string | null;
          data_vencimento?: string;
          id?: string;
          lancamento_id?: string | null;
          nota_id?: string;
          numero?: string;
          valor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "notas_importadas_parcelas_lancamento_id_fkey";
            columns: ["lancamento_id"];
            isOneToOne: false;
            referencedRelation: "lancamentos_financeiros";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notas_importadas_parcelas_nota_id_fkey";
            columns: ["nota_id"];
            isOneToOne: false;
            referencedRelation: "notas_importadas";
            referencedColumns: ["id"];
          },
        ];
      };
      ofx_transacoes: {
        Row: {
          conta_bancaria_id: string;
          created_at: string;
          data_transacao: string;
          empresa_id: string;
          fitid: string;
          id: string;
          lancamento_id: string | null;
          memo: string | null;
          status: string;
          tipo: string;
          updated_at: string;
          valor: number;
        };
        Insert: {
          conta_bancaria_id: string;
          created_at?: string;
          data_transacao: string;
          empresa_id: string;
          fitid: string;
          id?: string;
          lancamento_id?: string | null;
          memo?: string | null;
          status?: string;
          tipo: string;
          updated_at?: string;
          valor: number;
        };
        Update: {
          conta_bancaria_id?: string;
          created_at?: string;
          data_transacao?: string;
          empresa_id?: string;
          fitid?: string;
          id?: string;
          lancamento_id?: string | null;
          memo?: string | null;
          status?: string;
          tipo?: string;
          updated_at?: string;
          valor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "ofx_transacoes_conta_bancaria_id_fkey";
            columns: ["conta_bancaria_id"];
            isOneToOne: false;
            referencedRelation: "contas_bancarias";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ofx_transacoes_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ofx_transacoes_lancamento_id_fkey";
            columns: ["lancamento_id"];
            isOneToOne: false;
            referencedRelation: "lancamentos_financeiros";
            referencedColumns: ["id"];
          },
        ];
      };
      ordens_compra: {
        Row: {
          conta_bancaria_id: string | null;
          created_at: string;
          data_emissao: string;
          data_prevista: string | null;
          deposito_id: string | null;
          empresa_id: string;
          fornecedor_id: string | null;
          id: string;
          numero: number | null;
          observacoes: string | null;
          status: Database["public"]["Enums"]["oc_status"];
          total: number;
          updated_at: string;
        };
        Insert: {
          conta_bancaria_id?: string | null;
          created_at?: string;
          data_emissao?: string;
          data_prevista?: string | null;
          deposito_id?: string | null;
          empresa_id: string;
          fornecedor_id?: string | null;
          id?: string;
          numero?: number | null;
          observacoes?: string | null;
          status?: Database["public"]["Enums"]["oc_status"];
          total?: number;
          updated_at?: string;
        };
        Update: {
          conta_bancaria_id?: string | null;
          created_at?: string;
          data_emissao?: string;
          data_prevista?: string | null;
          deposito_id?: string | null;
          empresa_id?: string;
          fornecedor_id?: string | null;
          id?: string;
          numero?: number | null;
          observacoes?: string | null;
          status?: Database["public"]["Enums"]["oc_status"];
          total?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ordens_compra_conta_bancaria_id_fkey";
            columns: ["conta_bancaria_id"];
            isOneToOne: false;
            referencedRelation: "contas_bancarias";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ordens_compra_deposito_id_fkey";
            columns: ["deposito_id"];
            isOneToOne: false;
            referencedRelation: "depositos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ordens_compra_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ordens_compra_fornecedor_id_fkey";
            columns: ["fornecedor_id"];
            isOneToOne: false;
            referencedRelation: "contatos";
            referencedColumns: ["id"];
          },
        ];
      };
      ordens_compra_itens: {
        Row: {
          created_at: string;
          custo_unitario: number;
          id: string;
          ordem_id: string;
          produto_id: string;
          quantidade: number;
          subtotal: number;
        };
        Insert: {
          created_at?: string;
          custo_unitario?: number;
          id?: string;
          ordem_id: string;
          produto_id: string;
          quantidade?: number;
          subtotal?: number;
        };
        Update: {
          created_at?: string;
          custo_unitario?: number;
          id?: string;
          ordem_id?: string;
          produto_id?: string;
          quantidade?: number;
          subtotal?: number;
        };
        Relationships: [
          {
            foreignKeyName: "ordens_compra_itens_ordem_id_fkey";
            columns: ["ordem_id"];
            isOneToOne: false;
            referencedRelation: "ordens_compra";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ordens_compra_itens_produto_id_fkey";
            columns: ["produto_id"];
            isOneToOne: false;
            referencedRelation: "produtos";
            referencedColumns: ["id"];
          },
        ];
      };
      ordens_servico: {
        Row: {
          cliente_id: string | null;
          created_at: string;
          data_abertura: string;
          data_conclusao: string | null;
          data_prevista: string | null;
          descricao: string | null;
          empresa_id: string;
          id: string;
          numero: number | null;
          observacoes: string | null;
          prioridade: Database["public"]["Enums"]["os_prioridade"];
          projeto_id: string | null;
          responsavel_id: string | null;
          status: Database["public"]["Enums"]["os_status"];
          titulo: string;
          updated_at: string;
          valor: number | null;
        };
        Insert: {
          cliente_id?: string | null;
          created_at?: string;
          data_abertura?: string;
          data_conclusao?: string | null;
          data_prevista?: string | null;
          descricao?: string | null;
          empresa_id: string;
          id?: string;
          numero?: number | null;
          observacoes?: string | null;
          prioridade?: Database["public"]["Enums"]["os_prioridade"];
          projeto_id?: string | null;
          responsavel_id?: string | null;
          status?: Database["public"]["Enums"]["os_status"];
          titulo: string;
          updated_at?: string;
          valor?: number | null;
        };
        Update: {
          cliente_id?: string | null;
          created_at?: string;
          data_abertura?: string;
          data_conclusao?: string | null;
          data_prevista?: string | null;
          descricao?: string | null;
          empresa_id?: string;
          id?: string;
          numero?: number | null;
          observacoes?: string | null;
          prioridade?: Database["public"]["Enums"]["os_prioridade"];
          projeto_id?: string | null;
          responsavel_id?: string | null;
          status?: Database["public"]["Enums"]["os_status"];
          titulo?: string;
          updated_at?: string;
          valor?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "ordens_servico_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "contatos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ordens_servico_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ordens_servico_projeto_id_fkey";
            columns: ["projeto_id"];
            isOneToOne: false;
            referencedRelation: "projetos";
            referencedColumns: ["id"];
          },
        ];
      };
      produtos: {
        Row: {
          ativo: boolean;
          categoria: string | null;
          cfop: string | null;
          codigo: string | null;
          created_at: string;
          descricao: string | null;
          empresa_id: string;
          estoque_atual: number | null;
          estoque_minimo: number | null;
          id: string;
          ncm: string | null;
          nome: string;
          preco_custo: number | null;
          preco_venda: number | null;
          unidade: string | null;
          updated_at: string;
        };
        Insert: {
          ativo?: boolean;
          categoria?: string | null;
          cfop?: string | null;
          codigo?: string | null;
          created_at?: string;
          descricao?: string | null;
          empresa_id: string;
          estoque_atual?: number | null;
          estoque_minimo?: number | null;
          id?: string;
          ncm?: string | null;
          nome: string;
          preco_custo?: number | null;
          preco_venda?: number | null;
          unidade?: string | null;
          updated_at?: string;
        };
        Update: {
          ativo?: boolean;
          categoria?: string | null;
          cfop?: string | null;
          codigo?: string | null;
          created_at?: string;
          descricao?: string | null;
          empresa_id?: string;
          estoque_atual?: number | null;
          estoque_minimo?: number | null;
          id?: string;
          ncm?: string | null;
          nome?: string;
          preco_custo?: number | null;
          preco_venda?: number | null;
          unidade?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "produtos_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          email: string | null;
          id: string;
          nome: string | null;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string | null;
          id: string;
          nome?: string | null;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          nome?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      projetos: {
        Row: {
          cliente_id: string | null;
          cor: string | null;
          created_at: string;
          data_conclusao: string | null;
          data_inicio: string | null;
          data_prevista: string | null;
          descricao: string | null;
          empresa_id: string;
          id: string;
          nome: string;
          orcamento: number | null;
          status: Database["public"]["Enums"]["projeto_status"];
          updated_at: string;
        };
        Insert: {
          cliente_id?: string | null;
          cor?: string | null;
          created_at?: string;
          data_conclusao?: string | null;
          data_inicio?: string | null;
          data_prevista?: string | null;
          descricao?: string | null;
          empresa_id: string;
          id?: string;
          nome: string;
          orcamento?: number | null;
          status?: Database["public"]["Enums"]["projeto_status"];
          updated_at?: string;
        };
        Update: {
          cliente_id?: string | null;
          cor?: string | null;
          created_at?: string;
          data_conclusao?: string | null;
          data_inicio?: string | null;
          data_prevista?: string | null;
          descricao?: string | null;
          empresa_id?: string;
          id?: string;
          nome?: string;
          orcamento?: number | null;
          status?: Database["public"]["Enums"]["projeto_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "projetos_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "contatos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "projetos_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
        ];
      };
      rntrc_lista: {
        Row: {
          categoria: string | null;
          cnpj: string;
          created_at: string | null;
          empresa_id: string;
          id: string;
          nome: string;
          rntrc: string;
        };
        Insert: {
          categoria?: string | null;
          cnpj: string;
          created_at?: string | null;
          empresa_id: string;
          id?: string;
          nome?: string;
          rntrc: string;
        };
        Update: {
          categoria?: string | null;
          cnpj?: string;
          created_at?: string | null;
          empresa_id?: string;
          id?: string;
          nome?: string;
          rntrc?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rntrc_lista_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
        ];
      };
      seguradoras: {
        Row: {
          apolice_numero: string | null;
          ativo: boolean;
          averbacao: string | null;
          cnpj: string | null;
          created_at: string | null;
          email: string | null;
          empresa_id: string;
          id: string;
          nome: string;
          telefone: string | null;
          updated_at: string | null;
        };
        Insert: {
          apolice_numero?: string | null;
          ativo?: boolean;
          averbacao?: string | null;
          cnpj?: string | null;
          created_at?: string | null;
          email?: string | null;
          empresa_id: string;
          id?: string;
          nome: string;
          telefone?: string | null;
          updated_at?: string | null;
        };
        Update: {
          apolice_numero?: string | null;
          ativo?: boolean;
          averbacao?: string | null;
          cnpj?: string | null;
          created_at?: string | null;
          email?: string | null;
          empresa_id?: string;
          id?: string;
          nome?: string;
          telefone?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "seguradoras_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
        ];
      };
      super_admins: {
        Row: {
          created_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      transferencias_contas: {
        Row: {
          conta_destino_id: string;
          conta_origem_id: string;
          created_at: string;
          created_by: string | null;
          data: string;
          descricao: string;
          empresa_id: string;
          id: string;
          observacoes: string | null;
          updated_at: string;
          valor: number;
        };
        Insert: {
          conta_destino_id: string;
          conta_origem_id: string;
          created_at?: string;
          created_by?: string | null;
          data?: string;
          descricao?: string;
          empresa_id: string;
          id?: string;
          observacoes?: string | null;
          updated_at?: string;
          valor: number;
        };
        Update: {
          conta_destino_id?: string;
          conta_origem_id?: string;
          created_at?: string;
          created_by?: string | null;
          data?: string;
          descricao?: string;
          empresa_id?: string;
          id?: string;
          observacoes?: string | null;
          updated_at?: string;
          valor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "transferencias_contas_conta_destino_id_fkey";
            columns: ["conta_destino_id"];
            isOneToOne: false;
            referencedRelation: "contas_bancarias";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transferencias_contas_conta_origem_id_fkey";
            columns: ["conta_origem_id"];
            isOneToOne: false;
            referencedRelation: "contas_bancarias";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transferencias_contas_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
        ];
      };
      veiculos: {
        Row: {
          ano: number | null;
          categoria: string | null;
          chassi: string | null;
          created_at: string;
          empresa_id: string;
          id: string;
          km_atual: number | null;
          marca_modelo: string | null;
          observacoes: string | null;
          placa: string;
          proprietario: string | null;
          proprietario_doc: string | null;
          quantidade_eixos: number | null;
          renavam: string | null;
          rntrc: string | null;
          status: Database["public"]["Enums"]["veiculo_status"];
          tag_pedagio: string | null;
          tipo: string | null;
          updated_at: string;
        };
        Insert: {
          ano?: number | null;
          categoria?: string | null;
          chassi?: string | null;
          created_at?: string;
          empresa_id: string;
          id?: string;
          km_atual?: number | null;
          marca_modelo?: string | null;
          observacoes?: string | null;
          placa: string;
          proprietario?: string | null;
          proprietario_doc?: string | null;
          quantidade_eixos?: number | null;
          renavam?: string | null;
          rntrc?: string | null;
          status?: Database["public"]["Enums"]["veiculo_status"];
          tag_pedagio?: string | null;
          tipo?: string | null;
          updated_at?: string;
        };
        Update: {
          ano?: number | null;
          categoria?: string | null;
          chassi?: string | null;
          created_at?: string;
          empresa_id?: string;
          id?: string;
          km_atual?: number | null;
          marca_modelo?: string | null;
          observacoes?: string | null;
          placa?: string;
          proprietario?: string | null;
          proprietario_doc?: string | null;
          quantidade_eixos?: number | null;
          renavam?: string | null;
          rntrc?: string | null;
          status?: Database["public"]["Enums"]["veiculo_status"];
          tag_pedagio?: string | null;
          tipo?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "veiculos_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
        ];
      };
      veiculos_tipos: {
        Row: {
          created_at: string;
          empresa_id: string;
          id: string;
          nome: string;
        };
        Insert: {
          created_at?: string;
          empresa_id: string;
          id?: string;
          nome: string;
        };
        Update: {
          created_at?: string;
          empresa_id?: string;
          id?: string;
          nome?: string;
        };
        Relationships: [
          {
            foreignKeyName: "veiculos_tipos_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
        ];
      };
      venda_itens: {
        Row: {
          created_at: string;
          desconto: number;
          desconto_pct: number;
          descricao: string;
          id: string;
          preco_unitario: number;
          produto_id: string | null;
          quantidade: number;
          total: number;
          venda_id: string;
        };
        Insert: {
          created_at?: string;
          desconto?: number;
          desconto_pct?: number;
          descricao: string;
          id?: string;
          preco_unitario?: number;
          produto_id?: string | null;
          quantidade?: number;
          total?: number;
          venda_id: string;
        };
        Update: {
          created_at?: string;
          desconto?: number;
          desconto_pct?: number;
          descricao?: string;
          id?: string;
          preco_unitario?: number;
          produto_id?: string | null;
          quantidade?: number;
          total?: number;
          venda_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "venda_itens_produto_id_fkey";
            columns: ["produto_id"];
            isOneToOne: false;
            referencedRelation: "produtos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "venda_itens_venda_id_fkey";
            columns: ["venda_id"];
            isOneToOne: false;
            referencedRelation: "vendas";
            referencedColumns: ["id"];
          },
        ];
      };
      vendas: {
        Row: {
          cliente_id: string | null;
          condicao_pagamento_id: string | null;
          created_at: string;
          data: string;
          data_validade: string | null;
          desconto: number;
          empresa_id: string;
          frete: number;
          id: string;
          numero: number;
          observacoes: string | null;
          status: Database["public"]["Enums"]["venda_status"];
          subtotal: number;
          total: number;
          updated_at: string;
          vendedor_id: string | null;
        };
        Insert: {
          cliente_id?: string | null;
          condicao_pagamento_id?: string | null;
          created_at?: string;
          data?: string;
          data_validade?: string | null;
          desconto?: number;
          empresa_id: string;
          frete?: number;
          id?: string;
          numero?: number;
          observacoes?: string | null;
          status?: Database["public"]["Enums"]["venda_status"];
          subtotal?: number;
          total?: number;
          updated_at?: string;
          vendedor_id?: string | null;
        };
        Update: {
          cliente_id?: string | null;
          condicao_pagamento_id?: string | null;
          created_at?: string;
          data?: string;
          data_validade?: string | null;
          desconto?: number;
          empresa_id?: string;
          frete?: number;
          id?: string;
          numero?: number;
          observacoes?: string | null;
          status?: Database["public"]["Enums"]["venda_status"];
          subtotal?: number;
          total?: number;
          updated_at?: string;
          vendedor_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "vendas_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "contatos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vendas_condicao_pagamento_id_fkey";
            columns: ["condicao_pagamento_id"];
            isOneToOne: false;
            referencedRelation: "condicoes_pagamento";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vendas_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
        ];
      };
      viagem_despesas: {
        Row: {
          created_at: string;
          data: string;
          descricao: string | null;
          empresa_id: string;
          id: string;
          lancamento_id: string | null;
          tipo: string;
          valor: number;
          viagem_id: string;
        };
        Insert: {
          created_at?: string;
          data?: string;
          descricao?: string | null;
          empresa_id: string;
          id?: string;
          lancamento_id?: string | null;
          tipo?: string;
          valor?: number;
          viagem_id: string;
        };
        Update: {
          created_at?: string;
          data?: string;
          descricao?: string | null;
          empresa_id?: string;
          id?: string;
          lancamento_id?: string | null;
          tipo?: string;
          valor?: number;
          viagem_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "viagem_despesas_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "viagem_despesas_lancamento_id_fkey";
            columns: ["lancamento_id"];
            isOneToOne: false;
            referencedRelation: "lancamentos_financeiros";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "viagem_despesas_viagem_id_fkey";
            columns: ["viagem_id"];
            isOneToOne: false;
            referencedRelation: "viagens";
            referencedColumns: ["id"];
          },
        ];
      };
      viagens: {
        Row: {
          cliente_id: string | null;
          created_at: string;
          data_chegada: string | null;
          data_saida: string | null;
          destino_cidade: string | null;
          destino_uf: string | null;
          empresa_id: string;
          id: string;
          km_rodado: number | null;
          motorista_id: string | null;
          observacoes: string | null;
          origem_cidade: string | null;
          origem_uf: string | null;
          status: Database["public"]["Enums"]["viagem_status"];
          updated_at: string;
          valor_frete: number;
          veiculo_id: string | null;
        };
        Insert: {
          cliente_id?: string | null;
          created_at?: string;
          data_chegada?: string | null;
          data_saida?: string | null;
          destino_cidade?: string | null;
          destino_uf?: string | null;
          empresa_id: string;
          id?: string;
          km_rodado?: number | null;
          motorista_id?: string | null;
          observacoes?: string | null;
          origem_cidade?: string | null;
          origem_uf?: string | null;
          status?: Database["public"]["Enums"]["viagem_status"];
          updated_at?: string;
          valor_frete?: number;
          veiculo_id?: string | null;
        };
        Update: {
          cliente_id?: string | null;
          created_at?: string;
          data_chegada?: string | null;
          data_saida?: string | null;
          destino_cidade?: string | null;
          destino_uf?: string | null;
          empresa_id?: string;
          id?: string;
          km_rodado?: number | null;
          motorista_id?: string | null;
          observacoes?: string | null;
          origem_cidade?: string | null;
          origem_uf?: string | null;
          status?: Database["public"]["Enums"]["viagem_status"];
          updated_at?: string;
          valor_frete?: number;
          veiculo_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "viagens_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "contatos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "viagens_empresa_id_fkey";
            columns: ["empresa_id"];
            isOneToOne: false;
            referencedRelation: "empresas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "viagens_motorista_id_fkey";
            columns: ["motorista_id"];
            isOneToOne: false;
            referencedRelation: "colaboradores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "viagens_veiculo_id_fkey";
            columns: ["veiculo_id"];
            isOneToOne: false;
            referencedRelation: "veiculos";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      atualizar_status_ferias: { Args: never; Returns: undefined };
      cancelar_nota_fiscal: {
        Args: { _motivo: string; _nf_id: string };
        Returns: {
          chave: string | null;
          contato_id: string | null;
          created_at: string;
          data_emissao: string | null;
          empresa_id: string;
          id: string;
          mensagem: string | null;
          numero: string | null;
          pdf_url: string | null;
          serie: string | null;
          status: Database["public"]["Enums"]["nf_status"];
          tipo: Database["public"]["Enums"]["nf_tipo"];
          updated_at: string;
          valor_total: number | null;
          venda_id: string | null;
          xml_url: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "notas_fiscais";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      emitir_nota_fiscal: {
        Args: { _nf_id: string };
        Returns: {
          chave: string | null;
          contato_id: string | null;
          created_at: string;
          data_emissao: string | null;
          empresa_id: string;
          id: string;
          mensagem: string | null;
          numero: string | null;
          pdf_url: string | null;
          serie: string | null;
          status: Database["public"]["Enums"]["nf_status"];
          tipo: Database["public"]["Enums"]["nf_tipo"];
          updated_at: string;
          valor_total: number | null;
          venda_id: string | null;
          xml_url: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "notas_fiscais";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      gerar_adiantamentos_recorrentes: { Args: never; Returns: number };
      has_empresa_role: {
        Args: {
          _empresa: string;
          _roles: Database["public"]["Enums"]["app_role"][];
          _user: string;
        };
        Returns: boolean;
      };
      immutable_unaccent: { Args: { "": string }; Returns: string };
      is_empresa_member: {
        Args: { _empresa: string; _user: string };
        Returns: boolean;
      };
      normcargo: { Args: { "": string }; Returns: string };
      recalc_saldo_conta: { Args: { _conta_id: string }; Returns: undefined };
      registrar_multas_senatran: {
        Args: { p_empresa: string; p_multas: Json };
        Returns: number;
      };
      transferir_estoque: {
        Args: {
          _deposito_destino: string;
          _deposito_origem: string;
          _observacao?: string;
          _produto: string;
          _quantidade: number;
        };
        Returns: string;
      };
      unaccent: { Args: { "": string }; Returns: string };
    };
    Enums: {
      adiantamento_status: "aberto" | "descontado" | "cancelado";
      app_role: "owner" | "admin" | "financeiro" | "vendas" | "estoque" | "fiscal" | "viewer";
      colaborador_status: "ativo" | "ferias" | "afastado" | "demitido";
      comissao_status: "prevista" | "aprovada" | "paga" | "cancelada";
      conta_financeira_tipo:
        | "corrente"
        | "caixa"
        | "cartao_credito"
        | "investimento"
        | "poupanca"
        | "aplicacao_automatica"
        | "outras";
      contato_tipo: "cliente" | "fornecedor" | "ambos" | "transportadora";
      emprestimo_status: "ativo" | "quitado" | "cancelado";
      emprestimo_tipo: "emprestimo" | "financiamento";
      estoque_movimento: "entrada" | "saida" | "ajuste" | "transferencia";
      ferias_concessao_status: "agendada" | "em_gozo" | "concluida" | "cancelada";
      folha_status: "aberta" | "lançada" | "paga" | "cancelada";
      lancamento_status: "aberto" | "pago" | "parcial" | "vencido" | "cancelado";
      lancamento_tipo: "receber" | "pagar";
      multa_status: "aberta" | "paga" | "contestada";
      nf_status: "rascunho" | "emitida" | "autorizada" | "cancelada" | "rejeitada";
      nf_tipo: "nfe" | "nfse" | "nfce";
      oc_status: "rascunho" | "enviada" | "recebida" | "cancelada";
      os_prioridade: "baixa" | "media" | "alta" | "urgente";
      os_status: "aberta" | "em_execucao" | "aguardando" | "concluida" | "cancelada" | "faturada";
      parcela_status: "aberta" | "paga" | "cancelada";
      projeto_status: "planejado" | "em_andamento" | "pausado" | "concluido" | "cancelado";
      veiculo_status: "ativo" | "manutencao" | "inativo";
      venda_status: "rascunho" | "proposta" | "pedido" | "faturado" | "cancelado";
      viagem_status: "planejada" | "em_transito" | "concluida" | "cancelada";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      adiantamento_status: ["aberto", "descontado", "cancelado"],
      app_role: ["owner", "admin", "financeiro", "vendas", "estoque", "fiscal", "viewer"],
      colaborador_status: ["ativo", "ferias", "afastado", "demitido"],
      comissao_status: ["prevista", "aprovada", "paga", "cancelada"],
      conta_financeira_tipo: [
        "corrente",
        "caixa",
        "cartao_credito",
        "investimento",
        "poupanca",
        "aplicacao_automatica",
        "outras",
      ],
      contato_tipo: ["cliente", "fornecedor", "ambos", "transportadora"],
      emprestimo_status: ["ativo", "quitado", "cancelado"],
      emprestimo_tipo: ["emprestimo", "financiamento"],
      estoque_movimento: ["entrada", "saida", "ajuste", "transferencia"],
      ferias_concessao_status: ["agendada", "em_gozo", "concluida", "cancelada"],
      folha_status: ["aberta", "lançada", "paga", "cancelada"],
      lancamento_status: ["aberto", "pago", "parcial", "vencido", "cancelado"],
      lancamento_tipo: ["receber", "pagar"],
      multa_status: ["aberta", "paga", "contestada"],
      nf_status: ["rascunho", "emitida", "autorizada", "cancelada", "rejeitada"],
      nf_tipo: ["nfe", "nfse", "nfce"],
      oc_status: ["rascunho", "enviada", "recebida", "cancelada"],
      os_prioridade: ["baixa", "media", "alta", "urgente"],
      os_status: ["aberta", "em_execucao", "aguardando", "concluida", "cancelada", "faturada"],
      parcela_status: ["aberta", "paga", "cancelada"],
      projeto_status: ["planejado", "em_andamento", "pausado", "concluido", "cancelado"],
      veiculo_status: ["ativo", "manutencao", "inativo"],
      venda_status: ["rascunho", "proposta", "pedido", "faturado", "cancelado"],
      viagem_status: ["planejada", "em_transito", "concluida", "cancelada"],
    },
  },
} as const;
