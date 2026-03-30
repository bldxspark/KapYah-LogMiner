// File purpose: Vite TypeScript environment declarations for the frontend build.
/// <reference types="vite/client" />

declare module "*.glb" {
  const src: string;
  export default src;
}

declare module "*.gltf" {
  const src: string;
  export default src;
}
