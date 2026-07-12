# Design QA: public demo workspace parity

- source visual truth path: `docs/media/pitchforge-overview.png`
- implementation screenshot path: `docs/media/pitchforge-public-demo.png`
- viewport: 1600 x 900 CSS pixels (Chrome reported `clientWidth=1600`, `clientHeight=900`; the browser capture pipeline downscaled the saved PNG raster to 1255 x 900)
- state: completed public sample, overview tab selected, dark theme

## Full-view comparison evidence

The source and implementation screenshots were opened together in the same comparison input. The implementation preserves the authenticated workspace's page shell, maximum content width, header composition, score card, primary action, five-tab navigation, two-column overview grid, full-width Google Cloud summary, typography hierarchy, radii, borders, shadows, and color tokens.

Intentional content differences are limited to the public sample title/copy, `サンプルモード` account state, `保存されません` disclosure, sample scores, and static runtime labels. These differences explain the mode without changing the product flow or visual system.

## Focused region comparison evidence

A separate crop was not required. The header, chips, score card, primary button, tab strip, and overview cards are readable in the full-view pair, and both screens reuse the same production components and CSS tokens. The system architecture asset was also inspected in the export tab and remains the existing source SVG rather than an approximation.

## Required fidelity surfaces

- Fonts and typography: same application font stack, weights, sizes, line heights, tracking, and heading hierarchy; sample title wraps within the same header constraint.
- Spacing and layout rhythm: same container, panel padding, section gaps, grid tracks, radii, and elevation. No clipped controls or horizontal overflow at 1600 x 900.
- Colors and visual tokens: same cockpit background, panels, borders, blue active/primary states, slate copy, and emerald status treatment.
- Image quality and asset fidelity: export view uses `public/demo/pitchforge-architecture.svg`, copied from the existing real architecture asset. No placeholder or code-drawn replacement is used.
- Copy and content: public-only copy clearly states browser-local playback and no persistence; hackathon/judge-only wording is absent.

## Primary interactions tested

- `AI改善を開始` transitions to the same AI improvement flow and completes the five-step browser-local simulation.
- `概要`, `AI改善フロー`, `5観点評価`, `成果物`, and `エクスポート` tabs all switch to populated states.
- Score, artifacts, Markdown/JSON export actions, and the system architecture preview appear after completion.
- Chrome console errors checked: none.
- Public demo API fallbacks are covered by tests for auth status, runtime status, Markdown export, and architecture export overrides.

## Findings

No actionable P0, P1, or P2 visual findings remain.

Accepted differences: sample-specific data and public-mode disclosure copy. The browser screenshot encoder downscaled the captured raster width, but Chrome's inspected CSS viewport was 1600 x 900 and the responsive layout was evaluated at that viewport.

## Comparison history

1. Earlier P2: the first public demo used a separate condensed layout and only four tabs. Fix: reused the authenticated workspace structure and production components, added the export tab, and reproduced the AI improvement flow locally. Post-fix evidence: `docs/media/pitchforge-public-demo.png` compared with `docs/media/pitchforge-overview.png`.
2. Earlier P2: a demo-only bottom CTA introduced structural drift. Fix: removed it; login remains in the shared site header. Post-fix evidence: current overview screenshot has the same workspace content sequence as the source.
3. Earlier P2: the completed score remained visible while a replay was running, and `参考画像 4件` was not backed by sample assets. Fix: score now shows `–` until local replay completes, and the unsupported count was replaced by the truthful `保存されません` disclosure. Post-fix evidence: current browser DOM and screenshot.

## Final result

final result: passed
