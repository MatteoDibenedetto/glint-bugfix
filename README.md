# glint. Bug Fix Portal

Piattaforma per i clienti Glint per richiedere fix al tema Shopify. L'AI (Claude) genera automaticamente la proposta di fix; il team tech revisionata e approva; il fix viene deployato su un tema di staging.

---

## Stack

- **Next.js 15** (App Router) — hosting su Vercel
- **Supabase** — database PostgreSQL + Auth
- **Anthropic Claude** — generazione automatica del fix
- **Shopify Admin API** — accesso e modifica ai file del tema
- **Resend** — notifiche email

---

## Setup

### 1. Clona e installa

```bash
npm install
```

### 2. Variabili d'ambiente

Copia `.env.example` in `.env.local` e compila tutti i valori:

```bash
cp .env.example .env.local
```

| Variabile | Come ottenerla |
|-----------|---------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API |
| `SHOPIFY_API_KEY` | Shopify Partners → App → API key |
| `SHOPIFY_API_SECRET` | Shopify Partners → App → API secret key |
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `RESEND_API_KEY` | resend.com → API Keys |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` in dev, URL produzione in prod |

### 3. Supabase

1. Crea un nuovo progetto su [supabase.com](https://supabase.com)
2. Vai su **SQL Editor** e incolla il contenuto di `supabase/migrations/001_initial.sql`
3. Esegui la migration

### 4. Shopify App

1. Vai su [partners.shopify.com](https://partners.shopify.com)
2. Crea una nuova app → tipo **Custom app** o **Public app**
3. In **App setup** → **URLs**:
   - App URL: `https://your-domain.vercel.app`
   - Allowed redirection URLs: `https://your-domain.vercel.app/api/shopify/callback`
4. Scopes richiesti: `read_themes`, `write_themes`
5. Copia API key e API secret in `.env.local`

### 5. Imposta il primo admin

Dopo il primo login con il tuo account Shopify, vai su Supabase → **Table Editor** → `profiles` e aggiorna il tuo `role` da `client` a `admin`.

Da quel momento puoi gestire tutti i ruoli direttamente da `/admin/staff`.

### 6. Avvia in sviluppo

```bash
npm run dev
```

---

## Architettura

```
app/
├── page.tsx                     # Landing + login Shopify
├── dashboard/                   # Area clienti
│   ├── page.tsx                 # Lista richieste
│   ├── new/page.tsx             # Nuova richiesta
│   └── request/[id]/page.tsx   # Dettaglio richiesta
├── admin/                       # Area staff
│   ├── page.tsx                 # Overview + stats
│   ├── requests/                # Lista e dettaglio richieste
│   │   └── [id]/                # Review + approve + deploy
│   ├── staff/page.tsx           # Gestione ruoli
│   └── stores/page.tsx          # Assegna store manager
└── api/
    ├── shopify/auth             # Avvio OAuth Shopify
    ├── shopify/callback         # Callback OAuth + creazione utente
    ├── requests/                # CRUD richieste
    │   └── [id]/
    │       ├── generate-fix     # Chiama Claude, notifica dev
    │       └── deploy           # Push su staging theme
    └── admin/
        ├── staff                # Gestione ruoli
        └── stores               # Assegna store manager
```

## Flusso completo

1. **Cliente** accede con OAuth Shopify → profilo creato automaticamente
2. **Cliente** compila il form (nome, cognome, email, store, descrizione)
3. **Dev/Admin** apre la richiesta → clicca "Genera fix con Claude"
4. **Claude** analizza i file del tema, classifica frontend/backend, genera il diff
5. Dev assegnato viene notificato via email; anche lo store manager
6. **Dev** revisiona il diff, può modificare, approva o richiede chiarimenti
7. All'approvazione, **deploy** su tema di staging via Shopify Admin API
8. **Cliente** e store manager ricevono email con link al tema di staging
9. **Cliente** testa e pubblica manualmente da Shopify Admin

## Deploy su Vercel

```bash
vercel --prod
```

Ricorda di aggiungere tutte le variabili d'ambiente nel progetto Vercel
(Settings → Environment Variables).
