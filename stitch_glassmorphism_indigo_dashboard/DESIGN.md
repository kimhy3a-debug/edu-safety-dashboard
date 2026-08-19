---
name: Lumina
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#464554'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#767586'
  outline-variant: '#c7c4d7'
  surface-tint: '#494bd6'
  primary: '#4648d4'
  on-primary: '#ffffff'
  primary-container: '#6063ee'
  on-primary-container: '#fffbff'
  inverse-primary: '#c0c1ff'
  secondary: '#4b41e1'
  on-secondary: '#ffffff'
  secondary-container: '#645efb'
  on-secondary-container: '#fffbff'
  tertiary: '#b90538'
  on-tertiary: '#ffffff'
  tertiary-container: '#dc2c4f'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e1e0ff'
  primary-fixed-dim: '#c0c1ff'
  on-primary-fixed: '#07006c'
  on-primary-fixed-variant: '#2f2ebe'
  secondary-fixed: '#e2dfff'
  secondary-fixed-dim: '#c3c0ff'
  on-secondary-fixed: '#0f0069'
  on-secondary-fixed-variant: '#3323cc'
  tertiary-fixed: '#ffdadb'
  tertiary-fixed-dim: '#ffb2b7'
  on-tertiary-fixed: '#40000d'
  on-tertiary-fixed-variant: '#92002a'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  headline-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 48px
    fontWeight: '800'
    lineHeight: '1.1'
    letterSpacing: -0.025em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '800'
    lineHeight: '1.2'
    letterSpacing: -0.025em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '800'
    lineHeight: '1.2'
    letterSpacing: -0.025em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: '1.3'
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  label-caps:
    fontFamily: Outfit
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1'
    letterSpacing: 0.05em
  label-md:
    fontFamily: Outfit
    fontSize: 14px
    fontWeight: '500'
    lineHeight: '1'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 8px
  sm: 16px
  md: 24px
  lg: 40px
  xl: 64px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 32px
---

## Brand & Style
The design system embodies a sophisticated, ethereal dashboard aesthetic that balances high-utility productivity with a dreamlike, premium atmosphere. It is designed for high-growth startups and AI-driven platforms where clarity and inspiration must coexist.

The style is defined by **Elevated Glassmorphism**. It utilizes multi-layered transparency, high-density background blurs, and a dynamic pastel environment to create a sense of depth and lightweight permanence. The visual language is optimistic, precise, and fluid, favoring soft transitions and organic movement over static, rigid structures.

## Colors
This design system utilizes a vibrant, high-saturation functional palette set against a soft, animated canvas.

- **Canvas**: The background is a 4-color pastel mesh gradient. This gradient should animate using a slow CSS `ease-in-out` loop, shifting color positions over a 15-20 second duration to maintain a living, breathing interface.
- **Primary & Action**: Indigo serves as the core brand driver, with a darker shade reserved for hover states and high-emphasis interaction.
- **Accent & Status**: Rose is used for critical call-to-actions and emotive highlights. Emerald and Amber provide standard semantic feedback for success and warning states, respectively.
- **Surfaces**: All container surfaces are semi-transparent white (`rgba(255, 255, 255, 0.85)`), ensuring legibility against the moving background.

## Typography
Typography is used to establish hierarchy through weight and character rather than just size.

- **Headlines**: Use **Plus Jakarta Sans** at ExtraBold (800) weights. The tight negative tracking (-0.025em) is essential for achieving the sophisticated, modern "editorial" look of the dashboard.
- **Body**: Also utilizes **Plus Jakarta Sans** for consistency, prioritizing readability with generous line heights.
- **Accents & Labels**: **Outfit** is used for functional UI elements like badges, button labels, and micro-copy. Its geometric clarity provides a technical counter-balance to the expressive headings.

## Layout & Spacing
The system follows a **Bento-style grid** philosophy. Content is housed in distinct, variably-sized containers that fit together like a puzzle.

- **Grid**: A 12-column fluid grid on desktop, transitioning to a 1-column stack on mobile.
- **Bento Logic**: Containers should span different column widths (e.g., a 4-col card next to an 8-col card) to create visual interest.
- **Margins**: Use large outer margins (32px) to allow the animated background to frame the content, reinforcing the floating "glass" aesthetic.
- **Gap**: A consistent 24px gutter maintains a clear separation between the glass modules.

## Elevation & Depth
Depth is the primary communicator of hierarchy in this design system.

- **Glass Layers**: All main surfaces use a `12px` backdrop-blur with a `1px` solid white border at 50% opacity. This creates a "frosted" edge that defines the shape against the pastel background.
- **Shadows**: Active elements (focused inputs, hovered cards, or primary buttons) utilize a large, soft Indigo-tinted shadow: `0 20px 25px -5px rgba(99, 102, 241, 0.2), 0 10px 10px -5px rgba(99, 102, 241, 0.1)`.
- **Floating Effect**: Components should appear to float at different Z-axis levels. Higher-priority items should have slightly higher opacity (up to 95%) and more pronounced shadows.

## Shapes
The shape language is predominantly rounded and approachable.

- **Modules**: Standard Bento cards use `1rem` (16px) corner radius.
- **Buttons & Badges**: These follow a **Capsule** strategy. Primary buttons and status chips should have a fully rounded radius (999px) to contrast against the more structured rectangular cards.
- **AI Components**: Specialized triggers (like AI chat floating buttons) should be perfectly circular to denote a different class of interaction.

## Components
- **Bento Cards**: The foundational container. Always white (85% opacity), 12px blur, and 1px white/50 border. Inner padding should be 24px.
- **Capsule Badges**: Small, high-contrast indicators. Use `Outfit` Semibold. For example, a "New" badge would be Primary Indigo with white text.
- **Buttons**:
    - *Primary*: Solid Indigo (#6366f1) with white text, capsule-shaped, and the signature Indigo soft shadow.
    - *Secondary*: Ghost style with a 1px Indigo border and subtle 5% Indigo background tint on hover.
- **Sidebar Links**: High-contrast layout. Inactive links use Neutral Slate (#64748b). Active links use Primary Indigo for both text and a small vertical indicator pill, with a bold weight (700).
- **Inputs**: Transparent background with a 1px white/50 border. On focus, the border shifts to Indigo and the soft shadow is applied.
- **AI Trigger**: A circular, floating action button featuring a subtle Indigo-to-Rose gradient and a 20px blur glow.