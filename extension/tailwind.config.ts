import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./entrypoints/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // --- Primary surface & text ---
        surface: {
          50: "var(--rf-surface-50)",   // lightest cream
          100: "var(--rf-surface-100)",
          200: "var(--rf-surface-200)",
          300: "var(--rf-surface-300)",
          400: "var(--rf-surface-400)",
          500: "var(--rf-surface-500)",  // mid warm gray
          600: "var(--rf-surface-600)",
          700: "var(--rf-surface-700)",
          800: "var(--rf-surface-800)",
          900: "var(--rf-surface-900)",  // deepest charcoal
        },
        // --- Accent: warm amber/gold ---
        accent: {
          50: "var(--rf-accent-50)",
          100: "var(--rf-accent-100)",
          200: "var(--rf-accent-200)",
          300: "var(--rf-accent-300)",
          400: "var(--rf-accent-400)",
          500: "var(--rf-accent-500)",   // primary accent
          600: "var(--rf-accent-600)",
          700: "var(--rf-accent-700)",
        },
        // --- Semantic ---
        success: {
          50: "var(--rf-success-50)",
          500: "var(--rf-success-500)",
          700: "var(--rf-success-700)",
        },
        error: {
          50: "var(--rf-error-50)",
          500: "var(--rf-error-500)",
          700: "var(--rf-error-700)",
        },
        warning: {
          50: "var(--rf-warning-50)",
          500: "var(--rf-warning-500)",
          700: "var(--rf-warning-700)",
        },
      },

      fontFamily: {
        display: ["'Instrument Serif'", "Georgia", "serif"],
        body: ["'DM Sans'", "system-ui", "sans-serif"],
      },

      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.875rem" }],   // 10px
        xs: ["0.75rem", { lineHeight: "1rem" }],            // 12px
        sm: ["0.8125rem", { lineHeight: "1.25rem" }],       // 13px
        base: ["0.875rem", { lineHeight: "1.375rem" }],     // 14px — overlay default
        md: ["1rem", { lineHeight: "1.5rem" }],             // 16px
        lg: ["1.125rem", { lineHeight: "1.625rem" }],       // 18px
        xl: ["1.375rem", { lineHeight: "1.75rem" }],        // 22px
        "2xl": ["1.75rem", { lineHeight: "2.125rem" }],     // 28px
        "3xl": ["2.25rem", { lineHeight: "2.5rem" }],       // 36px
      },

      spacing: {
        0.5: "2px",
        1: "4px",
        1.5: "6px",
        2: "8px",
        2.5: "10px",
        3: "12px",
        4: "16px",
        5: "20px",
        6: "24px",
        8: "32px",
        10: "40px",
        12: "48px",
        16: "64px",
      },

      borderRadius: {
        sm: "var(--rf-radius-sm)",
        DEFAULT: "var(--rf-radius-md)",
        md: "var(--rf-radius-md)",
        lg: "var(--rf-radius-lg)",
        xl: "var(--rf-radius-xl)",
        full: "9999px",
      },

      boxShadow: {
        "overlay": "var(--rf-shadow-overlay)",
        "card": "var(--rf-shadow-card)",
        "button": "var(--rf-shadow-button)",
        "glow": "var(--rf-shadow-glow)",
      },

      backdropBlur: {
        overlay: "20px",
      },

      animation: {
        "fade-in": "rf-fade-in 0.3s ease-out",
        "slide-up": "rf-slide-up 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-down": "rf-slide-down 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        "scale-in": "rf-scale-in 0.2s ease-out",
        "pulse-soft": "rf-pulse-soft 2s ease-in-out infinite",
        "progress": "rf-progress 1.5s ease-in-out infinite",
      },

      keyframes: {
        "rf-fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "rf-slide-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "rf-slide-down": {
          from: { opacity: "0", transform: "translateY(-8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "rf-scale-in": {
          from: { opacity: "0", transform: "scale(0.95)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "rf-pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
        "rf-progress": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(250%)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
