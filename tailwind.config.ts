import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand palette — cream ground, charcoal ink, muted gold accent.
        cream: '#FBF8F3',
        parchment: '#F4EFE6',
        charcoal: '#2B2A28',
        ink: '#4A4844',
        muted: '#8C877E',
        gold: {
          DEFAULT: '#B08D57',
          soft: '#C9AE83',
          wash: '#F2E9DA',
        },
        line: '#E5DDD0',

        // Urgency scale — used identically on every screen.
        overdue: { DEFAULT: '#B3261E', wash: '#FBEAE8' },
        today: { DEFAULT: '#B26B00', wash: '#FDF1E0' },
        missed: { DEFAULT: '#8A6D00', wash: '#FBF4DA' },
        upcoming: { DEFAULT: '#2A5C8A', wash: '#E8F0F7' },
        done: { DEFAULT: '#2E6B45', wash: '#E7F2EB' },
      },
      fontFamily: {
        serif: ['var(--font-serif)', 'Cormorant Garamond', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', 'Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        lg: '0.625rem',
        md: '0.5rem',
        sm: '0.375rem',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}

export default config
