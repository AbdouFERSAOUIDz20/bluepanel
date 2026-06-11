import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#020617',
        surface: '#11131b',
        'surface-dim': '#0c0e16',
        'surface-container': '#1d1f27',
        'surface-container-high': '#282a32',
        'surface-container-highest': '#32343d',
        primary: '#b4c5ff',
        'primary-container': '#2563eb',
        secondary: '#a4c9ff',
        tertiary: '#ffb596',
        outline: '#8d90a0',
        'on-surface': '#e1e2ed',
        'on-surface-variant': '#c3c6d7'
      },
      fontFamily: {
        sans: ['Geist', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace']
      },
      boxShadow: {
        glow: '0 0 20px rgba(37, 99, 235, 0.15)',
        insetTerminal: 'inset 0 2px 10px rgba(0, 0, 0, 0.5)'
      },
      borderRadius: {
        xl: '1rem'
      }
    }
  },
  plugins: []
};

export default config;
