// Shared geometry for the Nectar mark in 3D. Pure functions of THREE; inlined into the landing page.
export function hexShape(THREE, R, r) {
  // pointy-top hexagon, rounded corners of radius r (along-edge distance)
  const s = new THREE.Shape();
  const v = [];
  for (let k = 0; k < 6; k++) { const a = Math.PI / 2 + k * Math.PI / 3; v.push([R * Math.cos(a), R * Math.sin(a)]); }
  for (let k = 0; k < 6; k++) {
    const p = v[k], prev = v[(k + 5) % 6], next = v[(k + 1) % 6];
    const L = R; // edge length equals R for a regular hexagon
    const a = [p[0] + (prev[0] - p[0]) * r / L, p[1] + (prev[1] - p[1]) * r / L];
    const b = [p[0] + (next[0] - p[0]) * r / L, p[1] + (next[1] - p[1]) * r / L];
    if (k === 0) s.moveTo(a[0], a[1]); else s.lineTo(a[0], a[1]);
    s.quadraticCurveTo(p[0], p[1], b[0], b[1]);
  }
  s.closePath();
  return s;
}

export function hexGeo(THREE, R, depth, bevel) {
  const g = new THREE.ExtrudeGeometry(hexShape(THREE, R, R * 0.16), {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 6, curveSegments: 10,
  });
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return g;
}

// Mark layout measured from the logo file: top hex over two, centres in units of the hex radius.
export const MARK = [[0, 1.13], [-0.97, -0.565], [0.97, -0.565]];

export function buildMark(THREE, mat) {
  const group = new THREE.Group();
  const geo = hexGeo(THREE, 0.88, 0.42, 0.06);
  const cells = MARK.map(([x, y]) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, 0);
    m.userData.home = new THREE.Vector3(x, y, 0);
    group.add(m);
    return m;
  });
  group.userData.cells = cells;
  return group;
}

export function buildToken(THREE, bodyMat, markMat) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(hexGeo(THREE, 1, 0.26, 0.07), bodyMat);
  group.add(body);
  const small = hexGeo(THREE, 0.2, 0.04, 0.012);
  for (const [x, y] of MARK) {
    const m = new THREE.Mesh(small, markMat);
    m.position.set(x * 0.235, y * 0.235 - 0.02, 0.13 + 0.07);
    group.add(m);
    const back = m.clone(); back.position.z = -(0.13 + 0.07); back.rotation.y = Math.PI; group.add(back);
  }
  return group;
}

export function mintMaterials(THREE, theme) {
  const dark = theme !== 'light';
  return {
    cell: new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(dark ? 0x2ee6a6 : 0x22c98f), roughness: 0.3, metalness: 0.0,
      clearcoat: 1, clearcoatRoughness: 0.12, sheen: 0.6, sheenColor: new THREE.Color(0xbfffe8), sheenRoughness: 0.5,
    }),
    tokenBody: new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0xeef3f1), roughness: 0.42, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.25,
    }),
    tokenMark: new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0x16e09c), roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.1 }),
  };
}
