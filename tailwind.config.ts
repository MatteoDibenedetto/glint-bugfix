import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        glint: {
          green: '#0C1E1A',
          orange: '#FD3B01',
          yellow: '#DCFF33',
          grey: '#D6D3C9',
        },
      },
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
