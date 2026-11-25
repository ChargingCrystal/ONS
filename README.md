# Ons · Couple Planner

Nuxt 3 mit Nitro-API und Supabase (Postgres, Auth, privater Storage). Alle Zugriffe laufen mit dem Token des angemeldeten Partners und den Row-Level-Security-Regeln der Datenbank.

## Lokal starten

Node 22.12 oder neuer, Docker und Supabase CLI installieren. Im Repository:

```sh
npm ci
supabase start
supabase migration up --local
cp .env.example .env
```

Den von `supabase status` ausgegebenen Publishable- bzw. anon-Key in `NUXT_PUBLIC_SUPABASE_KEY` eintragen. Mit `npm run dev` starten. Der lokale Auth-Dienst erlaubt Testkonten ohne Bestätigungsmail. Die Startseite verlinkt den Healthcheck.

Alternativ beide SQL-Migrationen in numerischer Reihenfolge im SQL Editor eines neuen Supabase-Projekts ausführen und dessen URL und öffentlichen Schlüssel eintragen. Für Vercel dieselben zwei Variablen konfigurieren, die HTTPS-Adresse in Supabase unter Auth → URL Configuration freigeben und E-Mail-Bestätigung für öffentliche Registrierungen aktivieren. Für Google-Login den Google-Provider mit Client-ID und Secret im Supabase-Dashboard aktivieren und die dort angezeigte Callback-URL in der Google-Konsole hinterlegen.

## Auth und Demoablauf

Das Nuxt-Client-Plugin stellt den Supabase-Client als `useNuxtApp().$supabase` bereit. Registrierung über `auth.signUp({ email, password })`, Login über `auth.signInWithPassword({ email, password })`, Google über `auth.signInWithOAuth({ provider: 'google' })`, Logout über `auth.signOut()`. Supabase Auth übernimmt Passwortverarbeitung, Session-Erneuerung und Auth-Rate-Limits. Für jeden Nitro-Aufruf den aktuellen Access Token als `Authorization: Bearer <access_token>` senden.

Für einen lokalen Durchlauf ohne Frontend in Bash (curl und jq):

```sh
source .env
signup() {
  curl -fsS "$NUXT_PUBLIC_SUPABASE_URL/auth/v1/signup" -H "apikey: $NUXT_PUBLIC_SUPABASE_KEY" \
    -H 'Content-Type: application/json' -d "$(jq -nc --arg email "$1" '{email:$email,password:"Ons-local-demo-2026!"}')" | jq -er .access_token
}
A=$(signup "a-$(date +%s)@example.org")
B=$(signup "b-$(date +%s)@example.org")
api() {
  local token="$1" route="$2"
  shift 2
  curl -fsS "http://localhost:3000/api/$route" -H "Authorization: Bearer $token" -H 'Content-Type: application/json' "$@"
}
api "$A" space -X POST
CODE=$(api "$A" space | jq -r .invite)
api "$B" space/join -d "$(jq -nc --arg code "$CODE" '{code:$code}')"
api "$A" dates -d '{"title":"Kinoabend","category":"cinema","meeting_at":"2027-01-15T18:00:00Z"}'
api "$B" dates
api "$B" dashboard
```

## API

| Methode und Pfad unter /api | Inhalt |
| --- | --- |
| GET /health | Prozessstatus, ohne Login |
| GET /space | Eigener Raum, Mitglieder und offener Einladungscode, sonst null |
| POST /space · POST /space/join | Raum anlegen oder mit JSON-Feld code beitreten. Ein Konto pro Person, maximal zwei Mitglieder. Beitritt verbraucht den Code. |
| POST /dates | title, category, optional status (planned/done) und meeting_at (ISO-Zeit mit Zeitzone oder null) |
| GET /dates | q (Titelsuche), category, status, sort (created_at/title/meeting_at), order (asc/desc), offset. 50 Ideen je Seite. |
| PATCH /dates/:id · DELETE /dates/:id | Gemeinsame Idee ändern oder löschen |
| PUT /location | Eigenen Standort als lat und lon setzen |
| GET /location | Standorte, Luftlinie in km und geografischer Mittelpunkt. Fehlende Werte werden als null geliefert. |
| GET /dashboard | Nächstes geplantes Treffen, Serverzeit für den Countdown und Anzahl der Ideen nach Erstellmonat (UTC) und Kategorie |
| POST /photos | Bild als binären Request-Body senden. Content-Type image/jpeg, image/png oder image/webp, maximal 5 MiB (Hosting-Limit kann niedriger liegen). |
| GET /photos | Neueste Uploads zuerst, 30 pro Seite, optional offset. Bild-URLs sind fünf Minuten gültig. |
| DELETE /photos/:name | Foto anhand des von der Galerie gelieferten Namens löschen |

## Prüfung

`npm test` prüft die erste Migration in eingebettetem Postgres mit simulierten Supabase-Identitäten. `npm run build` erstellt den Nitro-Produktionsbuild. Der Datenbanktest deckt Einmalcode, Raumgrenze, gemeinsam sichtbare Termine, Standortbesitz und die Trennung fremder Räume ab. Für einen vollständigen Integrationstest werden laufende Auth- und Storage-Dienste benötigt.
