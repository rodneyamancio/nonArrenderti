/** Public identity of the site for SEO (canonical URLs, Open Graph, JSON-LD). */
export const SITE = {
  url: (process.env.NEXT_PUBLIC_SITE_URL || 'https://tenace.amancio.family').replace(/\/+$/, ''),
  name: 'Tenace',
  tagline: 'non arrenderti',
  title: 'Tenace — metas semanais em grupo, com cota em dinheiro',
  description:
    'Crie um grupo com amigos, defina metas semanais (ler, treinar, correr) e um valor por cota. Cada atividade cumprida paga a cota; o que faltar vai para o caixa do grupo. Grátis para começar.',
  keywords: ['metas semanais', 'hábitos em grupo', 'desafio de hábitos', 'accountability', 'compromisso com dinheiro', 'leitura diária', 'academia', 'metas com amigos', 'aplicativo de hábitos', 'non arrenderti'],
  locale: 'pt_BR',
} as const;

export const FAQ: { q: string; a: string }[] = [
  { q: 'Como funciona o Tenace?', a: 'Você cria um grupo, define metas semanais e um valor por cota (por exemplo, R$ 5). Toda segunda a semana começa no negativo, com a soma das cotas. Cada atividade cumprida paga uma cota; se cumprir tudo, a semana fecha no zero. O que faltar vira multa para o caixa do grupo.' },
  { q: 'O Tenace cobra ou movimenta o dinheiro das multas?', a: 'Não. O Tenace só registra quem deve quanto. As multas são pagas por PIX diretamente para o destino que o grupo escolheu (uma caixinha, uma doação, a conta de alguém), com QR Code e copia-e-cola gerados no app.' },
  { q: 'Que tipo de meta dá para criar?', a: 'Metas diárias ou semanais, em vezes, páginas, minutos, horas, quilômetros ou qualquer unidade: ler 10 páginas por dia, academia 3 vezes por semana, correr 15 km na semana. Cada meta vira cotas com o valor que o grupo definir.' },
  { q: 'Como o grupo sabe que a pessoa cumpriu a meta?', a: 'Cada registro pode ter foto e comentário e aparece no feed do grupo, com reações. Qualquer membro pode contestar um registro, e os admins decidem se ele vale.' },
  { q: 'Posso participar de vários grupos?', a: 'Sim. Uma pessoa pode estar em vários grupos ao mesmo tempo, cada um com suas metas, seu caixa e sua turma.' },
  { q: 'O Tenace é grátis?', a: 'Sim, dá para começar grátis com um grupo. Planos pagos liberam mais grupos e grupos maiores.' },
  { q: 'Tem aplicativo para celular?', a: 'O Tenace funciona no navegador do celular e do computador, e tem aplicativo para iPhone e Android.' },
];
