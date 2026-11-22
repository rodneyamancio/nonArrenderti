import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: `${SITE.url}/`, lastModified, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE.url}/criar-conta`, lastModified, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE.url}/entrar`, lastModified, changeFrequency: 'monthly', priority: 0.5 },
  ];
}
