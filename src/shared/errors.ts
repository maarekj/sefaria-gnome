// Erreurs communes de l'application.

/** Réponse HTTP en erreur du serveur. */
export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** JSON d'une réponse, ou `undefined` si ce n'en est pas (page d'erreur HTML d'un mandataire…). */
export function tryJson(text: string): unknown {
  if (text === '') return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** Message d'une réponse HTTP en erreur : `{error}` du serveur s'il y en a un, sinon le statut. */
export function httpErrorMessage(method: string, path: string, status: number, text: string): string {
  const json = tryJson(text);
  if (typeof json === 'object' && json !== null && 'error' in json && typeof json.error === 'string') return json.error;
  return `${method} ${path} : HTTP ${status}`;
}
