import { layout, SITE_TITLE } from '../html.js';
import { linkCards } from './shared.js';

const GUIDES = [
  ['Script layers', 'script-layers/', 'How 1_Core through 5_Mission compose, and what belongs in each layer'],
  ['Engine APIs and script code', 'engine-and-script/', 'How to tell engine declarations, callbacks and readable script implementations apart'],
];

const typeLink = (base, name, label = name) => `<a href="${base}classes/${name}/"><code>${label}</code></a>`;
const layerLink = (base, name) => `<a href="${base}files/#${name}"><code>${name}</code></a>`;
const topicLink = (base, name, label = name) => `<a href="${base}topics/${name}/">${label}</a>`;

export function renderGuidesIndex(ctx) {
  const { base } = ctx;
  const links = GUIDES.map(([title, href, description]) => [title, base + 'guides/' + href, description]);
  const content = /* html */ `
<h1>Guides</h1>
<p>Conceptual maps for the DayZ script API. Use these when a class list tells you what exists but not how the pieces fit together.</p>
${linkCards(links)}`;

  return layout({
    ...ctx,
    title: 'Guides',
    active: 'guides/',
    description: `Conceptual guides to the DayZ script API · ${SITE_TITLE}`,
    breadcrumbs: [{ label: 'Guides' }],
    content,
  });
}

export function renderScriptLayersGuide(ctx) {
  const { base } = ctx;
  const content = /* html */ `
<div class="class-doc">
<h1>Script layers</h1>
<p>DayZ ships its Enforce Script in five compiled modules, loaded in order: ${layerLink(base, '1_Core')} → ${layerLink(base, '2_GameLib')} → ${layerLink(base, '3_Game')} → ${layerLink(base, '4_World')} → ${layerLink(base, '5_Mission')}. Each layer can build on the types loaded before it. The folder is therefore part of the architecture, not just file organisation.</p>
<p>This guide describes what the current source corpus contains. It is a map for reading and modding the scripts, not a specification of engine internals.</p>

<table class="list doc-table">
<thead><tr><th>Layer</th><th>What you will find there</th><th>Start with</th></tr></thead>
<tbody>
<tr><td>${layerLink(base, '1_Core')}</td><td>Language/runtime primitives and the broad engine API surface</td><td>${typeLink(base, 'ScriptModule')}, ${typeLink(base, 'IEntity')}, ${typeLink(base, 'Widget')}</td></tr>
<tr><td>${layerLink(base, '2_GameLib')}</td><td>Generic game entities, components, managers and shared utilities</td><td>${typeLink(base, 'Game')}, ${typeLink(base, 'ScriptComponent')}, ${typeLink(base, 'ScriptCallQueue')}</td></tr>
<tr><td>${layerLink(base, '3_Game')}</td><td>DayZ-facing engine facade, shared systems and entity roots</td><td>${typeLink(base, 'CGame')}, ${typeLink(base, 'DayZGame')}, ${typeLink(base, 'EntityAI')}</td></tr>
<tr><td>${layerLink(base, '4_World')}</td><td>Most gameplay implementations: items, actions, recipes, players and plugins</td><td>${typeLink(base, 'ItemBase')}, ${typeLink(base, 'PlayerBase')}, ${typeLink(base, 'ActionBase')}</td></tr>
<tr><td>${layerLink(base, '5_Mission')}</td><td>Mission lifecycle, client HUD, menus and server mission hooks</td><td>${typeLink(base, 'MissionServer')}, ${typeLink(base, 'MissionGameplay')}, ${typeLink(base, 'UIScriptedMenu')}</td></tr>
</tbody>
</table>

<h2 id="composition">How the layers compose</h2>
<p>A later module can refer to declarations from an earlier one. That is why the entity chain crosses folders: ${typeLink(base, 'IEntity')} begins in 1_Core, ${typeLink(base, 'Object')} and ${typeLink(base, 'EntityAI')} continue it in 3_Game, and types such as ${typeLink(base, 'ItemBase')} and ${typeLink(base, 'PlayerBase')} implement gameplay in 4_World.</p>
<p>Load order also affects globals with the same name. The generic <code>GetGame()</code> from 2_GameLib is superseded by the DayZ-facing version in 3_Game, whose return type is ${typeLink(base, 'DayZGame')}.</p>
<p>The ${typeLink(base, 'ScriptModule')} notes document an important boundary: <code>modded</code> does not patch a class that has already been compiled in another module. Put a modification where its dependencies and target class are available instead of treating all five folders as one compilation unit.</p>

<h2 id="core">1_Core: runtime and engine contracts</h2>
<p>${layerLink(base, '1_Core')} contains the roots that the rest of the script API builds on. Its <code>proto</code> files declare engine-provided entities, widgets, math, serialisation, reflection and Workbench APIs. Representative types include ${typeLink(base, 'Managed')}, ${typeLink(base, 'IEntity')}, ${typeLink(base, 'Math')}, ${typeLink(base, 'Serializer')} and ${typeLink(base, 'Widget')}.</p>
<p>Many methods here are declarations whose implementation lives inside the engine. The source page can show their signature, but there is no script body to inspect. See <a href="${base}guides/engine-and-script/">Engine APIs and script code</a> before choosing an override point.</p>
<p>Related topics: ${topicLink(base, 'Math', 'Math')}, ${topicLink(base, 'Physics', 'Physics')} and ${topicLink(base, 'WidgetAPI', 'Widget UI system')}.</p>

<h2 id="gamelib">2_GameLib: shared game library</h2>
<p>${layerLink(base, '2_GameLib')} is a small bridge between core engine types and DayZ-specific systems. It contains generic entity and component classes, input and menu managers, callback utilities, cameras and a script testing framework.</p>
<p>${typeLink(base, 'ScriptCallQueue')} and ${typeLink(base, 'ScriptInvoker')} are common utilities from this layer. ${typeLink(base, 'GenericEntity')} and ${typeLink(base, 'ScriptComponent')} provide generic building blocks that later game code specialises.</p>
<p>Related topic: ${topicLink(base, 'ScriptTestingFramework', 'Script Testing Framework')}.</p>

<h2 id="game">3_Game: the DayZ-facing game layer</h2>
<p>${layerLink(base, '3_Game')} connects the generic engine API to DayZ. It contains ${typeLink(base, 'CGame')} and ${typeLink(base, 'DayZGame')}, shared inventory and weather systems, Central Economy and hive interfaces, enums, GUI foundations, and the entity roots used by 4_World.</p>
<p>The chain ${typeLink(base, 'Object')} → ${typeLink(base, 'Entity')} → ${typeLink(base, 'EntityAI')} lives here. ${typeLink(base, 'DayZPlayer')} is the engine-facing player base; the readable gameplay implementation continues in 4_World.</p>
<p>Related topics: ${topicLink(base, 'RPC', 'RPC')}, ${topicLink(base, 'Vehicle', 'Vehicles')} and ${topicLink(base, 'EnvironmentCfg', 'Environment configuration')}.</p>

<h2 id="world">4_World: gameplay implementation</h2>
<p>${layerLink(base, '4_World')} contains most of the scripts and most of the code modders read or extend: items, firearms, actions, recipes, player modifiers, creatures, vehicles, base building and plugin services.</p>
<p>Common entry points include ${typeLink(base, 'PlayerBase')}, ${typeLink(base, 'ItemBase')}, ${typeLink(base, 'ActionBase')}, ${typeLink(base, 'Weapon_Base')}, ${typeLink(base, 'ZombieBase')}, ${typeLink(base, 'CarScript')}, ${typeLink(base, 'RecipeBase')} and ${typeLink(base, 'PluginBase')}.</p>
<p>Cross-layer stacks become concrete here. For example, ${typeLink(base, 'DayZPlayer')} from 3_Game is extended by ${typeLink(base, 'DayZPlayerImplement')}, ${typeLink(base, 'ManBase')} and finally ${typeLink(base, 'PlayerBase')} in 4_World.</p>

<h2 id="mission">5_Mission: lifecycle and interface</h2>
<p>${layerLink(base, '5_Mission')} is the top loaded module. It contains the mission lifecycle and most of the in-game UI: server connection and spawn handling, the client gameplay mission, HUD, inventory and menu screens, and intro scenes.</p>
<p>${typeLink(base, 'MissionServer')} is the server mission entry point. ${typeLink(base, 'MissionGameplay')} owns client-side gameplay updates and input. ${typeLink(base, 'UIScriptedMenu')} and ${typeLink(base, 'IngameHud')} anchor much of the interface layer.</p>

<h2 id="outside">Outside the five layers</h2>
<p>The source tree also contains <code>editor/</code> and standalone documentation files. They are useful to browse, but they are not additional steps in the five-module runtime order described above.</p>
</div>`;

  return layout({
    ...ctx,
    title: 'Script layers',
    active: 'guides/',
    description: `How 1_Core through 5_Mission compose in the DayZ script API · ${SITE_TITLE}`,
    breadcrumbs: [
      { label: 'Guides', href: `${base}guides/` },
      { label: 'Script layers' },
    ],
    content,
  });
}

export function renderEngineAndScriptGuide(ctx) {
  const { base } = ctx;
  const content = /* html */ `
<div class="class-doc">
<h1>Engine APIs and script code</h1>
<p>DIFF documents the script files that DayZ ships. Some of those files contain readable Enforce Script implementations; others declare contracts implemented inside the engine. A visible signature does not always mean there is a script body to copy or override.</p>

<table class="list doc-table">
<thead><tr><th>Form</th><th>What it means here</th><th>What to do</th></tr></thead>
<tbody>
<tr><td><code>proto</code></td><td>Declared in script and implemented by the engine</td><td>Call it as documented; there is no script body to inspect</td></tr>
<tr><td><code>proto native</code></td><td>Engine implementation using the native calling convention</td><td>Do not treat it as an overrideable script method</td></tr>
<tr><td><code>event</code></td><td>A callback the engine invokes on a script object</td><td>Override at an appropriate script layer and normally preserve the inherited call</td></tr>
<tr><td>Method with a body</td><td>Readable script implementation</td><td>Follow its calls and callers; extend it with inheritance or <code>modded class</code> where allowed</td></tr>
</tbody>
</table>

<h2 id="declarations">Engine declarations</h2>
<p>A <code>proto</code> method is the script-facing edge of engine code. DIFF can show its modifiers, parameters, return type, documentation and references, but the C++ implementation is outside the DayZ Script Diff corpus.</p>
<p>${typeLink(base, 'Widget')} and ${typeLink(base, 'Math')} are declaration-heavy examples. ${typeLink(base, 'IEntity')} mixes engine methods with <code>event</code> callbacks such as frame, initialisation and contact events.</p>

<h2 id="implementations">Script implementations</h2>
<p>A normal method with braces has a body in the source viewer. Start from its <strong>src</strong> link, then use <strong>References</strong> and <strong>Referenced by</strong> to follow the local behaviour. ${typeLink(base, 'EntityAI')}, ${typeLink(base, 'ItemBase')} and ${typeLink(base, 'PlayerBase')} expose progressively more DayZ-specific script logic across 3_Game and 4_World.</p>
<p>Engine-backed types and script implementations often form one inheritance chain. The boundary is not “engine class versus script class” by name; inspect the declaration and its modifiers member by member.</p>

<h2 id="callbacks">Callbacks and extension points</h2>
<p><code>event</code> marks a callback initiated by the engine. Script classes also define ordinary override hooks such as the <code>EE*</code> methods on ${typeLink(base, 'EntityAI')}. These are useful entry points because their script bodies and callers reveal how vanilla composes the behaviour.</p>
<p><code>modded class</code> layers a rewrite over a class in the same compiled module, with <code>super</code> still reaching the previous implementation. Module boundaries matter: read <a href="${base}guides/script-layers/">Script layers</a> before deciding where a patch belongs.</p>

<h2 id="reading">A practical reading path</h2>
<ol>
  <li>Open the class page and identify its inheritance chain and source locations.</li>
  <li>Check whether the member is <code>proto</code>, <code>native</code>, <code>event</code>, or a method with a body.</li>
  <li>For script code, open <strong>src</strong> and follow References and Referenced by.</li>
  <li>For engine declarations, rely on the documented contract and examples in script callers rather than searching for a missing body.</li>
  <li>Check the class's layer before using inheritance or <code>modded class</code>.</li>
</ol>
<p>Compare ${typeLink(base, 'ScriptCallQueue')}, an engine-facing utility whose callers demonstrate normal use, with ${typeLink(base, 'MissionServer')}, a script implementation intended to participate in mission lifecycle behaviour.</p>

<h2 id="scope">What DIFF cannot show</h2>
<p>DIFF does not contain DayZ's engine internals. It can document exported declarations and the script code that calls them, but it cannot reveal an engine method's internal algorithm, thread model or side effects unless the published contract or observable script usage explains them.</p>
</div>`;

  return layout({
    ...ctx,
    title: 'Engine APIs and script code',
    active: 'guides/',
    description: `How to distinguish engine declarations from DayZ script implementations · ${SITE_TITLE}`,
    breadcrumbs: [
      { label: 'Guides', href: `${base}guides/` },
      { label: 'Engine APIs and script code' },
    ],
    content,
  });
}
