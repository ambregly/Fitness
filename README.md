# Suivi de sèche — app iPad et iPhone

Web‑app installable sur iPad et iPhone (PWA) : elle s’ouvre en plein écran depuis l’écran d’accueil et fonctionne hors ligne. Sans compte, les données restent sur l’appareil ; avec un **compte** (Firebase, gratuit), chaque personne retrouve tout son historique sur n’importe quel appareil, synchronisé en temps réel.

En haut de chaque écran : **↶ Annuler** la dernière action, **journal des actions** (revenir à l’état d’avant n’importe quelle action) et **compte / réglages**.

## Onglets

**Sport**
- *Séance* : la séance du jour est choisie automatiquement selon le jour de la semaine. Programme par défaut, avec un jour de repos entre les séances jambes : lundi fessiers, mercredi quadriceps / pectoraux / épaules, vendredi dos, samedi fessiers / abdos. Pour chaque exercice : objectif calculé (charge × répétitions), rappel de la dernière séance, saisie poids / reps par série, validation ✓.
- Alertes à l’ouverture : séances manquées depuis 14 jours (avec « faire aujourd’hui » ou « saisir après coup »), pesée trop ancienne, repas de la veille non saisis.
- *Cardio* : natation, vélo d’appartement, vélo de route, course lente… durée, distance, FC, calories (estimées automatiquement si vides).
- *Programme* : les exercices et le nombre de séries de chaque jour.
- *Exercices* : banque d’environ 60 exercices classés par catégorie (Fessiers, Quadriceps, Ischios, Dos…), avec fourchette de répétitions et incrément de charge réglables ; ajout d’exercices perso.

**Repas**
- *Journée* : petit‑déjeuner, déjeuner, collation, dîner (+ repas ajoutables), totaux kcal / protéines / glucides / lipides / fibres comparés aux objectifs, copie de la veille.
- *Recettes* : calculateur de macros ; ex. 50 g de farine → kcal, protéines, glucides, sucres, lipides, AGS, fibres, sel, calculés automatiquement. Totaux, par portion et pour 100 g (cuit si le poids cuit est indiqué).
- *Aliments* : ~110 aliments de base (valeurs Ciqual / USDA pour 100 g), ajout manuel, recherche en ligne dans Open Food Facts (nom ou code‑barres).

**Suivi**
- *Poids* : pesée du jour, courbe jour par jour (sans moyenne) par semaine / 3 mois / 6 mois / 1 an, avec flèches ou glissement du doigt pour passer à la période précédente / suivante ; évolution et rythme de perte sur la période.
- *Calories* : calories ingérées jour après jour (barres + objectif), mêmes périodes et défilement, tableau jour par jour (kcal, écart à l’objectif, P / G / L, dépense cardio).
- *Progression* : pour chaque exercice, prochain objectif, courbe du 1RM estimé et de la charge, historique des séries.
- *Historique* : tout ce qui a été saisi, jour par jour (séances avec chaque série, cardio, pesées, repas), filtrable, avec export CSV pour Numbers / Excel.
- *Calendrier* : muscu faite / manquée, cardio, pesées, repas saisis.
- *Réglages* (icône personne en haut) : compte, objectifs nutritionnels, calculateur de sèche (Mifflin‑St Jeor), règle de progression, export / import de sauvegarde.

## Surcharge progressive

Double progression : on garde la charge et on ajoute des répétitions jusqu’au haut de la fourchette, puis on augmente la charge. Exemple hip thrust (6–10 reps, +5 kg) : 120×8 → 120×9 → 120×10 → 125×8 (ou 130×6 avec un incrément de 10 kg). Méthode et sources (ACSM 2009, NSCA, Plotkin 2022, Schoenfeld 2021, Helms 2014) : [`docs/surcharge-progressive.html`](docs/surcharge-progressive.html).

## Installer sur l’iPad et l’iPhone

1. Sur GitHub : **Settings → Pages → Build and deployment → Source : GitHub Actions**. Le workflow `.github/workflows/pages.yml` publie l’app à chaque push, à l’adresse `https://ambregly.github.io/Fitness/`.
2. Sur l’iPad (et/ou l’iPhone), ouvre cette adresse dans **Safari**, touche **Partager → Sur l’écran d’accueil**.
3. Lance l’app depuis l’icône « Sèche ». Elle marche ensuite hors ligne.

⚠️ Les données sont stockées sur chaque appareil. Utilise **Suivi › Réglages › Exporter** régulièrement (enregistre le fichier dans iCloud Drive).

**Passer de l’iPhone à l’iPad (ou l’inverse)** : Exporter sur un appareil → iCloud Drive → sur l’autre, Importer puis **Fusionner**. La fusion ajoute sans rien effacer (séances, cardio, pesées, repas, recettes).

## Comptes (connexion)

À activer une fois : voir [`docs/compte.html`](docs/compte.html) (projet Firebase gratuit, puis coller la configuration dans `js/firebase-config.js`). Tant que ce n’est pas fait, l’app fonctionne sans compte.

Fonctionnement : les données sont découpées en blocs (réglages, pesées, cardio, séances par année, repas par mois) stockés dans `users/{uid}/chunks/…` ; les règles `firestore.rules` limitent chaque compte à ses propres données. Chaque envoi est une transaction : si un autre appareil a modifié le même bloc entre‑temps, les deux versions sont fusionnées au lieu d’être écrasées.

## Notifications (rappels)

Rappels de repas à compléter, de séance non faite et de pesée (tous les 5 jours, puis chaque semaine quand la progression est bonne), envoyés en Web Push sur l’iPhone / l’iPad (app installée, iOS 16.4+). Une tâche GitHub Actions (`.github/workflows/notifications.yml`) tourne toutes les heures : `tools/notify/notify.mjs` relit les données de chaque compte abonné et utilise la même logique que l’app (`js/reminders.js`). Configuration (2 secrets GitHub) : [`docs/notifications.html`](docs/notifications.html).

## Développement

Aucune dépendance ni étape de build : HTML, CSS et JavaScript (modules ES).

```sh
python3 -m http.server 8000   # puis http://localhost:8000
```

Après une modification, incrémente `VERSION` dans `sw.js` pour que les appareils récupèrent la nouvelle version.

Firebase est embarqué dans `js/vendor/firebase.js` (reconstruit avec `tools/build-firebase.sh`). Pour tester les comptes en local avec les émulateurs Firebase :

```sh
npx firebase-tools emulators:start --only auth,firestore --project demo-seche
# puis http://localhost:8000/?emulator
```
