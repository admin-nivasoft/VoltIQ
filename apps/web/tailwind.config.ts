import type { Config } from 'tailwindcss';

// The `cds` colours and `plex` font are the Carbon-themed design tokens used by the shadcn-style
// components in src/components/ui. Values live as CSS variables in src/demo/app/theme.css (checked
// against carbondesignsystem.com, White theme). Extending only: the existing screens are unchanged.
const v = (name: string) => `var(--cds-${name})`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cds: {
          background: v('background'),
          layer: v('layer-01'),
          'layer-2': v('layer-02'),
          'layer-hover': v('layer-hover'),
          'layer-selected': v('layer-selected'),
          'border-subtle': v('border-subtle'),
          'border-strong': v('border-strong'),
          'text-primary': v('text-primary'),
          'text-secondary': v('text-secondary'),
          'text-helper': v('text-helper'),
          'text-on-color': v('text-on-color'),
          interactive: v('interactive'),
          'interactive-hover': v('interactive-hover'),
          focus: v('focus'),
          'shell-bg': v('shell-bg'),
          'shell-text': v('shell-text'),
          'shell-hover': v('shell-hover'),
          error: v('support-error'),
          warning: v('support-warning'),
          success: v('support-success'),
          info: v('support-info'),
          'error-bg': v('notification-error-bg'),
          'warning-bg': v('notification-warning-bg'),
          'success-bg': v('notification-success-bg'),
          'info-bg': v('notification-info-bg'),
          'data-1': v('data-1'),
        },
      },
      fontFamily: {
        plex: ['"IBM Plex Sans"', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
      },
      borderRadius: { cds: '2px' },
    },
  },
  plugins: [],
} satisfies Config;
