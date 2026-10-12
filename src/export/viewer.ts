/**
 * Découpage interactif (0.21) : un seul fichier .html, publié avec les autres, qui s'ouvre dans
 * n'importe quel navigateur, sans compte ni connexion. Chacun choisit son métier ; les plans
 * ajoutés ou modifiés depuis la publication précédente sont marqués « * » avec l'avant et l'après ;
 * chacun peut annoter les plans et enregistrer ses retours dans un fichier .topshot-retours, que
 * Topshot relit (voir model/feedback.ts).
 *
 * Le code qui tourne chez le destinataire est la fonction `viewerApp`, recopiée telle quelle dans
 * le fichier : elle ne dépend de rien d'autre (ni import, ni variable extérieure).
 */
import type { Id, ProjectDoc } from '../model/types';
import type { ExportModel } from './model';
import type { PlanRevision } from '../model/revisions';
import { RETOURS_EXT } from '../model/feedback';

export interface ViewerCamera {
  setupId: Id;
  label: string;
  values: Record<'size' | 'axis' | 'angle' | 'focal' | 'movement' | 'grip', string>;
}

export interface ViewerPlan {
  id: Id;
  code: string;
  reprise: boolean;
  action: string;
  script: string;
  duration: string;
  image: string | null;
  cameras: ViewerCamera[];
  revised: PlanRevision | null;
}

export interface ViewerSequence {
  id: Id;
  number: string;
  heading: string;
  strip: { fill: string; edge: string };
  plans: ViewerPlan[];
  floors: { name: string; image: string }[];
}

export interface ViewerData {
  v: 1;
  projectId: Id;
  title: string;
  director: string;
  appVersion: string;
  publication: { n: number; label: string; color: { name: string; hex: string }; prev: number | null };
  retoursExt: string;
  multiCamera: boolean;
  sequences: ViewerSequence[];
}

const VALUE_KEYS = ['size', 'axis', 'angle', 'focal', 'movement', 'grip'] as const;

/**
 * Données du lecteur, d'après le modèle d'export (mêmes textes que le PDF).
 * `images` : vignette de chaque image (data: URL) ; `floors` : plans au sol dessinés, par séquence.
 */
export function buildViewerData(
  doc: ProjectDoc,
  m: ExportModel,
  pub: ViewerData['publication'],
  revised: Map<Id, PlanRevision>,
  images: Map<string, string>,
  floors: Map<Id, { name: string; image: string }[]>,
  appVersion: string,
): ViewerData {
  return {
    v: 1,
    projectId: doc.id,
    title: m.title || 'Sans titre',
    director: m.director,
    appVersion,
    publication: pub,
    retoursExt: RETOURS_EXT,
    multiCamera: m.multiCamera,
    sequences: m.sequences.map((s) => {
      const seq = doc.sequences.find((x) => x.id === s.id);
      return {
        id: s.id,
        number: s.number,
        heading: s.heading,
        strip: s.strip,
        floors: floors.get(s.id) ?? [],
        plans: s.plans.map((p) => {
          const plan = seq?.plans.find((x) => x.id === p.id);
          return {
            id: p.id,
            code: p.code,
            reprise: p.isReprise,
            action: p.action,
            script: p.script,
            duration: p.duration,
            image: p.imageFile ? (images.get(p.imageFile) ?? null) : null,
            cameras: p.cameras.map((c, i) => ({
              setupId: plan?.cameras[i]?.id ?? '',
              label: c.label,
              values: Object.fromEntries(VALUE_KEYS.map((k) => [k, c.values[k] ?? ''])) as ViewerCamera['values'],
            })),
            revised: revised.get(p.id) ?? null,
          };
        }),
      };
    }),
  };
}

/** Le fichier .html complet. Les données sont du JSON inerte ; le texte n'est jamais interprété comme du HTML. */
export function viewerHtml(data: ViewerData): string {
  const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const title = `${data.title} — découpage (publication ${data.publication.n})`.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Topshot ${data.appVersion}">
<title>${title}</title>
<style>${VIEWER_CSS}</style>
</head>
<body>
<div id="app"><noscript>Ce découpage s’ouvre dans un navigateur avec JavaScript (Safari, Chrome, Firefox). Téléchargez le fichier, puis ouvrez-le.</noscript></div>
<script type="application/json" id="topshot-data">${json}</script>
<script>(${viewerApp.toString()})();</script>
</body>
</html>
`;
}

const VIEWER_CSS = `
:root{--bg:#F1F3F6;--card:#fff;--text:#15171B;--text2:#4A5260;--text3:#626A77;--hair:rgba(20,23,28,.12);--sep:#E6E9EE;--accent:#1F6FEB;--soft:rgba(31,111,235,.12);--warn:#8A5300;--warnbg:#FBEBD2;--ok:#1F6B3A;--okbg:#DDF1E3;--rev:#1F4E9A}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:14px/1.4 -apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased}
button,input,select,textarea{font:inherit;color:inherit}
.band{height:8px}
header{display:flex;flex-wrap:wrap;align-items:center;gap:12px 18px;padding:14px 22px;background:var(--card);border-bottom:1px solid var(--sep)}
header h1{margin:0;font-size:19px}
.metier{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.sub{color:var(--text2);font-size:12.5px;margin-top:2px}
.spacer{flex:1}
.seg{display:flex;flex-wrap:wrap;gap:2px;padding:3px;border-radius:9px;background:#EEF0F3}
.seg button{border:0;background:transparent;padding:6px 11px;border-radius:7px;font-weight:600;font-size:12.5px;color:var(--text2);cursor:pointer}
.seg button[aria-pressed=true]{background:var(--card);color:var(--text);box-shadow:0 1px 3px rgba(0,0,0,.14)}
.body{display:grid;grid-template-columns:220px minmax(0,1fr) 380px;min-height:calc(100vh - 140px)}
nav{padding:16px 12px;border-right:1px solid var(--sep);background:#F7F8FA;display:flex;flex-direction:column;gap:2px}
.h{font-size:10.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--text3);padding:6px 8px}
nav a{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;color:var(--text);text-decoration:none;font-weight:600;font-size:13px}
nav a:hover{background:var(--soft)}
nav label{display:flex;align-items:center;gap:8px;padding:6px 8px;font-size:13px;color:var(--text2)}
.strip{width:5px;height:16px;border-radius:2px;flex:none;border:1px solid transparent}
.cnt{margin-left:auto;color:var(--rev);font-size:12px;font-weight:700;white-space:nowrap}
main{padding:16px 22px;display:flex;flex-direction:column;gap:10px;min-width:0}
.seqh{display:flex;align-items:center;gap:10px;font-weight:700;margin-top:10px;padding:4px 0;cursor:pointer;background:none;border:0;text-align:left;width:100%}
.seqh .strip{height:14px}
.seqh .n{font-weight:500;color:var(--text3)}
.card{display:grid;grid-template-columns:16px 132px minmax(0,1fr);gap:12px;align-items:start;background:var(--card);border:1px solid var(--hair);border-radius:12px;padding:10px 12px;cursor:pointer;text-align:left;width:100%}
.card[aria-current=true]{outline:2px solid var(--accent)}
.star{color:var(--rev);font-weight:800;font-family:ui-monospace,Menlo,monospace}
.ph{width:132px;height:74px;border-radius:8px;background:#E6E9EE;object-fit:cover;display:block}
.code{font-family:ui-monospace,"SF Mono",Menlo,monospace;font-weight:700;font-size:15px}
.row{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px}
.tech{font-size:12.5px;color:var(--text2)}
.before{font-size:12px;color:var(--text3)}
.tag{display:inline-flex;align-items:center;height:22px;padding:0 8px;border-radius:11px;background:#EEF0F3;font-size:11.5px;font-weight:600;color:var(--text2)}
.tag.ok{background:var(--okbg);color:var(--ok)}.tag.warn{background:var(--warnbg);color:var(--warn)}.tag.rev{background:#DCE8FB;color:var(--rev)}
aside{border-left:1px solid var(--sep);background:var(--card);padding:16px 18px;display:flex;flex-direction:column;gap:12px;position:sticky;top:0;align-self:start;max-height:100vh;overflow:auto}
.quote{font-family:ui-monospace,Menlo,monospace;font-size:12.5px;background:var(--soft);border-radius:8px;padding:8px 10px;white-space:pre-wrap}
.kv{display:grid;grid-template-columns:110px 1fr;gap:4px 12px;font-size:13px}
.kv span:nth-child(odd){color:var(--text2)}
.btn{height:32px;padding:0 12px;border-radius:8px;border:1px solid var(--hair);background:var(--card);font-weight:600;font-size:13px;cursor:pointer}
.btn[aria-pressed=true]{border-color:var(--accent);background:var(--soft);color:var(--accent)}
.btn.warnon[aria-pressed=true]{border-color:#C77700;background:var(--warnbg);color:var(--warn)}
.btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
textarea,input[type=text],select{width:100%;border:1px solid var(--hair);border-radius:8px;padding:8px 10px;background:#fff}
textarea{min-height:72px;resize:vertical}
.floor{width:100%;border-radius:8px;border:1px solid var(--hair)}
footer{position:sticky;bottom:0;display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:12px 22px;background:var(--card);border-top:1px solid var(--sep)}
.note{font-size:12px;color:var(--text3)}
dialog{border:0;border-radius:14px;padding:20px;max-width:440px;width:calc(100vw - 32px);box-shadow:0 30px 80px rgba(16,24,40,.3)}
dialog::backdrop{background:rgba(20,23,28,.3)}
dialog form{display:flex;flex-direction:column;gap:12px}
@media (max-width:980px){.body{grid-template-columns:1fr}nav{display:none}aside{position:static;max-height:none;border-left:0;border-top:1px solid var(--sep)}.card{grid-template-columns:16px 96px minmax(0,1fr)}.ph{width:96px;height:54px}}
@media print{footer,nav,aside,.seg{display:none}.body{display:block}}
`;

/**
 * Le lecteur, dans le navigateur du destinataire. Autonome : aucune référence à l'extérieur de la
 * fonction (elle est recopiée par toString). Les textes sont posés en textContent, jamais en HTML.
 */
export function viewerApp(): void {
  type Values = Record<string, string>;
  interface Cam { setupId: string; label: string; values: Values }
  interface Plan { id: string; code: string; reprise: boolean; action: string; script: string; duration: string; image: string | null; cameras: Cam[]; revised: { status: string; changes: { label: string; from: string; to: string }[] } | null }
  interface Seq { id: string; number: string; heading: string; strip: { fill: string; edge: string }; plans: Plan[]; floors: { name: string; image: string }[] }
  interface Data { v: number; projectId: string; title: string; director: string; appVersion: string; publication: { n: number; label: string; color: { name: string; hex: string }; prev: number | null }; retoursExt: string; multiCamera: boolean; sequences: Seq[] }
  interface Item { id: string; planId: string | null; seqId: string | null; code: string; verdict: 'ok' | 'revoir' | null; text: string; proposal: { setupId: string | null; field: string; text: string; before: string } | null; sent: string }

  const data = JSON.parse(document.getElementById('topshot-data')!.textContent || '{}') as Data;
  const LABEL: Record<string, string> = { action: 'Action', size: 'Valeur', axis: 'Axe', angle: 'Angle', focal: 'Focale', movement: 'Mouvement', grip: 'Machinerie', script: 'Scénario', duration: 'Durée' };
  // Ce que chaque métier voit d'abord (l'action est toujours là) ; « Tout » montre tout.
  const METIERS: Record<string, string[]> = {
    Réalisation: ['script', 'size', 'axis', 'movement', 'duration'],
    Image: ['size', 'axis', 'angle', 'focal', 'movement', 'grip', 'duration'],
    Machinerie: ['size', 'axis', 'movement', 'grip'],
    Électro: ['size', 'axis', 'angle', 'focal'],
    Déco: ['script', 'size', 'axis'],
    Scripte: ['script', 'size', 'axis', 'focal', 'duration'],
    '1er assistant': ['size', 'focal', 'movement', 'grip', 'duration'],
    Tout: ['script', 'size', 'axis', 'angle', 'focal', 'movement', 'grip', 'duration'],
  };
  const KEY = 'topshot-retours:' + data.projectId + ':' + data.publication.n;

  const store = {
    get(k: string): string | null {
      try {
        return window.localStorage.getItem(k);
      } catch {
        return null;
      }
    },
    set(k: string, v: string) {
      try {
        window.localStorage.setItem(k, v);
      } catch {
        /* navigateur sans stockage : les retours restent le temps de la page */
      }
    },
  };
  const loaded = (() => {
    try {
      return JSON.parse(store.get(KEY) || '{}') as { items?: Item[]; metier?: string; author?: string; onlyRevised?: boolean };
    } catch {
      return {};
    }
  })();
  const state = {
    items: (loaded.items || []) as Item[],
    metier: loaded.metier && METIERS[loaded.metier] ? loaded.metier : 'Tout',
    author: loaded.author || '',
    onlyRevised: !!loaded.onlyRevised,
    sel: null as { planId: string | null; seqId: string } | null,
  };
  const save = () => store.set(KEY, JSON.stringify({ items: state.items, metier: state.metier, author: state.author, onlyRevised: state.onlyRevised }));
  const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  function h(tag: string, attrs?: Record<string, string | boolean | ((e: Event) => void)> | null, ...kids: (Node | string | null | false | undefined)[]): HTMLElement {
    const el = document.createElement(tag);
    if (attrs)
      for (const k of Object.keys(attrs)) {
        const v = attrs[k];
        if (typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
        else if (v === true) el.setAttribute(k, '');
        else if (v !== false) el.setAttribute(k, String(v));
      }
    for (const c of kids) if (c !== null && c !== false && c !== undefined) el.append(typeof c === 'string' ? document.createTextNode(c) : c);
    return el;
  }

  const findItem = (planId: string | null, seqId: string) => state.items.find((i) => i.planId === planId && (planId !== null || i.seqId === seqId));
  function itemFor(planId: string | null, seq: Seq, code: string): Item {
    let it = findItem(planId, seq.id);
    if (!it) {
      it = { id: rid(), planId, seqId: seq.id, code, verdict: null, text: '', proposal: null, sent: '' };
      state.items.push(it);
    }
    return it;
  }
  const hasContent = (i: Item) => !!(i.verdict || i.text.trim() || (i.proposal && i.proposal.text.trim()));
  const sig = (i: Item) => JSON.stringify([i.verdict, i.text.trim(), i.proposal && i.proposal.text.trim() ? [i.proposal.setupId, i.proposal.field, i.proposal.text.trim()] : null]);
  const toSend = () => state.items.filter((i) => hasContent(i) && i.sent !== sig(i));

  const app = document.getElementById('app')!;

  function techLine(p: Plan, keys: string[]): string[] {
    return p.cameras.map((c) => {
      const vals = keys.filter((k) => k !== 'script' && k !== 'duration').map((k) => c.values[k]).filter(Boolean);
      const line = vals.join(' · ');
      return data.multiCamera && p.cameras.length > 1 ? c.label + ' : ' + line : line;
    });
  }

  function render() {
    const keys = METIERS[state.metier] || METIERS.Tout!;
    const pub = data.publication;
    const revCount = data.sequences.reduce((n, s) => n + s.plans.filter((p) => p.revised).length, 0);
    const total = data.sequences.reduce((n, s) => n + s.plans.length, 0);
    const pending = toSend().length;
    app.textContent = '';
    app.append(
      h('div', { class: 'band', style: 'background:' + pub.color.hex + (pub.color.hex.toUpperCase() === '#FFFFFF' ? ';border-bottom:1px solid #E6E9EE' : '') }),
      h(
        'header',
        null,
        h('div', null, h('h1', null, data.title + ' — découpage technique'), h('div', { class: 'sub' }, [pub.label, data.director ? 'réalisation : ' + data.director : '', data.sequences.length + ' séquence' + (data.sequences.length > 1 ? 's' : '') + ' · ' + total + ' plan' + (total > 1 ? 's' : ''), pub.prev && revCount ? '* ' + revCount + ' plan' + (revCount > 1 ? 's' : '') + ' modifié' + (revCount > 1 ? 's' : '') + ' depuis la publication ' + pub.prev : ''].filter(Boolean).join(' · '))),
        h('span', { class: 'spacer' }),
        h(
          'div',
          { class: 'metier' },
          h('span', { class: 'note' }, 'Je suis :'),
          h(
          'div',
          { class: 'seg', role: 'group', 'aria-label': 'Métier' },
          ...Object.keys(METIERS).map((m) =>
            h(
              'button',
              {
                type: 'button',
                'aria-pressed': String(m === state.metier),
                onClick: () => {
                  state.metier = m;
                  save();
                  render();
                },
              },
              m,
            ),
          ),
          ),
        ),
      ),
    );
    const nav = h(
      'nav',
      { 'aria-label': 'Séquences' },
      h('div', { class: 'h' }, 'Séquences'),
      ...data.sequences.map((s) => {
        const n = s.plans.filter((p) => p.revised).length;
        return h('a', { href: '#seq-' + s.id }, h('span', { class: 'strip', style: 'background:' + s.strip.fill + ';border-color:' + s.strip.edge }), (s.number || '?') + ' · ' + s.heading.replace(/^SÉQUENCE [^-]*- /, '').replace(/\.$/, ''), n ? h('span', { class: 'cnt' }, '* ' + n) : null);
      }),
      pub.prev
        ? h(
            'label',
            null,
            h('input', {
              type: 'checkbox',
              checked: state.onlyRevised,
              onChange: (e: Event) => {
                state.onlyRevised = (e.target as HTMLInputElement).checked;
                save();
                render();
              },
            }),
            'Seulement les changements *',
          )
        : null,
    );
    const main = h('main', { 'aria-label': 'Plans' });
    for (const s of data.sequences) {
      const plans = state.onlyRevised ? s.plans.filter((p) => p.revised) : s.plans;
      if (state.onlyRevised && !plans.length) continue;
      const seqItem = findItem(null, s.id);
      main.append(
        h(
          'button',
          {
            type: 'button',
            class: 'seqh',
            id: 'seq-' + s.id,
            'aria-current': String(!!state.sel && state.sel.planId === null && state.sel.seqId === s.id),
            onClick: () => {
              state.sel = { planId: null, seqId: s.id };
              render();
            },
          },
          h('span', { class: 'strip', style: 'background:' + s.strip.fill + ';border-color:' + s.strip.edge }),
          s.heading,
          h('span', { class: 'n' }, s.plans.length + ' plan' + (s.plans.length > 1 ? 's' : '')),
          seqItem && hasContent(seqItem) ? h('span', { class: 'tag rev' }, 'retour') : null,
        ),
      );
      for (const p of plans) {
        const it = findItem(p.id, s.id);
        main.append(
          h(
            'button',
            {
              type: 'button',
              class: 'card',
              'aria-label': 'Plan ' + p.code,
              'aria-current': String(!!state.sel && state.sel.planId === p.id),
              onClick: () => {
                state.sel = { planId: p.id, seqId: s.id };
                render();
              },
            },
            h('span', { class: 'star', title: p.revised ? (p.revised.status === 'added' ? 'Nouveau plan' : 'Modifié') + ' depuis la publication ' + pub.prev : '' }, p.revised ? '*' : ''),
            p.image ? h('img', { class: 'ph', src: p.image, alt: '' }) : h('span', { class: 'ph' }),
            h(
              'span',
              { style: 'display:flex;flex-direction:column;gap:4px;min-width:0' },
              h('span', { class: 'row' }, h('span', { class: 'code' }, p.code), it && it.verdict === 'ok' ? h('span', { class: 'tag ok' }, '✓ validé') : null, it && it.verdict === 'revoir' ? h('span', { class: 'tag warn' }, 'à revoir') : null, it && (it.text.trim() || (it.proposal && it.proposal.text.trim())) ? h('span', { class: 'tag rev' }, 'retour') : null, keys.indexOf('duration') >= 0 && p.duration ? h('span', { class: 'tag' }, p.duration) : null),
              h('span', null, p.action || (p.reprise ? 'Reprise' : '—')),
              ...techLine(p, keys).map((l) => (l ? h('span', { class: 'tech' }, l) : null)),
              keys.indexOf('script') >= 0 && p.script ? h('span', { class: 'tech' }, '« ' + p.script + ' »') : null,
              p.revised ? h('span', { class: 'before' }, p.revised.status === 'added' ? 'nouveau plan' : p.revised.changes.map((c) => c.label + ' : ' + (c.from || '—') + ' → ' + (c.to || '—')).join(' ; ')) : null,
            ),
          ),
        );
      }
    }
    app.append(h('div', { class: 'body' }, nav, main, side()));
    app.append(
      h(
        'footer',
        null,
        h('span', { class: 'tag rev' }, pending + ' retour' + (pending > 1 ? 's' : '') + ' à envoyer'),
        h('span', { class: 'note' }, 'Vos retours restent dans ce navigateur tant que vous ne les enregistrez pas.'),
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'btn primary', disabled: !pending, onClick: () => send() }, 'Enregistrer mes retours…'),
      ),
    );
  }

  function side(): HTMLElement {
    const aside = h('aside', { 'aria-label': 'Détails' });
    const sel = state.sel;
    if (!sel) {
      aside.append(h('div', { class: 'note' }, 'Choisissez un plan (ou une séquence) pour le voir en entier et donner votre retour.'));
      return aside;
    }
    const seq = data.sequences.find((s) => s.id === sel.seqId);
    if (!seq) return aside;
    const plan = sel.planId ? seq.plans.find((p) => p.id === sel.planId) : null;
    const code = plan ? plan.code : 'Séq. ' + (seq.number || '?');
    const it = itemFor(plan ? plan.id : null, seq, code);
    if (plan) {
      aside.append(
        h('div', { class: 'row' }, h('span', { class: 'code', style: 'font-size:22px' }, plan.code), plan.revised ? h('span', { class: 'star' }, plan.revised.status === 'added' ? '* nouveau' : '* modifié') : null),
        h('div', null, plan.action || '—'),
      );
      if (plan.script) aside.append(h('div', { class: 'quote' }, plan.script));
      for (const c of plan.cameras) {
        const kv = h('div', { class: 'kv' });
        if (plan.cameras.length > 1) kv.append(h('span', null, 'Caméra'), h('span', null, c.label));
        for (const k of ['size', 'axis', 'angle', 'focal', 'movement', 'grip']) kv.append(h('span', null, LABEL[k]!), h('span', null, c.values[k] || '—'));
        aside.append(kv);
      }
      if (plan.duration) aside.append(h('div', { class: 'kv' }, h('span', null, 'Durée'), h('span', null, plan.duration)));
      if (plan.revised && plan.revised.changes.length) aside.append(h('div', { class: 'before' }, 'Avant (publication ' + data.publication.prev + ') : ' + plan.revised.changes.map((c) => c.label + ' ' + (c.from || '—')).join(' ; ')));
    } else {
      aside.append(h('div', { class: 'code', style: 'font-size:17px' }, seq.heading));
      for (const f of seq.floors) aside.append(h('div', { class: 'h' }, f.name), h('img', { class: 'floor', src: f.image, alt: 'Plan au sol ' + f.name }));
    }
    const set = (fn: () => void) => {
      fn();
      save();
      render();
    };
    aside.append(
      h('div', { class: 'h', style: 'padding:6px 0 0' }, 'Votre retour'),
      h(
        'div',
        { class: 'row' },
        h('button', { type: 'button', class: 'btn', 'aria-pressed': String(it.verdict === 'ok'), onClick: () => set(() => void (it.verdict = it.verdict === 'ok' ? null : 'ok')) }, '✓ Validé'),
        h('button', { type: 'button', class: 'btn warnon', 'aria-pressed': String(it.verdict === 'revoir'), onClick: () => set(() => void (it.verdict = it.verdict === 'revoir' ? null : 'revoir')) }, 'À revoir'),
      ),
    );
    const ta = h('textarea', { 'aria-label': 'Votre retour sur ' + code, placeholder: 'Un mot sur ' + code + '…' }) as HTMLTextAreaElement;
    ta.value = it.text;
    ta.addEventListener('input', () => {
      it.text = ta.value;
      save();
    });
    ta.addEventListener('change', () => render());
    aside.append(ta);
    if (plan) {
      const fieldSel = h('select', { 'aria-label': 'Réglage proposé' }) as HTMLSelectElement;
      fieldSel.append(h('option', { value: '' }, 'Proposer une valeur…'));
      for (const k of ['size', 'axis', 'angle', 'focal', 'movement', 'grip', 'action']) fieldSel.append(h('option', { value: k }, LABEL[k]!));
      fieldSel.value = it.proposal ? it.proposal.field : '';
      const camSel = h('select', { 'aria-label': 'Caméra' }) as HTMLSelectElement;
      for (const c of plan.cameras) camSel.append(h('option', { value: c.setupId }, 'Caméra ' + c.label));
      camSel.value = it.proposal && it.proposal.setupId ? it.proposal.setupId : plan.cameras[0] ? plan.cameras[0].setupId : '';
      const inp = h('input', { type: 'text', 'aria-label': 'Valeur proposée', placeholder: 'ex. 50' }) as HTMLInputElement;
      inp.value = it.proposal ? it.proposal.text : '';
      const sync = () => {
        const f = fieldSel.value;
        if (!f) {
          it.proposal = null;
        } else {
          const cam = plan.cameras.find((c) => c.setupId === camSel.value) || plan.cameras[0];
          it.proposal = { setupId: f === 'action' ? null : cam ? cam.setupId : null, field: f, text: inp.value, before: f === 'action' ? plan.action : cam ? cam.values[f] || '' : '' };
        }
        save();
      };
      fieldSel.addEventListener('change', () => {
        sync();
        render();
      });
      camSel.addEventListener('change', sync);
      inp.addEventListener('input', sync);
      inp.addEventListener('change', () => render());
      aside.append(fieldSel);
      if (it.proposal) {
        if (plan.cameras.length > 1 && it.proposal.field !== 'action') aside.append(camSel);
        aside.append(inp, h('div', { class: 'note' }, 'Publié : ' + (it.proposal.before || '—')));
      }
    }
    return aside;
  }

  function send() {
    const items = toSend();
    if (!items.length) return;
    const dlg = h('dialog', { 'aria-label': 'Enregistrer mes retours' }) as HTMLDialogElement;
    const name = h('input', { type: 'text', 'aria-label': 'Votre nom', placeholder: 'Votre nom', required: true }) as HTMLInputElement;
    name.value = state.author;
    const form = h(
      'form',
      {
        method: 'dialog',
        onSubmit: (e: Event) => {
          e.preventDefault();
          const author = name.value.trim();
          if (!author) return;
          state.author = author;
          const file = {
            topshotRetours: 1,
            id: rid(),
            projectId: data.projectId,
            publication: data.publication.n,
            author,
            role: state.metier === 'Tout' ? '' : state.metier,
            sentAt: Date.now(),
            items: items.map((i) => ({ id: i.id + '-' + rid(), planId: i.planId, seqId: i.seqId, code: i.code, verdict: i.verdict, text: i.text.trim(), proposal: i.proposal && i.proposal.text.trim() ? { setupId: i.proposal.setupId, field: i.proposal.field, text: i.proposal.text.trim(), before: i.proposal.before } : null })),
          };
          const blob = new Blob([JSON.stringify(file, null, 1)], { type: 'application/json' });
          const a = h('a', { href: URL.createObjectURL(blob), download: 'Retours ' + data.title.replace(/[\\/:*?"<>|]+/g, '-') + ' — publication ' + data.publication.n + ' — ' + author.replace(/[\\/:*?"<>|]+/g, '-') + '.' + data.retoursExt }) as HTMLAnchorElement;
          document.body.append(a);
          a.click();
          a.remove();
          for (const i of items) i.sent = sig(i);
          save();
          form.replaceChildren(
            h('strong', null, 'Retours enregistrés'),
            h('div', null, 'Déposez le fichier « .' + data.retoursExt + ' » dans le dossier « Retours », à côté de ce découpage, ou envoyez-le par mail à la personne qui vous l’a envoyé.'),
            h('button', { type: 'button', class: 'btn primary', onClick: () => dlg.close() }, 'OK'),
          );
          render();
        },
      },
      h('strong', null, 'Enregistrer mes retours'),
      h('div', { class: 'note' }, items.length + ' retour' + (items.length > 1 ? 's' : '') + ' · ' + (state.metier === 'Tout' ? 'sans métier choisi' : state.metier)),
      name,
      h('div', { class: 'row', style: 'justify-content:flex-end' }, h('button', { type: 'button', class: 'btn', onClick: () => dlg.close() }, 'Annuler'), h('button', { type: 'submit', class: 'btn primary' }, 'Enregistrer le fichier')),
    );
    dlg.append(form);
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
    name.focus();
  }

  render();
}
