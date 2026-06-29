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
        // — shadcn/ui (zinc dark) — mapeado a las CSS vars de src/input.css —
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: 'hsl(var(--card))',
        popover: 'hsl(var(--popover))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        // — Aliases command-center (compat con markup existente) → repuntados a las vars —
        ground:  'var(--ground)',
        panel:   'var(--panel)',
        'panel-2': 'var(--panel-2)',
        'panel-3': 'var(--panel-3)',
        ink:     'var(--ink)',
        'ink-2': 'var(--ink-2)',
        muted:   'var(--muted)',
        'muted-foreground': 'hsl(var(--muted-foreground))',
        faint:   'var(--faint)',
        steel:   { DEFAULT: 'var(--steel)', bright: 'var(--steel-bright)', soft: 'var(--steel-soft)' },
        hairline: 'var(--hairline)',
      },
      fontFamily: {
        sans: ['Geist', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['Geist Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        hdv: 'var(--radius)',
        'hdv-sharp': 'var(--hdv-radius-sm)',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        'hdv-card': '0 1px 0 rgba(255,255,255,0.03) inset, 0 1px 2px rgba(0,0,0,0.4)',
        'hdv-elevated': '0 12px 32px -16px rgba(0,0,0,0.75)',
      },
    },
  },
  plugins: [],
}
