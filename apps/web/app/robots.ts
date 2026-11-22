import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/site';

/** Public pages are indexable; the signed-in app, invites and the API are not. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/entrar', '/criar-conta'],
        disallow: ['/api/', '/inicio', '/grupos', '/g/', '/notificacoes', '/perfil', '/assinatura', '/admin', '/convite/', '/redefinir-senha', '/esqueci-senha'],
      },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
