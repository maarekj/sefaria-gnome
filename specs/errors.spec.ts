// Erreurs HTTP : message du serveur, ou statut si le corps n'est pas du JSON.
import { httpErrorMessage, tryJson } from '../src/shared/errors.ts';

describe('errors', () => {
  it('message {error} du serveur', () => {
    expect(httpErrorMessage('GET', '/api/x', 404, '{"error":"introuvable"}')).toBe('introuvable');
  });
  it('page HTML d’un mandataire : statut HTTP', () => {
    expect(httpErrorMessage('GET', '/api/x', 502, '<html>Bad Gateway</html>')).toBe('GET /api/x : HTTP 502');
    expect(httpErrorMessage('POST', '/api/x', 503, '')).toBe('POST /api/x : HTTP 503');
  });
  it('JSON illisible : undefined', () => {
    expect(tryJson('<html>')).toBeUndefined();
    expect(tryJson('')).toBeNull();
    expect(tryJson('[1]')).toEqual([1]);
  });
});
