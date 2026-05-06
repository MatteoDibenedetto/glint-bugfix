import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'glint. | Bug Fix Portal',
  description: 'Gestisci e risolvi i fix del tuo store Shopify con il team Glint.',
  icons: { icon: '/favicon.svg' },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="it" className="h-full">
      <body className="h-full bg-glint-green text-white font-sans antialiased">
        {children}
      </body>
    </html>
  )
}
