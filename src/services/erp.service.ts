import { Morador, Boleto, Ocorrencia, Comunicado } from '../types/index.js';

export interface IErpService {
  buscarMoradorPorCpf(cpf: string): Promise<Morador | null>;
  listarBoletosEmAberto(unidadeId: string): Promise<Boleto[]>;
  gerarSegundaVia(boletoId: string): Promise<Boleto | null>;
  registrarOcorrencia(moradorId: string, categoria: string, descricao: string): Promise<Ocorrencia>;
  listarComunicados(condominioNome?: string): Promise<Comunicado[]>;
}
