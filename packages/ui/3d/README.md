# packages/ui/3d

The Nectar mark and hex tokens as 3D objects (three@0.160.0).

- `nectar3d.js`: shared geometry. `buildMark` is used live in the landing hero; `buildToken` produced the token renders.
- `render.html` + `shoot.js`: offline renderer. Serve this folder (`python3 -m http.server 8765`), install
  `three@0.160.0` next to it, then `node shoot.js '<json of shots>'`. Settings used for the landing:
  `{"tm":"none","rx":-0.3,"ry":0.45,"rz":0.04,"mat":{"color":"#13e39c","sheen":0,"roughness":0.22,"metalness":0.25,"clearcoat":1,"clearcoatRoughness":0.05}}`
  with `key` 1.1 and `rim` 1.6.
- `hero.webp`: static fallback and first frame for the hero. `tokA`–`tokD.webp`: closing-panel tokens (white body with
  mint mark, and mint body with white mark).
