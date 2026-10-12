// One stylesheet for every kit component. Tone and series colors carry
// meaning (temperature, which option), so each has light and dark values.

const LIGHT = `
  --ogk-cold-line:#378ADD;--ogk-cold-ink:#185FA5;--ogk-cold-tint:#E6F1FB;
  --ogk-cool-line:#1D9E75;--ogk-cool-ink:#0F6E56;--ogk-cool-tint:#E1F5EE;
  --ogk-warm-line:#EF9F27;--ogk-warm-ink:#854F0B;--ogk-warm-tint:#FAEEDA;
  --ogk-hot-line:#D85A30;--ogk-hot-ink:#993C1D;--ogk-hot-tint:#FAECE7;
  --ogk-neutral-line:#888780;--ogk-neutral-ink:var(--color-text-primary);--ogk-neutral-tint:var(--color-background-secondary);`;
const DARK = `
  --ogk-cold-ink:#85B7EB;--ogk-cold-tint:rgba(55,138,221,.2);
  --ogk-cool-ink:#5DCAA5;--ogk-cool-tint:rgba(29,158,117,.2);
  --ogk-warm-ink:#FAC775;--ogk-warm-tint:rgba(239,159,39,.2);
  --ogk-hot-ink:#F0997B;--ogk-hot-tint:rgba(216,90,48,.2);`;

export const KIT_CSS = `
.ogk{${LIGHT}
  --ogk-c0:#378ADD;--ogk-c1:#1D9E75;--ogk-c2:#EF9F27;--ogk-c3:#D85A30;--ogk-c4:#D4537E;--ogk-c5:#888780;--ogk-c6:#639922;--ogk-c7:#7F77DD;
  font-family:var(--font-sans);color:var(--color-text-primary);padding:2px 0}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) .ogk{${DARK}}}
:root[data-theme="dark"] .ogk{${DARK}}
.ogk-status{font-size:16px;font-weight:500;line-height:1.5;margin:0 0 12px}
.ogk-steps{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;margin:0 0 8px;padding:0;list-style:none}
.ogk-steps li{display:flex;align-items:center;gap:8px}
.ogk-steps li+li::before{content:"";width:16px;border-top:1px solid var(--color-border-tertiary)}
.ogk-steps button{display:flex;align-items:center;gap:6px;border:0;background:none;padding:2px 0;font-size:13px;color:var(--color-text-secondary)}
.ogk-steps b{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;border:1px solid var(--color-border-tertiary);font-size:12px;font-weight:500}
.ogk-steps li.now button{color:var(--color-text-primary)}
.ogk-steps li.now b{background:var(--color-text-primary);color:var(--color-background-primary);border-color:transparent}
.ogk-steps li.done b{background:var(--color-background-success);color:var(--color-text-success);border-color:transparent}
.ogk-steps.ogk-compact li:not(.now) span{display:none}
.ogk-figure{margin:0 auto}
.ogk svg{display:block;width:100%;height:auto}
.ogk-t{font-size:14px;font-weight:500;fill:var(--color-text-primary)}
.ogk-ts{font-size:12px;fill:var(--color-text-secondary)}
.ogk-zone-t{font-size:14px;font-weight:500}
.ogk-node{cursor:pointer;outline:none}
.ogk-node rect{fill:var(--color-background-primary);stroke:var(--color-border-secondary);stroke-width:1;transition:fill .25s,stroke .25s}
.ogk-node:focus-visible rect{stroke:var(--color-text-info);stroke-width:2}
.ogk-node.ogk-on rect{stroke-width:2}
.ogk-link{fill:none;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;transition:stroke-width .25s}
.ogk-link.ogk-on{stroke-width:4;stroke-dasharray:9 7;animation:ogk-flow .9s linear infinite}
@keyframes ogk-flow{to{stroke-dashoffset:-16}}
.ogk-card{background:var(--color-background-secondary);border-radius:12px;padding:14px 16px;margin:12px 0}
.ogk-card p{margin:0;font-size:14px;line-height:1.6;color:var(--color-text-secondary)}
.ogk-card .ogk-card-t{font-size:15px;font-weight:500;color:var(--color-text-primary);margin-bottom:2px}
.ogk-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.ogk-chips span{font-size:12px;padding:2px 10px;border-radius:999px;background:var(--color-background-primary);color:var(--color-text-secondary);border:1px solid var(--color-border-tertiary)}
.ogk-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 12px}
.ogk-primary,.ogk-primary:hover{background:var(--color-text-primary);color:var(--color-background-primary);border-color:transparent}
.ogk-primary:hover{opacity:.88}
.ogk-quiet{border-color:transparent}
.ogk-follow{display:flex;flex-wrap:wrap;gap:8px;margin-top:4px}
.ogk-follow button{font-size:13px;border-radius:999px;padding:6px 14px}
.ogk-error{font-size:14px;line-height:1.5;color:var(--color-text-danger);background:var(--color-background-danger);border-radius:10px;padding:10px 14px}
.ogk-inputs{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px 24px;margin:0 0 16px}
.ogk-input label{display:flex;justify-content:space-between;gap:12px;font-size:13px;color:var(--color-text-secondary);margin:0 0 8px}
.ogk-input label b{font-weight:500;color:var(--color-text-primary)}
.ogk-input input{width:100%}
.ogk-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:0 0 16px}
.ogk-metric{background:var(--color-background-secondary);border-radius:12px;padding:12px 14px}
.ogk-metric span{display:block;font-size:12px;color:var(--color-text-secondary)}
.ogk-metric b{display:block;font-size:20px;font-weight:500;margin-top:2px}
.ogk-metric.ogk-em{background:var(--ogk-cold-tint)}
.ogk-metric.ogk-em span,.ogk-metric.ogk-em b{color:var(--ogk-cold-ink)}
.ogk-metric.ogk-em b{font-size:26px}
.ogk-legend{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:13px;color:var(--color-text-secondary);margin:0 0 6px}
.ogk-legend i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;vertical-align:-1px}
.ogk-axis{font-size:11px;fill:var(--color-text-secondary)}
.ogk-gridline{stroke:var(--color-border-tertiary);stroke-width:1}
.ogk-note{font-size:12px;color:var(--color-text-secondary);margin:6px 0 12px}
.ogk-sim{display:grid;grid-template-columns:minmax(64px,auto) 64px minmax(0,1fr) 132px;align-items:center;gap:22px 14px;margin:18px 0 6px}
.ogk-sim .ogk-big{font-size:24px;font-weight:500}
.ogk-sim .ogk-big.ogk-idle{color:var(--color-text-tertiary)}
.ogk-sim .ogk-cnt{font-size:13px;color:var(--color-text-secondary);text-align:right}
.ogk-sim .ogk-lbl{font-size:14px;display:flex;align-items:center;gap:8px}
.ogk-sim .ogk-lbl i{width:10px;height:10px;border-radius:50%}
.ogk-track{position:relative;height:10px;border-radius:5px;background:var(--color-background-secondary)}
.ogk-fill{height:100%;border-radius:5px;width:0;transition:width .25s}
.ogk-mark{position:absolute;top:-6px;bottom:-6px;border-left:1.5px dashed var(--color-text-secondary)}
.ogk-mark span{position:absolute;bottom:100%;left:0;transform:translateX(-50%);font-size:11px;color:var(--color-text-secondary);padding-bottom:2px;white-space:nowrap}
.ogk-trace{font-size:13px;color:var(--color-text-secondary);min-height:20px;margin:6px 0}
.ogk-insight{font-size:14px;font-weight:500;min-height:22px;margin:2px 0 12px}
.ogk-seg{display:inline-flex;flex-wrap:wrap;gap:2px;padding:2px;border-radius:999px;background:var(--color-background-secondary);margin:0 0 14px}
.ogk-seg button{border:0;border-radius:999px;padding:6px 14px;font-size:13px;background:transparent}
.ogk-seg button[aria-pressed="true"]{background:var(--color-background-primary);box-shadow:0 0 0 1px var(--color-border-tertiary)}
.ogk-total{font-size:13px;color:var(--color-text-secondary);margin:0 0 8px}
.ogk-total b{font-size:24px;font-weight:500;color:var(--color-text-primary);margin-right:6px}
.ogk-bar{display:flex;gap:2px;height:28px;border-radius:8px;overflow:hidden;margin:0 0 16px}
.ogk-bar div{min-width:2px;transition:flex-grow .35s}
.ogk-parts{display:grid;grid-template-columns:14px minmax(0,1fr) auto 48px;gap:8px 12px;align-items:baseline;font-size:14px}
.ogk-parts i{width:10px;height:10px;border-radius:3px;align-self:center}
.ogk-parts .ogk-num{text-align:right;font-variant-numeric:tabular-nums}
.ogk-parts .ogk-share{text-align:right;color:var(--color-text-secondary);font-variant-numeric:tabular-nums}
.ogk-parts .ogk-pnote{grid-column:2/-1;font-size:12px;color:var(--color-text-secondary);margin-top:-6px}
@media (max-width:520px){.ogk-sim{grid-template-columns:minmax(56px,auto) 56px minmax(0,1fr)}.ogk-sim .ogk-cnt{display:none}}
@media (prefers-reduced-motion: reduce){.ogk *{transition:none!important;animation:none!important}}
`;
