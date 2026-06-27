/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './*.html',
    './*.js',
    './js/**/*.js',
    './services/**/*.js'
  ],
  theme: {
    extend: {
      colors: {
        grafito: { DEFAULT: '#1f2937', oscuro: '#111827', claro: '#374151' },
        // — Command center (acero + warm-black) —
        ground:  '#0E0F11',
        panel:   '#15171B',
        'panel-2': '#191C21',
        'panel-3': '#22262c',
        ink:     '#E9E7E1',
        'ink-2': '#BFC4CC',
        muted:   '#8A8F98',
        faint:   '#5A6068',
        steel:   { DEFAULT: '#3D5A78', bright: '#5681AE', soft: 'rgba(61,90,120,0.18)' },
        hairline: 'rgba(255,255,255,0.09)',
      },
      fontFamily: {
        sans: ['IBM Plex Sans', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        hdv: '0.75rem',
        'hdv-sharp': '2px',
      },
      boxShadow: {
        'hdv-card': '0 1px 0 rgba(255,255,255,0.03) inset, 0 1px 2px rgba(0,0,0,0.4)',
        'hdv-elevated': '0 12px 32px -16px rgba(0,0,0,0.75)',
      },
    },
  },
  plugins: [],
}
