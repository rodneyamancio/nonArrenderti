// Carregado com --import antes dos testes: ensina o node a achar os módulos do app pelo mesmo caminho que o Metro
// usa (import './x' → x.ts, '@/lib/x' → src/lib/x.ts). O node já tira os tipos (--experimental-strip-types), mas
// só carrega arquivo .ts PURO: nada de React Native, JSX, enum ou namespace (o tsconfig acusa com erasableSyntaxOnly).
import { register } from 'node:module';
register('./resolve.mjs', import.meta.url);
