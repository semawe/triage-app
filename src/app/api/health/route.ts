export const dynamic = "force-dynamic";

// Sonde de disponibilité du processus, interrogée par le déploiement bleu/vert
// (`/opt/deploybot/deploy-triage-app.sh`) : la nouvelle instance ne reçoit le
// trafic qu'une fois cette route en 200, ce qui supprime la fenêtre de 502.
//
// Volontairement sans accès à la base : la question posée est « ce processus
// sert-il des requêtes ? », pas « la base est-elle debout ? ». Les lier ferait
// échouer le déploiement du correctif au moment précis où la base va mal.
export function GET() {
  return Response.json({ status: "ok" });
}
