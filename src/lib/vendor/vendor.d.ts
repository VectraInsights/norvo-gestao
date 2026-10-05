// Declarações para os bundles JS vendorizados (sem tipos próprios).
declare module "*.cjs" {
  const content: any;
  export default content;
}
