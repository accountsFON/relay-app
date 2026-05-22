import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Poppins } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Relay',
  description: 'A marketing tool for people who ship.',
}

export default function RootLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <ClerkProvider>
      <html lang="en" className={poppins.variable}>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  )
}
