export type DeployProvider = "vercel" | "netlify" | "cloudflare" | "node" | "docker" | "static";
export interface DeploymentPreset { provider: DeployProvider; buildTarget: "server" | "static"; outputDirectory: string; serverEntry?: string; environment?: string[]; }
export const presets: Record<DeployProvider, DeploymentPreset> = {
  vercel: { provider: "vercel", buildTarget: "server", outputDirectory: ".onestack/deploy/vercel", serverEntry: "server.js" },
  netlify: { provider: "netlify", buildTarget: "server", outputDirectory: ".onestack/deploy/netlify", serverEntry: "server.js" },
  cloudflare: { provider: "cloudflare", buildTarget: "server", outputDirectory: ".onestack/deploy/cloudflare", serverEntry: "worker.js" },
  node: { provider: "node", buildTarget: "server", outputDirectory: "dist", serverEntry: "server.js" },
  docker: { provider: "docker", buildTarget: "server", outputDirectory: ".onestack/deploy/docker", serverEntry: "server.js" },
  static: { provider: "static", buildTarget: "static", outputDirectory: "dist" },
};
export function getDeploymentPreset(provider: DeployProvider) { return presets[provider]; }
