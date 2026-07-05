/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#0a0a0c',
        ink: '#f4f1ea',
        'ink-soft': '#b6b3aa',
        line: 'rgba(255,255,255,0.09)',
        construction: '#c9a96e',
        release: '#8FBF8B',
        restriction: '#E0605A',
        warning: '#D9A45B',
        info: '#8FB4D9',
        white: '#16161a',
      },
      fontFamily: {
        display: ['"Instrument Serif"', 'Georgia', 'serif'],
        sans: ['Manrope', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}
