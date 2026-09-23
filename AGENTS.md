# AGENTS.md

> El único mecanismo con el que una app web trabaja con usuarios de SolvorX. Backend:
> `../sx-management-service` (SXMS) -no se toca desde acá. Frontends hermanos: `../sx-account-web`,
> `../sx-identity-web`.
>
> Leer el §2 antes de tocar `core/`, `oauth/` o `session/`.

---

## 1. Stack

TypeScript `strict` + `noUncheckedIndexedAccess` · **cero dependencias de runtime** (`fetch` + Web
Crypto + `navigator.locks` + `BroadcastChannel`, todo nativo) · Custom Elements con Shadow DOM para
la UI · tsup (build) · Vitest + jsdom (tests) · oxlint · pnpm.

`any` está prohibido. Archivos en kebab-case, solo named exports (nada de `default`), `interface`
para objetos y `type` para uniones. Comentarios en español rioplatense que explican **por qué**, no
qué -acá importa más que en cualquier otro repo del monorepo, porque lo van a leer integradores
externos que no tienen el contexto de SXMS.

---

## 2. Reglas que no son negociables

Vienen del backend o de la naturaleza del entorno (navegador de un tercero), no del gusto de nadie.
Romper cualquiera de estas produce bugs que no dan error, o agujeros de seguridad.

1. **El refresh se serializa con `navigator.locks`, con re-lectura del storage adentro del lock.**
   El refresh token rota en cada uso; reusar uno ya rotado dispara `REUSE_ATTACK` del lado de SXMS
   (`token.service.ts`) y revoca la sesión entera. `navigator.locks` está scopeado por **origen**,
   no por pestaña -es lo que lo hace comparable al lock de Redis de
   `sx-account-web/src/lib/auth/session-store.server.ts`, y no un mutex local que solo protegería
   contra llamadas concurrentes de una misma pestaña. Ver `session/refresh.ts`.
2. **El barril de navegador (`index.ts`) nunca manda `client_secret`.** Es para clientes
   **públicos**: mandar uno hace que SXMS responda `invalid_client`
   (`oauth-client.service.ts:authenticateClient`). La garantía ahí es PKCE, `S256` únicamente.
   `SolvorxClientOptions` (`config/options.ts`) no tiene ni puede tener un campo `clientSecret` -es
   lo que hace estructuralmente imposible que el secreto llegue a un bundle de cliente. El barril de
   **servidor** (`server/index.ts`, subpath `@solvorx/sx-tool-web/server`) es la única excepción: ahí
   `clientSecret` es un campo válido de `SolvorxServerClientOptions`, para el caso de un cliente
   confidencial con backend propio (ver `sx-account-web`, que lo usa). `scripts/check-package.mjs`
   verifica que el artefacto compilado del barril de navegador no exponga
   `createSolvorxServerClient` ni nada de esa superficie. Esta es la regla que más fácil se rompe sin
   querer: cualquier cambio que agregue `clientSecret` a `oauth/endpoints.ts` tiene que dejarlo
   opcional y sin usarlo desde `core/client.ts` ni `config/options.ts`.
3. **El `state` se compara antes de canjear el código**, nunca después. Es la única defensa contra
   que alguien inyecte un código ajeno en la sesión. Está en `core/client.ts#completeCallback`.
4. **El access token no se escribe en storage.** Vive en memoria de `session/refresh.ts`. En
   `storage` (`localStorage` por default) va solo el refresh token; el `code_verifier` + `state` de
   la transacción PKCE van en `sessionStorage`, borrados al consumirse.
5. **`revoke` solo acepta access tokens.** SXMS exige `tType === 'access'` al decodificar
   (`oauth.service.ts#decodeAccessToken`) y por RFC 7009 responde 200 igual ante un token inválido:
   mandarle el refresh token es un no-op silencioso que deja la sesión de proyecto viva.
6. **`redirect_uri` se compara byte a byte** en SXMS. Una barra final de más es otra URI. No se
   normaliza acá -si se normalizara, cualquier discrepancia quedaría escondida hasta production.
7. **Nunca hardcodear TTLs.** SXMS documenta `expires_in: 900` en el Swagger pero el valor
   configurado real es 600. Leer siempre `expires_in` de la respuesta (`session/refresh.ts`,
   `core/client.ts`).
8. **`BroadcastChannel` avisa a otras pestañas de esta misma app** al refrescar y al desloguear, para
   que no disparen su propio refresh ni queden mostrando una sesión muerta. No cubre otras apps ni
   otros orígenes -eso es SSO del lado del servidor, y su propagación instantánea está fuera de
   alcance (ver el README).
9. **`decode` sin verificar firma está bien en `oauth/claims.ts`, y tiene que seguir estándolo**:
   solo se leen `exp` y `sid`, nunca para autorizar. Autorizar con un claim del cliente sería confiar
   en un valor que cualquiera reescribe en las devtools. Quien autoriza de verdad es SXMS, contra el
   JWKS.
10. **`consumeTransaction()` es sincrónico y de un solo uso a propósito.** Es lo que protege
    `init()` contra el doble montaje de efectos de React StrictMode sin necesitar `useQuery` ni
    ninguna otra dependencia de framework: todo lo que pasa antes del primer `await` en
    `completeCallback` -consumir la transacción, limpiar la URL con `replaceState`- es sincrónico, así
    que una segunda llamada a `init()` ya no encuentra callback que resolver. Ver el test
    correspondiente en `core/client.test.ts`.
11. **El paquete es `sideEffects: false`.** `registerSolvorxElements()` no se llama sola al
    importar `index.ts` -ni el registro de Custom Elements debe volver a ser un side effect de
    import, ni `customElements.define` debe ejecutarse en un módulo que un bundler pueda decidir
    tree-shakear igual. Es explícita también porque `customElements` no existe en SSR. Por la misma
    razón, `SxLoginButton` y `SxUserMenu` extienden `globalThis.HTMLElement ?? (class {} as unknown
    as typeof HTMLElement)`, no `HTMLElement` a secas -`class X extends HTMLElement` evalúa el
    identificador al definir la clase, así que *solo importar* el módulo en Node plano (sin jsdom:
    un route handler de Next.js que importa `createSolvorxClient` del mismo barril, por ejemplo)
    tira `ReferenceError` antes de llegar siquiera a la guarda de `registerSolvorxElements()`. Ver
    `scripts/check-package.mjs`, que es lo que lo detecta.

---

## 3. Estructura

```
src/
├── index.ts          # única superficie pública del barril de navegador
├── server/            index.ts (única superficie pública del barril `./server`, para clientes confidenciales)
├── config/           options.ts (normaliza y valida SolvorxClientOptions)
├── core/              client.ts (la máquina de estados + API pública + createSolvorxBffClient) · state.ts (store mínimo)
├── oauth/             pkce · endpoints (fetch contra /v1/public/oauth/*) · transaction · claims
├── session/           token-store (interfaz TokenStorage + 3 impls) · refresh (el lock) · sync (BroadcastChannel)
├── http/              request (fetch + unwrap de los dos formatos de respuesta) · error (SolvorxError)
└── ui/                login-button · user-menu (+ mountUserMenu, sección de tema opcional) · avatar · styles (CSS custom properties)
```

- `server/index.ts` no duplica lógica de OAuth: `createSolvorxServerClient` es una fachada delgada sobre
  `oauth/endpoints.ts` que agrega `clientSecret` al llamar. No toca DOM, storage ni cookies -eso es
  responsabilidad de la app que lo consume (ver `sx-account-web`). Reexporta lo que no depende de DOM
  (`pkce`, `sanitizeReturnTo`, `claims`, `SolvorxError` + predicados, los tipos) para no forzar a
  quien tiene un backend a importar del barril de navegador.

- `http/request.ts` tiene **dos** funciones porque SXMS tiene dos formatos de respuesta: `request()`
  desenvuelve el envelope de la casa (`{traceId, success, message, result}, hoy sin uso real -queda
  lista para las extensiones previstas contra `bff-account`); `requestRaw()` devuelve el cuerpo tal
  cual, que es lo que usa todo `/v1/public/oauth/*`.
- `oauth/endpoints.ts` es el único lugar que arma URLs y bodies de OAuth. No duplicar esa lógica en
  `core/client.ts`.
- `core/client.ts` es el único que orquesta: pkce + transaction + endpoints + refresh + sync + state.
  Los demás módulos no se conocen entre sí más de lo necesario -`session/refresh.ts` no sabe de
  `BroadcastChannel`, `session/sync.ts` no sabe de refresh. Si una extensión necesita que dos de
  estos módulos se hablen directamente, probablemente tiene que pasar por `client.ts`.
- `ui/user-menu.ts` tiene una sola función de render (`renderUserMenu`) que usan tanto la clase
  `SxUserMenu` como `mountUserMenu()`. No duplicar el armado del DOM entre las dos. La sección de
  tema (`part='theme'`, entre `account-link` y la salida global) solo se renderiza si se pasa la
  opción `theme` -sin ella el paquete sigue sirviendo a integraciones sin tema-. El menú se queda
  con el seleccionado internamente al clickear -no hace falta que la app vuelva a pisar la opción
  `theme` para reflejar el cambio, así que `mountUserMenu()` sigue devolviendo solo `() => void`.

## 4. Tests

`pnpm test`. Lo que hay que cubrir sí o sí -son los mismos seis puntos del plan original, más los de
`core/client.ts` que se sumaron al escribirlo:

- **La serialización del refresh** (`session/refresh.test.ts`). Es el riesgo número uno del paquete:
  dos renovaciones concurrentes desloguean a la persona. El test crítico es "dos llamadas
  concurrentes con el token vencido disparan un solo POST a `/token`".
- PKCE contra el vector del RFC 7636, Apéndice B (`oauth/pkce.test.ts`).
- `claims.ts`: nombres con acentos (regresión del bug de `atob`) y tokens malformados
  (`oauth/claims.test.ts`).
- Las tres implementaciones de `TokenStorage` cumplen el mismo contrato
  (`session/token-store.test.ts`).
- `transaction.ts`: un `state` que no coincide no debe canjear nada (`oauth/transaction.test.ts`).
- Los tres formatos de error (envelope, OAuth, sin respuesta) normalizan a `SolvorxError`
  (`http/error.test.ts`).
- `core/client.test.ts`: el flujo de callback completo (canje, limpieza de URL, `state` mismatch), la
  protección contra el doble montaje de StrictMode, y que `logout()` no rompe si el paso de SSO
  falla. `logout({ scope: 'here' })` no debe llamar a `ssoLogout`.
- `server/index.test.ts`: que `clientSecret` viaje en `exchangeCode`/`refreshTokens`/`revokeToken`
  cuando está configurado, y que no viaje cuando no lo está -es la superficie que existe
  específicamente para eso, así que es la que más falta que la cubra un test.
- `ui/user-menu.test.ts`: la única salida del menú llama a `logout({ scope: 'everywhere' })`, los
  labels custom pisan los defaults sin romper los que no se pisan, el foco entra al panel al abrir,
  y `createSolvorxBffClient` funciona como `SolvorxSessionSource` sin ningún token en el navegador
  (se stubea `fetch` global, nunca `oauth/endpoints.ts`).

Para mockear `../oauth/endpoints` en un test: `vi.mock('../oauth/endpoints', async (importOriginal)
=> ({ ...(await importOriginal()), exchangeCode: vi.fn(), ... }))`, para conservar `buildAuthorizeUrl`
real (es pura) y solo mockear lo que toca la red. `src/test/setup.ts` trae fakes mínimos de
`navigator.locks` y `BroadcastChannel` para jsdom, que no los implementa.

---

## 5. Lo que queda afuera, y por qué la API no lo bloquea

| Falta | Por qué no está | Cómo entra sin romper nada |
|---|---|---|
| Multi-cuenta (`listUser`, `changeAccount`) | SXMS impone una cuenta por navegador y devuelve `409 session_exists` ante una segunda | Métodos nuevos en `SolvorxClient` + un botón condicionado a `> 1` cuenta en `<sx-user-menu>`. Necesita antes trabajo de SXMS: cookie SSO multi-sesión, `prompt=select_account`, endpoint de cuentas del dispositivo |
| Logout instantáneo entre **apps** (no entre pestañas de una misma app, que sí es instantáneo vía `BroadcastChannel`) | `sx_sso` es `SameSite=Lax`; sin un canal push no hay forma de avisarle a otro origen | `session/sync.ts` ya está detrás de una interfaz `SessionWatcher` con una sola implementación hoy. Un transporte SSE entra como otra implementación, sin tocar `core/client.ts` |
| Logout cross-site completo (paso 2 de `logout()`) | La cookie SSO no viaja en un `fetch` cross-site | Backend: `GET /v1/public/oauth/logout` que honre `post_logout_redirect_uri` -la columna ya existe en `OAuthClient` y no la consume nadie- porque una navegación top-level sí manda cookies `Lax` |

**Hallazgo para no perder de vista:** SXMS le da al refresh token rotado 30 días frescos en cada
rotación (`token.service.ts:422`), una ventana deslizante e indefinida. El BCP de OAuth para apps de
navegador pide lo contrario -que la rotación no extienda el lifetime más allá del original. Es una
desviación real del estándar, del lado del backend; no hay nada que este paquete pueda hacer al
respecto.

---

## 6. Ramas y publicación

Las ramas largas son `main` (canal `latest`) y `beta` (canal `beta`), nada más: una librería no tiene
entornos sino versiones, así que no lleva `dev`/`prod` como las apps. Las ramas de feature salen de
`main`. La versión del `package.json` **es** el canal -`X.Y.Z` en `main`, `X.Y.Z-beta.N` en `beta`- y
`scripts/release-channel.mjs` frena el release si no coincide con la rama del commit, con el tag o con
la marca de pre-release. El flujo completo está en "Publicar" del README.

- **Nunca `pnpm publish` a mano.** Se publica creando un release en GitHub. Publicar desde una máquina
  se saltea el chequeo de canal, y lo publicado no queda atado a ningún commit: `0.5.0` salió así a
  npmjs, y ningún tag del repo dice de qué commit.
- **Después de cada estable, `main` se mergea a `beta`.** Si no, la próxima beta arranca de un código
  más viejo que lo publicado.

---

## 7. Referencias

| Qué | Dónde |
|---|---|
| Consumidor del barril `./server` (cliente confidencial + BFF) | `../sx-account-web`, vía `createSolvorxServerClient` (`src/lib/api/oauth.ts` antes de migrar) y `createSolvorxBffClient` (`src/layouts/app-layout.tsx`) |
| Cómo SXMS trabaja con este paquete | `../sx-management-service/docs/SX-TOOL-WEB.md` |
| Convenciones del backend sobre OAuth | `../sx-management-service/docs/integration/01-console.md` (clientes OAuth), `docs/integration/03-frontend.md` |
| Cliente OAuth de prueba (ya seedeado) | `sx-console-web`, público, PKCE, `redirect_uri = http://localhost:3002/callback` -ver `../sx-management-service/prisma/seed.ts` |
| Swagger de los endpoints usados | `http://localhost:9000/documentation/public` (una vez con SXMS corriendo) |
