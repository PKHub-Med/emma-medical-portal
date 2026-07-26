# Emma Medical Portal API

Minimalny backend NestJS dla Emma Medical Portal, przygotowany do uruchomienia na Node.js 22 i wdrożenia na Railway.

## Wymagania

- Node.js 22
- npm
- PostgreSQL

## Uruchomienie lokalne

```bash
npm install
npm run prisma:generate
npm run start:dev
```

Skopiuj `.env.example` do `.env` i ustaw `DATABASE_URL` na adres połączenia PostgreSQL. Domyślnie API jest dostępne pod adresem `http://localhost:3000`. Port można zmienić przez zmienną środowiskową `PORT`.

## Dostępne polecenia

```bash
npm run build
npm run start
npm run start:dev
npm run test
npm run prisma:generate
npm run prisma:migrate:deploy
```

## Health check

`GET /health`

```json
{
  "status": "ok",
  "service": "emma-api"
}
```

`GET /health/db` wykonuje zapytanie `SELECT 1` i przy dostępnym PostgreSQL zwraca:

```json
{
  "status": "ok",
  "service": "emma-api",
  "database": "connected"
}
```

Przy niedostępnej bazie endpoint zwraca HTTP 503 bez ujawniania danych połączenia.

## Uwierzytelnianie

API udostępnia podstawowe uwierzytelnianie sesyjne:

- `POST /auth/login` — logowanie e-mailem i hasłem,
- `POST /auth/logout` — unieważnienie bieżącej sesji,
- `GET /me` — profil zalogowanego użytkownika i jego membershipy.

Sesja jest przechowywana w cookie `emma_session`. W bazie zapisywany jest wyłącznie hash SHA-256 tokenu, a hasła są hashowane algorytmem Argon2id.

Administratora systemowego można utworzyć poleceniem:

```bash
npm run admin:create -- --email=admin@example.com --password="bezpieczne-haslo"
```

Komenda nie nadpisuje istniejącego użytkownika. Przed jej uruchomieniem musi być ustawiona zmienna `DATABASE_URL`.

## Frontend

Minimalna aplikacja React znajduje się w `apps/web`. Przed uruchomieniem ustaw `VITE_API_URL` na publiczny adres backendu Emma.

```bash
npm run web:dev
npm run web:build
npm run web:test
```

Frontend udostępnia trasy `/login` i `/app`. Wszystkie wywołania API korzystają z cookies przez `credentials: "include"`.

## Railway

Projekt deklaruje Node.js 22 w polu `engines`. Railway może użyć:

- build command: `npm run build`
- start command: `npm run start`

Aplikacja nasłuchuje na hoście `0.0.0.0` i porcie przekazanym w zmiennej `PORT`. Połączenie z PostgreSQL korzysta wyłącznie ze zmiennej `DATABASE_URL`.
