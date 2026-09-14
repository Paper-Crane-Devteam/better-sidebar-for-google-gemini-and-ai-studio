/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "rgb(var(--border) / <alpha-value>)",
        input: "rgb(var(--input) / <alpha-value>)",
        ring: "rgb(var(--ring) / <alpha-value>)",
        background: "rgb(var(--background) / <alpha-value>)",
        foreground: "rgb(var(--foreground) / <alpha-value>)",
        primary: {
          DEFAULT: "rgb(var(--primary) / <alpha-value>)",
          foreground: "rgb(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "rgb(var(--secondary) / <alpha-value>)",
          foreground: "rgb(var(--secondary-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "rgb(var(--destructive) / <alpha-value>)",
          foreground: "rgb(var(--destructive-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "rgb(var(--muted) / <alpha-value>)",
          foreground: "rgb(var(--muted-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          foreground: "rgb(var(--accent-foreground) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "rgb(var(--popover) / <alpha-value>)",
          foreground: "rgb(var(--popover-foreground) / <alpha-value>)",
        },
        card: {
          DEFAULT: "rgb(var(--card) / <alpha-value>)",
          foreground: "rgb(var(--card-foreground) / <alpha-value>)",
        },
        'sidebar-icon': "rgb(var(--sidebar-icon-color) / <alpha-value>)",
        highlight: {
          DEFAULT: "rgb(var(--highlight) / <alpha-value>)",
          foreground: "rgb(var(--highlight-foreground) / <alpha-value>)",
        },
        success: {
          DEFAULT: "rgb(var(--success) / <alpha-value>)",
          foreground: "rgb(var(--success-foreground) / <alpha-value>)",
        },
        warning: {
          DEFAULT: "rgb(var(--warning) / <alpha-value>)",
          foreground: "rgb(var(--warning-foreground) / <alpha-value>)",
        },
      },
      fontFamily: {
        // Only `mono` is overridden. `font-sans` is intentionally left on
        // Tailwind's default: the sidebar body font comes from
        // `html { font-family: var(--font-sans) }` in _common.scss and is
        // inherited, so redefining it here would add nothing.
        mono: [
          "var(--font-mono, ui-monospace)",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "Liberation Mono",
          "monospace",
        ],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      height: {
        'density-row': 'var(--density-row-height)',
      },
      spacing: {
        'density-x': 'var(--density-padding-x)',
        'density-y': 'var(--density-padding-y)',
        'density-gap': 'var(--density-gap)',
        /* 8px Grid Spacing Tokens */
        'grid-0.5': '4px',   /* micro: icon-text gap */
        'grid-1': '8px',     /* base unit */
        'grid-1.5': '12px',  /* compact: toolbar padding */
        'grid-2': '16px',    /* standard: section padding */
        'grid-2.5': '20px',  /* comfortable */
        'grid-3': '24px',    /* generous: dialog padding */
        'grid-4': '32px',    /* large */
        'grid-5': '40px',    /* extra */
        'grid-6': '48px',    /* max */
      },
      fontSize: {
        'density': 'var(--density-font-size)',
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"),
    require("@tailwindcss/typography"),
  ],
}
