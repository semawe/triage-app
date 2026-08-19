"use client";

import { useEffect, useRef } from "react";

/**
 * Transmet le décalage horaire du navigateur avec le formulaire.
 *
 * `<input type="datetime-local">` n'envoie que des composantes murales — « 2026-08-19
 * à 14:00 » — sans dire dans quel fuseau. Le serveur les interprétait donc dans le
 * SIEN : un participant hors du fuseau du serveur enregistrait un autre instant que
 * celui qu'il avait saisi (revue adverse du 18/08/2026).
 *
 * La valeur est celle de `getTimezoneOffset()` : les minutes à ajouter à l'heure
 * locale pour obtenir UTC. Elle est écrite dans le DOM plutôt que dans un état React
 * — c'est bien un système extérieur qu'on synchronise, et un `setState` dans l'effet
 * ne servirait qu'à provoquer un rendu de plus.
 *
 * Elle n'est posée qu'après hydratation ; un formulaire soumis avant retombe sur le
 * fuseau du serveur, c'est-à-dire sur le comportement d'avant — une dégradation,
 * pas une régression.
 */
export default function DecalageHoraire() {
  const champ = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (champ.current) champ.current.value = String(new Date().getTimezoneOffset());
  }, []);

  return <input ref={champ} type="hidden" name="tzOffset" defaultValue="" />;
}
