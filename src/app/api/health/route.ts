export const dynamic = "force-dynamic";

// Sonde de disponibilité du processus, interrogée par le déploiement bleu/vert :
// la nouvelle instance ne reçoit le trafic qu'une fois cette route en 200, ce qui
// supprime la fenêtre de 502.
//
// Volontairement sans accès à la base : la question posée est « ce processus
// sert-il des requêtes ? », pas « la base est-elle debout ? ». Les lier ferait
// échouer le déploiement du correctif au moment précis où la base va mal.
//
// `app` n'est pas décoratif. La sonde ne répondait que `{"status":"ok"}`, donc
// elle disait qu'une application vivait sur ce port — jamais laquelle. Le
// 18/08/2026, une application voisine avait pris l'un des deux ports du
// bleu/vert ; elle a répondu 200 à la sonde, le proxy a basculé vers elle, et
// triapp.fr a servi cette autre application pendant que Triapp partait hors
// ligne, avec « Deploy OK » au journal. Le script de déploiement exige
// désormais ce champ avant de basculer le proxy : ne pas le retirer.
export function GET() {
  return Response.json({ status: "ok", app: "triage-app" });
}
