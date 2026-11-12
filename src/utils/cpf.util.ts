/**
 * Validador e formatador de CPF com algoritmo oficial dos dígitos verificadores
 */
export function validarCpf(cpf: string): boolean {
  const limpo = cpf.replace(/\D/g, '');

  if (limpo.length !== 11) return false;

  // Rejeita sequências repetidas como 11111111111, 22222222222, etc.
  if (/^(\d)\1{10}$/.test(limpo)) return false;

  let soma = 0;
  for (let i = 0; i < 9; i++) {
    soma += parseInt(limpo.charAt(i), 10) * (10 - i);
  }
  let resto = 11 - (soma % 11);
  let dv1 = resto >= 10 ? 0 : resto;
  if (dv1 !== parseInt(limpo.charAt(9), 10)) return false;

  soma = 0;
  for (let i = 0; i < 10; i++) {
    soma += parseInt(limpo.charAt(i), 10) * (11 - i);
  }
  resto = 11 - (soma % 11);
  let dv2 = resto >= 10 ? 0 : resto;
  if (dv2 !== parseInt(limpo.charAt(10), 10)) return false;

  return true;
}

export function limparCpf(cpf: string): string {
  return cpf.replace(/\D/g, '');
}

export function mascararCpf(cpf: string): string {
  const limpo = limparCpf(cpf);
  if (limpo.length !== 11) return cpf;
  return `***.${limpo.slice(3, 6)}.${limpo.slice(6, 9)}-**`;
}
