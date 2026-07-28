---
name: MayaHelp System
colors:
  surface: '#f8f9ff'
  surface-dim: '#d0dbed'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e6eeff'
  surface-container-high: '#dee9fc'
  surface-container-highest: '#d9e3f6'
  on-surface: '#121c2a'
  on-surface-variant: '#4a4455'
  inverse-surface: '#27313f'
  inverse-on-surface: '#eaf1ff'
  outline: '#7b7486'
  outline-variant: '#ccc3d7'
  surface-tint: '#7331df'
  primary: '#5300b7'
  on-primary: '#ffffff'
  primary-container: '#6d28d9'
  on-primary-container: '#dac5ff'
  inverse-primary: '#d3bbff'
  secondary: '#5f5a7c'
  on-secondary: '#ffffff'
  secondary-container: '#dcd5fd'
  on-secondary-container: '#605b7d'
  tertiary: '#3e4143'
  on-tertiary: '#ffffff'
  tertiary-container: '#56585a'
  on-tertiary-container: '#cdced0'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ebddff'
  primary-fixed-dim: '#d3bbff'
  on-primary-fixed: '#250059'
  on-primary-fixed-variant: '#5b00c5'
  secondary-fixed: '#e5deff'
  secondary-fixed-dim: '#c8c2e9'
  on-secondary-fixed: '#1b1735'
  on-secondary-fixed-variant: '#474363'
  tertiary-fixed: '#e1e2e4'
  tertiary-fixed-dim: '#c5c6c8'
  on-tertiary-fixed: '#191c1e'
  on-tertiary-fixed-variant: '#444749'
  background: '#f8f9ff'
  on-background: '#121c2a'
  surface-variant: '#d9e3f6'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: '0'
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: '0'
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-xs:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base-unit: 4px
  container-padding: 24px
  gutter: 16px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
---

## Brand & Style

The design system for this helpdesk platform is built on the pillars of efficiency, clarity, and empathy. The brand personality is professional yet approachable, aimed at reducing the cognitive load of support agents and providing a sense of resolution for users.

The visual style follows a **Corporate / Modern** aesthetic with a strong emphasis on **Minimalism**. By utilizing generous whitespace and a restricted color palette, the interface prioritizes content and actionability. The goal is to evoke a "calm productivity" emotional response, ensuring that even during high-traffic support windows, the UI remains a stable and organized environment.

## Colors

The palette is anchored by a deep primary purple to convey authority and trust, supported by a soft secondary lilac for highlights and background layering. 

- **Primary (#6D28D9):** Used for primary actions, active states, and brand identifiers.
- **Secondary (#DDD6FE):** Used for soft backgrounds, decorative elements, and subtle "hover" states.
- **Surface / Background (#FFFFFF):** The base layer for all main content areas to maximize readability.
- **Neutral / Contrast (#F3F4F6):** Used for sidebars, card containers, and input fields to create structural separation without the use of harsh lines.

## Typography

The typography system utilizes **Inter** for its exceptional legibility and systematic feel. The hierarchy is designed to be highly functional for a data-heavy application.

- **Headlines:** Use Bold and Semi-Bold weights with slight negative letter-spacing to create a "locked-in" professional look.
- **Body:** Standardized at 16px for comfortable reading of ticket descriptions and support articles.
- **Labels:** Used for metadata, ticket status, and navigation items. These often use medium or semi-bold weights to differentiate them from body text.
- **Language:** All UI copy is in Spanish, requiring special attention to word lengths which may be longer than English counterparts.

## Layout & Spacing

This design system uses a **Fluid Grid** model based on a 12-column layout for desktop environments. The spacing rhythm is derived from a 4px base unit to ensure consistent vertical and horizontal alignment.

- **Desktop:** 12 columns, 24px margins, 16px gutters. Max-width of 1440px for content containers.
- **Tablet:** 8 columns, 20px margins, 16px gutters.
- **Mobile:** 4 columns, 16px margins, 12px gutters.

Spacing between functional groups should follow a "Stack" philosophy: 8px for related items (label + input), 16px for component groups, and 32px for major layout sections.

## Elevation & Depth

Visual hierarchy is established using **Ambient Shadows** and **Tonal Layers**. Instead of using borders to define sections, we use soft shadows to "lift" active content from the light gray background.

- **Level 0 (Flat):** Used for the main background (#FFFFFF) or sidebar (#F3F4F6).
- **Level 1 (Low):** Subtle shadow (0px 2px 4px rgba(0,0,0,0.05)) used for cards and ticket list items.
- **Level 2 (High):** Focused shadow (0px 10px 15px rgba(0,0,0,0.1)) used for modals, dropdowns, and floating action buttons.

Shadows should inherit a tiny hint of the primary purple color (e.g., `#6D28D9` at 5% opacity) to maintain a cohesive color temperature.

## Shapes

The design system utilizes a very approachable shape language with **Rounded (Level 2)** corners as the baseline. 

- **Standard Elements:** 8px (0.5rem) for buttons, inputs, and small cards.
- **Large Elements:** 16px (1rem) for main containers and modal overlays.
- **Extra Large (2xl):** 24px (1.5rem) used for primary hero cards or search bars to emphasize the "clean and modern" friendly aesthetic requested.
- **Pill:** Fully rounded corners are reserved for Status Chips (e.g., "Abierto," "Resuelto") and notification badges.

## Components

**Buttons:** 
- **Primary:** Purple (#6D28D9) background with white text. High-contrast, 8px corner radius.
- **Secondary:** Light purple (#DDD6FE) background with dark purple text.

**Input Fields:**
- White background with a 1px light gray border. On focus, the border transitions to Primary Purple with a subtle glow (2px spread).

**Cards:**
- White background, 24px (2xl) corner radius, Level 1 shadow. Cards should have 24px internal padding to maintain the "plenty of whitespace" requirement.

**Chips (Status Tags):**
- Use a "Pill" shape. "Resuelto" (Green tint), "Pendiente" (Amber tint), "Abierto" (Purple tint). Text should be uppercase and 12px (label-xs).

**Lists:**
- Ticket lists should have generous vertical padding (16px) and use thin horizontal separators (#F3F4F6) or alternating tonal backgrounds rather than heavy borders.

**Navigation:**
- Use a persistent sidebar on the left with a #F3F4F6 background. Active links should be indicated by a primary purple vertical bar on the left edge and a change in text weight.