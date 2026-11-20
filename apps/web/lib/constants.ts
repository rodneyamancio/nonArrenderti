import type { PixKeyType } from '@tenace/types';

export const PIX_TYPES: { value: PixKeyType; label: string }[] = [
  { value: 'phone', label: 'Celular' },
  { value: 'email', label: 'E-mail' },
  { value: 'cpf', label: 'CPF' },
  { value: 'cnpj', label: 'CNPJ' },
  { value: 'random', label: 'Chave aleatória' },
];

export const TIMEZONES = [
  { value: 'America/Sao_Paulo', label: 'Brasília (BRT)' },
  { value: 'America/Manaus', label: 'Manaus (AMT)' },
  { value: 'America/Cuiaba', label: 'Cuiabá (AMT)' },
  { value: 'America/Rio_Branco', label: 'Rio Branco (ACT)' },
  { value: 'America/Noronha', label: 'Fernando de Noronha' },
  { value: 'Europe/Lisbon', label: 'Lisboa' },
  { value: 'Europe/Rome', label: 'Roma' },
  { value: 'America/New_York', label: 'Nova York' },
];
