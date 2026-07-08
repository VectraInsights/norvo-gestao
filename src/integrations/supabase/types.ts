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
      alertas: {
        Row: {
          created_at: string
          empresa_id: string
          id: string
          lido: boolean
          mensagem: string | null
          ref_id: string | null
          ref_tabela: string | null
          severidade: string
          tipo: string
          titulo: string
        }
        Insert: {
          created_at?: string
          empresa_id: string
          id?: string
          lido?: boolean
          mensagem?: string | null
          ref_id?: string | null
          ref_tabela?: string | null
          severidade?: string
          tipo: string
          titulo: string
        }
        Update: {
          created_at?: string
          empresa_id?: string
          id?: string
          lido?: boolean
          mensagem?: string | null
          ref_id?: string | null
          ref_tabela?: string | null
          severidade?: string
          tipo?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "alertas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      categorias_financeiras: {
        Row: {
          cor: string | null
          created_at: string
          empresa_id: string
          id: string
          nome: string
          tipo: Database["public"]["Enums"]["lancamento_tipo"]
        }
        Insert: {
          cor?: string | null
          created_at?: string
          empresa_id: string
          id?: string
          nome: string
          tipo: Database["public"]["Enums"]["lancamento_tipo"]
        }
        Update: {
          cor?: string | null
          created_at?: string
          empresa_id?: string
          id?: string
          nome?: string
          tipo?: Database["public"]["Enums"]["lancamento_tipo"]
        }
        Relationships: [
          {
            foreignKeyName: "categorias_financeiras_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      condicoes_pagamento: {
        Row: {
          ativo: boolean
          created_at: string
          empresa_id: string
          entrada: boolean
          id: string
          intervalo_dias: number
          nome: string
          parcelas: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          empresa_id: string
          entrada?: boolean
          id?: string
          intervalo_dias?: number
          nome: string
          parcelas?: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          empresa_id?: string
          entrada?: boolean
          id?: string
          intervalo_dias?: number
          nome?: string
          parcelas?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "condicoes_pagamento_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      contas_bancarias: {
        Row: {
          agencia: string | null
          ativo: boolean
          banco: string | null
          cartao_bandeira: string | null
          cartao_conta_pagamento_id: string | null
          cartao_dia_fechamento: number | null
          cartao_dia_vencimento: number | null
          cartao_emissor: string | null
          cartao_ultimos4: string | null
          conta: string | null
          conta_vinculada_id: string | null
          created_at: string
          empresa_id: string
          id: string
          modalidade: string | null
          nome: string | null
          padrao: boolean
          saldo_atual: number
          saldo_inicial: number
          tipo: Database["public"]["Enums"]["conta_financeira_tipo"]
          updated_at: string
        }
        Insert: {
          agencia?: string | null
          ativo?: boolean
          banco?: string | null
          cartao_bandeira?: string | null
          cartao_conta_pagamento_id?: string | null
          cartao_dia_fechamento?: number | null
          cartao_dia_vencimento?: number | null
          cartao_emissor?: string | null
          cartao_ultimos4?: string | null
          conta?: string | null
          conta_vinculada_id?: string | null
          created_at?: string
          empresa_id: string
          id?: string
          modalidade?: string | null
          nome?: string | null
          padrao?: boolean
          saldo_atual?: number
          saldo_inicial?: number
          tipo?: Database["public"]["Enums"]["conta_financeira_tipo"]
          updated_at?: string
        }
        Update: {
          agencia?: string | null
          ativo?: boolean
          banco?: string | null
          cartao_bandeira?: string | null
          cartao_conta_pagamento_id?: string | null
          cartao_dia_fechamento?: number | null
          cartao_dia_vencimento?: number | null
          cartao_emissor?: string | null
          cartao_ultimos4?: string | null
          conta?: string | null
          conta_vinculada_id?: string | null
          created_at?: string
          empresa_id?: string
          id?: string
          modalidade?: string | null
          nome?: string | null
          padrao?: boolean
          saldo_atual?: number
          saldo_inicial?: number
          tipo?: Database["public"]["Enums"]["conta_financeira_tipo"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contas_bancarias_cartao_conta_pagamento_id_fkey"
            columns: ["cartao_conta_pagamento_id"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_bancarias_conta_vinculada_id_fkey"
            columns: ["conta_vinculada_id"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_bancarias_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      contatos: {
        Row: {
          ativo: boolean
          bairro: string | null
          cep: string | null
          cidade: string | null
          complemento: string | null
          created_at: string
          documento: string | null
          email: string | null
          empresa_id: string
          id: string
          logradouro: string | null
          nome: string
          numero: string | null
          observacoes: string | null
          telefone: string | null
          tipo: Database["public"]["Enums"]["contato_tipo"]
          uf: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          created_at?: string
          documento?: string | null
          email?: string | null
          empresa_id: string
          id?: string
          logradouro?: string | null
          nome: string
          numero?: string | null
          observacoes?: string | null
          telefone?: string | null
          tipo?: Database["public"]["Enums"]["contato_tipo"]
          uf?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          created_at?: string
          documento?: string | null
          email?: string | null
          empresa_id?: string
          id?: string
          logradouro?: string | null
          nome?: string
          numero?: string | null
          observacoes?: string | null
          telefone?: string | null
          tipo?: Database["public"]["Enums"]["contato_tipo"]
          uf?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contatos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      depositos: {
        Row: {
          ativo: boolean
          created_at: string
          empresa_id: string
          id: string
          nome: string
          padrao: boolean
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          empresa_id: string
          id?: string
          nome: string
          padrao?: boolean
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          empresa_id?: string
          id?: string
          nome?: string
          padrao?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "depositos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      empresa_users: {
        Row: {
          created_at: string
          empresa_id: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          empresa_id: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          empresa_id?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "empresa_users_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas: {
        Row: {
          bairro: string | null
          cep: string | null
          cidade: string | null
          cnpj: string | null
          complemento: string | null
          created_at: string
          created_by: string
          email: string | null
          id: string
          ie: string | null
          logradouro: string | null
          nome_fantasia: string
          numero: string | null
          razao_social: string | null
          regime_tributario: string | null
          telefone: string | null
          uf: string | null
          updated_at: string
        }
        Insert: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          complemento?: string | null
          created_at?: string
          created_by: string
          email?: string | null
          id?: string
          ie?: string | null
          logradouro?: string | null
          nome_fantasia: string
          numero?: string | null
          razao_social?: string | null
          regime_tributario?: string | null
          telefone?: string | null
          uf?: string | null
          updated_at?: string
        }
        Update: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          complemento?: string | null
          created_at?: string
          created_by?: string
          email?: string | null
          id?: string
          ie?: string | null
          logradouro?: string | null
          nome_fantasia?: string
          numero?: string | null
          razao_social?: string | null
          regime_tributario?: string | null
          telefone?: string | null
          uf?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      lancamentos_financeiros: {
        Row: {
          categoria_id: string | null
          conta_bancaria_id: string | null
          contato_id: string | null
          created_at: string
          data_emissao: string
          data_pagamento: string | null
          data_vencimento: string
          descricao: string
          documento: string | null
          empresa_id: string
          id: string
          observacoes: string | null
          status: Database["public"]["Enums"]["lancamento_status"]
          tipo: Database["public"]["Enums"]["lancamento_tipo"]
          updated_at: string
          valor: number
          valor_pago: number
        }
        Insert: {
          categoria_id?: string | null
          conta_bancaria_id?: string | null
          contato_id?: string | null
          created_at?: string
          data_emissao?: string
          data_pagamento?: string | null
          data_vencimento: string
          descricao: string
          documento?: string | null
          empresa_id: string
          id?: string
          observacoes?: string | null
          status?: Database["public"]["Enums"]["lancamento_status"]
          tipo: Database["public"]["Enums"]["lancamento_tipo"]
          updated_at?: string
          valor: number
          valor_pago?: number
        }
        Update: {
          categoria_id?: string | null
          conta_bancaria_id?: string | null
          contato_id?: string | null
          created_at?: string
          data_emissao?: string
          data_pagamento?: string | null
          data_vencimento?: string
          descricao?: string
          documento?: string | null
          empresa_id?: string
          id?: string
          observacoes?: string | null
          status?: Database["public"]["Enums"]["lancamento_status"]
          tipo?: Database["public"]["Enums"]["lancamento_tipo"]
          updated_at?: string
          valor?: number
          valor_pago?: number
        }
        Relationships: [
          {
            foreignKeyName: "lancamentos_financeiros_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_financeiras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_financeiros_conta_bancaria_id_fkey"
            columns: ["conta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_financeiros_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_financeiros_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      movimentacoes_estoque: {
        Row: {
          created_at: string
          created_by: string | null
          custo_unitario: number | null
          data: string
          deposito_id: string | null
          empresa_id: string
          id: string
          observacoes: string | null
          produto_id: string
          quantidade: number
          tipo: Database["public"]["Enums"]["estoque_movimento"]
          venda_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          custo_unitario?: number | null
          data?: string
          deposito_id?: string | null
          empresa_id: string
          id?: string
          observacoes?: string | null
          produto_id: string
          quantidade: number
          tipo: Database["public"]["Enums"]["estoque_movimento"]
          venda_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          custo_unitario?: number | null
          data?: string
          deposito_id?: string | null
          empresa_id?: string
          id?: string
          observacoes?: string | null
          produto_id?: string
          quantidade?: number
          tipo?: Database["public"]["Enums"]["estoque_movimento"]
          venda_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimentacoes_estoque_deposito_id_fkey"
            columns: ["deposito_id"]
            isOneToOne: false
            referencedRelation: "depositos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_estoque_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_estoque_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_estoque_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      nfe_config: {
        Row: {
          ambiente: string
          cnae: string | null
          created_at: string
          empresa_id: string
          id: string
          natureza_operacao: string | null
          proximo_numero: number
          regime_tributario: string
          serie: number
          updated_at: string
        }
        Insert: {
          ambiente?: string
          cnae?: string | null
          created_at?: string
          empresa_id: string
          id?: string
          natureza_operacao?: string | null
          proximo_numero?: number
          regime_tributario?: string
          serie?: number
          updated_at?: string
        }
        Update: {
          ambiente?: string
          cnae?: string | null
          created_at?: string
          empresa_id?: string
          id?: string
          natureza_operacao?: string | null
          proximo_numero?: number
          regime_tributario?: string
          serie?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nfe_config_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: true
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      notas_fiscais: {
        Row: {
          chave: string | null
          contato_id: string | null
          created_at: string
          data_emissao: string | null
          empresa_id: string
          id: string
          mensagem: string | null
          numero: string | null
          pdf_url: string | null
          serie: string | null
          status: Database["public"]["Enums"]["nf_status"]
          tipo: Database["public"]["Enums"]["nf_tipo"]
          updated_at: string
          valor_total: number | null
          venda_id: string | null
          xml_url: string | null
        }
        Insert: {
          chave?: string | null
          contato_id?: string | null
          created_at?: string
          data_emissao?: string | null
          empresa_id: string
          id?: string
          mensagem?: string | null
          numero?: string | null
          pdf_url?: string | null
          serie?: string | null
          status?: Database["public"]["Enums"]["nf_status"]
          tipo?: Database["public"]["Enums"]["nf_tipo"]
          updated_at?: string
          valor_total?: number | null
          venda_id?: string | null
          xml_url?: string | null
        }
        Update: {
          chave?: string | null
          contato_id?: string | null
          created_at?: string
          data_emissao?: string | null
          empresa_id?: string
          id?: string
          mensagem?: string | null
          numero?: string | null
          pdf_url?: string | null
          serie?: string | null
          status?: Database["public"]["Enums"]["nf_status"]
          tipo?: Database["public"]["Enums"]["nf_tipo"]
          updated_at?: string
          valor_total?: number | null
          venda_id?: string | null
          xml_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notas_fiscais_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_fiscais_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_fiscais_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      ofx_transacoes: {
        Row: {
          conta_bancaria_id: string
          created_at: string
          data_transacao: string
          empresa_id: string
          fitid: string
          id: string
          lancamento_id: string | null
          memo: string | null
          status: string
          tipo: string
          updated_at: string
          valor: number
        }
        Insert: {
          conta_bancaria_id: string
          created_at?: string
          data_transacao: string
          empresa_id: string
          fitid: string
          id?: string
          lancamento_id?: string | null
          memo?: string | null
          status?: string
          tipo: string
          updated_at?: string
          valor: number
        }
        Update: {
          conta_bancaria_id?: string
          created_at?: string
          data_transacao?: string
          empresa_id?: string
          fitid?: string
          id?: string
          lancamento_id?: string | null
          memo?: string | null
          status?: string
          tipo?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "ofx_transacoes_conta_bancaria_id_fkey"
            columns: ["conta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ofx_transacoes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ofx_transacoes_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "lancamentos_financeiros"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos: {
        Row: {
          ativo: boolean
          cfop: string | null
          codigo: string | null
          created_at: string
          descricao: string | null
          empresa_id: string
          estoque_atual: number | null
          estoque_minimo: number | null
          id: string
          ncm: string | null
          nome: string
          preco_custo: number | null
          preco_venda: number | null
          unidade: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cfop?: string | null
          codigo?: string | null
          created_at?: string
          descricao?: string | null
          empresa_id: string
          estoque_atual?: number | null
          estoque_minimo?: number | null
          id?: string
          ncm?: string | null
          nome: string
          preco_custo?: number | null
          preco_venda?: number | null
          unidade?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cfop?: string | null
          codigo?: string | null
          created_at?: string
          descricao?: string | null
          empresa_id?: string
          estoque_atual?: number | null
          estoque_minimo?: number | null
          id?: string
          ncm?: string | null
          nome?: string
          preco_custo?: number | null
          preco_venda?: number | null
          unidade?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "produtos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          id: string
          nome: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id: string
          nome?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id?: string
          nome?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      venda_itens: {
        Row: {
          created_at: string
          desconto: number
          desconto_pct: number
          descricao: string
          id: string
          preco_unitario: number
          produto_id: string | null
          quantidade: number
          total: number
          venda_id: string
        }
        Insert: {
          created_at?: string
          desconto?: number
          desconto_pct?: number
          descricao: string
          id?: string
          preco_unitario?: number
          produto_id?: string | null
          quantidade?: number
          total?: number
          venda_id: string
        }
        Update: {
          created_at?: string
          desconto?: number
          desconto_pct?: number
          descricao?: string
          id?: string
          preco_unitario?: number
          produto_id?: string | null
          quantidade?: number
          total?: number
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venda_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venda_itens_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      vendas: {
        Row: {
          cliente_id: string | null
          condicao_pagamento_id: string | null
          created_at: string
          data: string
          data_validade: string | null
          desconto: number
          empresa_id: string
          frete: number
          id: string
          numero: number
          observacoes: string | null
          status: Database["public"]["Enums"]["venda_status"]
          subtotal: number
          total: number
          updated_at: string
          vendedor_id: string | null
        }
        Insert: {
          cliente_id?: string | null
          condicao_pagamento_id?: string | null
          created_at?: string
          data?: string
          data_validade?: string | null
          desconto?: number
          empresa_id: string
          frete?: number
          id?: string
          numero?: number
          observacoes?: string | null
          status?: Database["public"]["Enums"]["venda_status"]
          subtotal?: number
          total?: number
          updated_at?: string
          vendedor_id?: string | null
        }
        Update: {
          cliente_id?: string | null
          condicao_pagamento_id?: string | null
          created_at?: string
          data?: string
          data_validade?: string | null
          desconto?: number
          empresa_id?: string
          frete?: number
          id?: string
          numero?: number
          observacoes?: string | null
          status?: Database["public"]["Enums"]["venda_status"]
          subtotal?: number
          total?: number
          updated_at?: string
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_condicao_pagamento_id_fkey"
            columns: ["condicao_pagamento_id"]
            isOneToOne: false
            referencedRelation: "condicoes_pagamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cancelar_nota_fiscal: {
        Args: { _motivo: string; _nf_id: string }
        Returns: {
          chave: string | null
          contato_id: string | null
          created_at: string
          data_emissao: string | null
          empresa_id: string
          id: string
          mensagem: string | null
          numero: string | null
          pdf_url: string | null
          serie: string | null
          status: Database["public"]["Enums"]["nf_status"]
          tipo: Database["public"]["Enums"]["nf_tipo"]
          updated_at: string
          valor_total: number | null
          venda_id: string | null
          xml_url: string | null
        }
        SetofOptions: {
          from: "*"
          to: "notas_fiscais"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      emitir_nota_fiscal: {
        Args: { _nf_id: string }
        Returns: {
          chave: string | null
          contato_id: string | null
          created_at: string
          data_emissao: string | null
          empresa_id: string
          id: string
          mensagem: string | null
          numero: string | null
          pdf_url: string | null
          serie: string | null
          status: Database["public"]["Enums"]["nf_status"]
          tipo: Database["public"]["Enums"]["nf_tipo"]
          updated_at: string
          valor_total: number | null
          venda_id: string | null
          xml_url: string | null
        }
        SetofOptions: {
          from: "*"
          to: "notas_fiscais"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      has_empresa_role: {
        Args: {
          _empresa: string
          _roles: Database["public"]["Enums"]["app_role"][]
          _user: string
        }
        Returns: boolean
      }
      is_empresa_member: {
        Args: { _empresa: string; _user: string }
        Returns: boolean
      }
      recalc_saldo_conta: { Args: { _conta_id: string }; Returns: undefined }
    }
    Enums: {
      app_role:
        | "owner"
        | "admin"
        | "financeiro"
        | "vendas"
        | "estoque"
        | "fiscal"
        | "viewer"
      conta_financeira_tipo:
        | "corrente"
        | "caixa"
        | "cartao_credito"
        | "investimento"
        | "poupanca"
        | "aplicacao_automatica"
        | "outras"
      contato_tipo: "cliente" | "fornecedor" | "ambos" | "transportadora"
      estoque_movimento: "entrada" | "saida" | "ajuste" | "transferencia"
      lancamento_status: "aberto" | "pago" | "parcial" | "vencido" | "cancelado"
      lancamento_tipo: "receber" | "pagar"
      nf_status:
        | "rascunho"
        | "emitida"
        | "autorizada"
        | "cancelada"
        | "rejeitada"
      nf_tipo: "nfe" | "nfse" | "nfce"
      venda_status:
        | "rascunho"
        | "proposta"
        | "pedido"
        | "faturado"
        | "cancelado"
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
      app_role: [
        "owner",
        "admin",
        "financeiro",
        "vendas",
        "estoque",
        "fiscal",
        "viewer",
      ],
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
      estoque_movimento: ["entrada", "saida", "ajuste", "transferencia"],
      lancamento_status: ["aberto", "pago", "parcial", "vencido", "cancelado"],
      lancamento_tipo: ["receber", "pagar"],
      nf_status: [
        "rascunho",
        "emitida",
        "autorizada",
        "cancelada",
        "rejeitada",
      ],
      nf_tipo: ["nfe", "nfse", "nfce"],
      venda_status: ["rascunho", "proposta", "pedido", "faturado", "cancelado"],
    },
  },
} as const
