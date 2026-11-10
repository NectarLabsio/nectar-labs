// Types for nectar3d.js (plain JS so render.html can load it without a build step). three@0.160.0.
import type * as THREE_NS from "three";

type Three = typeof THREE_NS;

export function hexShape(THREE: Three, R: number, r: number): THREE_NS.Shape;
export function hexGeo(THREE: Three, R: number, depth: number, bevel: number): THREE_NS.ExtrudeGeometry;
export const MARK: ReadonlyArray<readonly [number, number]>;
export function buildMark(THREE: Three, mat: THREE_NS.Material): THREE_NS.Group;
export function buildToken(THREE: Three, bodyMat: THREE_NS.Material, markMat: THREE_NS.Material): THREE_NS.Group;
export function mintMaterials(THREE: Three, theme: "light" | "dark"): { cell: THREE_NS.MeshPhysicalMaterial; tokenBody: THREE_NS.MeshPhysicalMaterial; tokenMark: THREE_NS.MeshPhysicalMaterial };
