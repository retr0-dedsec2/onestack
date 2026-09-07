// Shared types only: no provider imports or secrets.
export type AppApi = {
  signup: { input: { email: string; password: string }; output: { token?: string } };
  signin: { input: { email: string; password: string }; output: { token?: string } };
  signout: { input: Record<string, never>; output: { token: null } };
  notes: { input: { text: string }; output: { notes: { text: string }[] } };
  upload: { input: { text: string }; output: { key: string } };
  checkout: { input: Record<string, never>; output: { url: string } };
  portal: { input: Record<string, never>; output: { url: string } };
};
