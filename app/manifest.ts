import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Cyber Assurance Checklist',
    short_name: 'Cyber Assurance',
    description: 'Cybersecurity baseline 50-control assurance checklist with scoring, action tracking and reporting',
    start_url: '/',
    display: 'standalone',
    background_color: '#0c1222',
    theme_color: '#14b8a6',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
