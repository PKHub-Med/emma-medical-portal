# Emma Medical Portal API

Minimalny backend NestJS dla Emma Medical Portal, przygotowany do uruchomienia na Node.js 22 i wdrożenia na Railway.

## Wymagania

- Node.js 22
- npm

## Uruchomienie lokalne

```bash
npm install
npm run start:dev
```

Domyślnie API jest dostępne pod adresem `http://localhost:3000`. Port można zmienić przez zmienną środowiskową `PORT`.

## Dostępne polecenia

```bash
npm run build
npm run start
npm run start:dev
npm run test
```

## Health check

`GET /health`

```json
{
  "status": "ok",
  "service": "emma-api"
}
```

## Railway

Projekt deklaruje Node.js 22 w polu `engines`. Railway może użyć:

- build command: `npm run build`
- start command: `npm run start`

Aplikacja nasłuchuje na hoście `0.0.0.0` i porcie przekazanym w zmiennej `PORT`.
