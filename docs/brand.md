# AACC Operations Hub visual identity

The Operations Hub follows Anne Arundel Community College's current digital visual language while keeping the interface practical for dense operational work.

## Research basis

- [AACC's public website](https://www.aacc.edu/) establishes teal as the primary digital color, orange as the action accent, and pale aqua as a supporting surface.
- [AACC's brand refresh story](https://www.aacc.edu/newsroom/redefine-u/episodes/season-3/episode-25/) describes the college's refreshed logo, colors, and style guide.
- The supplied AACC logo is stored unchanged at `apps/web/public/brand/aacc-logo.jpg`.

## Product palette

| Token | Hex | Role |
| --- | --- | --- |
| AACC teal | `#007582` | Primary actions, links, focus states, active navigation |
| Deep teal | `#15515A` | Hero surfaces, strong headings, structural emphasis |
| AACC orange | `#BE5513` | Selective accents, highlights, and secondary visual emphasis |
| Pale aqua | `#DCFAFF` | Soft branded backgrounds |
| Canvas | `#F7FAFA` | Application background |
| Ink | `#173438` | Primary text |
| Muted ink | `#53686B` | Secondary text |

Orange is an accent rather than a competing primary action color. Status colors retain their semantic meaning; they should not be replaced with brand colors when that would make states harder to recognize.

## Logo use

- Keep the supplied artwork's aspect ratio and colors intact.
- Place it on white or another quiet, high-contrast surface.
- Use the compact `A` mark only where the full logo cannot fit, such as the collapsed sidebar and generated favicon.
- Do not recreate, recolor, stretch, or AI-generate the institutional logo.

## Accessibility

The core light-mode pairs meet WCAG AA for normal text: teal on white is `5.43:1`, and muted ink on the canvas is `5.62:1`. Dark-mode primary text and controls use lighter adaptations of the same palette while preserving the AACC character.
