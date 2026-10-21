import type { Config } from "tailwindcss";

import { pswColors, pswRadii, pswShadows, pswTypeScale } from "./design/psw/theme";

const { primarySemantic, ...pswSemanticColors } = pswColors;

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        // shadcn/ui variables, set to the psw values in app/globals.css.
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          ...primarySemantic
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))"
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))"
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))"
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))"
        },
        trust: {
          navy: pswColors.ink.DEFAULT,
          blue: pswColors.primarySemantic.text,
          sky: pswColors.purple["500"],
          verified: pswColors.success.text,
          amber: pswColors.warning.text,
          red: pswColors.danger.text,
          slate: pswColors.ink.secondary
        },
        // psw design system (design/psw/tokens.json): semantic colours named as in the design system.
        // `accent` is psw 青柠 and only belongs on ink-block or primary.
        ...pswSemanticColors
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "\"PingFang SC\"", "\"Hiragino Sans GB\"", "\"Microsoft YaHei\"", "\"Noto Sans SC\"", "\"Segoe UI\"", "sans-serif"],
        // 资源圆体 Bold: titles and buttons in the app.
        rounded: ["var(--font-rounded)", "\"PingFang SC\"", "\"Microsoft YaHei\"", "sans-serif"],
        // 资源圆体 Heavy: covers and big slogans only.
        slogan: ["var(--font-slogan)", "var(--font-rounded)", "\"PingFang SC\"", "sans-serif"],
        // Nunito: prices, dates and other numbers.
        num: ["var(--font-num)", "var(--font-rounded)", "\"PingFang SC\"", "sans-serif"]
      },
      // psw type scale: text-d-large-title, text-d-title, text-d-subhead, text-m-body, text-m-footnote …
      fontSize: pswTypeScale,
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        // psw radii: 全圆 (rounded-full) = 能点; 小圆角 (rounded-psw-sm) = 只是标注
        ...pswRadii
      },
      boxShadow: {
        // psw: cards and panels lie flat on the page; only hover, menus and dialogs lift.
        panel: "none",
        card: "none",
        ...pswShadows
      }
    }
  },
  plugins: []
};

export default config;
