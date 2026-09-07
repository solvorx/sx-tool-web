# @solvorx/sx-tool-web

Integración de identidad de SolvorX para apps web: login, sesión persistente, datos del usuario y
logout contra `sx-management-service` (SXMS), sin volver a escribir PKCE. Cliente público para apps
sin backend propio, y cliente confidencial (subpath `./server`) para apps que sí lo tienen.

TypeScript vanilla, **cero dependencias de runtime**. Funciona desde JS plano, React, Vue o Angular.

---

## Instalación

```bash
pnpm add @solvorx/sx-tool-web
```

Para desarrollar contra el repo clonado como hermano del tuyo, sin esperar a un publish -requiere
buildear antes: el `exports` del paquete apunta a `dist/`, que no viaja en git:

```bash
cd ../sx-tool-web && pnpm install && pnpm build
pnpm add ../sx-tool-web
```

## Quickstart

```ts
import { createSolvorxClient, registerSolvorxElements } from '@solvorx/sx-tool-web'

// createSolvorxClient() SIEMPRE antes de registerSolvorxElements(), no al revés: si <sx-login-button>
// o <sx-user-menu> ya están en el HTML (JS plano, sin framework), definir el Custom Element los hace
// "upgrade" en el momento -sincrónico- y su connectedCallback busca el cliente default ahí mismo. Si
// todavía no existe ninguno, el componente se bindea a `null`, queda oculto, y no hay una segunda
// oportunidad: connectedCallback no se vuelve a disparar solo. Con React/Vue/Angular el orden importa
// menos -el framework crea el markup recién cuando renderiza, después de que este módulo ya corrió-,
// pero el orden de abajo es el que funciona siempre.
export const sx = createSolvorxClient({
  issuer: 'https://auth.solvorx.com',
  clientId: '<tu client_id>',
  redirectUri: 'https://tu-app.com/callback', // debe coincidir byte a byte con la registrada
})

registerSolvorxElements() // registra <sx-login-button> y <sx-user-menu>

await sx.init() // resuelve el callback si estamos en él; si no, rehidrata la sesión guardada
```

```html
<sx-login-button>Iniciar sesión</sx-login-button>
<sx-user-menu></sx-user-menu>
```

Cada componente se oculta solo cuando no corresponde mostrarlo: `<sx-login-button>` solo aparece si
`status === 'unauthenticated'`, `<sx-user-menu>` solo si `status === 'authenticated'`. No hace falta
condicionarlos desde afuera.

Para pedir datos a tu propia API:

```ts
const token = await sx.getAccessToken() // renueva si hace falta, serializado
fetch('/api/lo-que-sea', { headers: { Authorization: `Bearer ${token}` } })
```

---

## `createSolvorxClient(options)`

| Opción | Requerida | Default | Notas |
|---|---|---|---|
| `issuer` | sí | — | Base de SXMS, p. ej. `https://auth.solvorx.com`. Sin slash final. |
| `clientId` | sí | — | `client_id` del cliente OAuth **público** registrado en SXMS. |
| `redirectUri` | sí | — | Debe coincidir **byte a byte** con una `redirect_uri` registrada. Una barra final de más es otra URI y el backend la rechaza. |
| `scopes` | no | `['openid', 'profile', 'email']` | |
| `accountUrl` | no | `https://account.solvorx.com` | Destino del botón "Mi cuenta" de `<sx-user-menu>`. |
| `storage` | no | `'localStorage'` | `'localStorage' \| 'sessionStorage' \| 'memory'` o una implementación propia de `TokenStorage`. Ver la sección de abajo. |

### API del cliente

```ts
await sx.init()              // único punto de entrada async: resuelve callback, rehidrata, o queda unauthenticated
sx.login({ returnTo, prompt }) // redirect top-level a /authorize. prompt: 'login' fuerza reautenticación
sx.currentUser()             // SessionUser | null, sincrónico
sx.getStatus()                // 'loading' | 'authenticated' | 'unauthenticated'
await sx.getAccessToken()    // token vigente; renueva bajo lock si hace falta
await sx.logout()
sx.subscribe((status, user) => { ... }) // devuelve función para desuscribirse
```

`init()` es el único punto de entrada asíncrono. Si la URL trae `code`+`state`, valida el `state`
**antes** de canjear el código (única defensa contra que alguien inyecte un código ajeno en la
sesión) y limpia la URL con `history.replaceState`. Si no, y hay un refresh token guardado,
rehidrata. Si no hay ninguno, queda `unauthenticated` sin lanzar. Cualquier otro error (red caída,
`state` que no coincide, el proveedor rechazó el login) sí se propaga desde `init()`.

`getAccessToken()` lanza `SolvorxError` con `code: 'client/no-session'` si no hay sesión utilizable
-usalo para decidir cuándo mandar a `login()`. Ver los predicados (`isSessionMissing`,
`isUnauthorized`, `isRateLimited`, `isForbidden`) para ramificar sobre cualquier error del paquete.

---

## Dónde viven los tokens

- **Access token: siempre en memoria.** Nunca en storage ni en cookie. Dura 600 segundos; no hace
  falta persistirlo.
- **Refresh token: en `storage` (`localStorage` por default), detrás de una interfaz
  `TokenStorage`.**
- **`code_verifier` + `state` de la transacción PKCE: en `sessionStorage`**, borrados al consumirse.

### Por qué `localStorage` y no `sessionStorage`

SXMS **rota** el refresh token en cada uso y revoca la sesión entera si detecta uno ya rotado
reusado (`REUSE_ATTACK`) -es el control que el
[BCP de OAuth para apps de navegador](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-browser-based-apps)
exige para clientes públicos, y ya está del lado del servidor.

Con `sessionStorage`, cada pestaña abre su propia sesión de proyecto -el tope es 5 por
usuario+proyecto, así que la sexta pestaña le hace revocar la más vieja al backend, un bug de UX
garantizado. Con `localStorage` hay una sola sesión por app sin importar cuántas pestañas haya
abiertas, y recargar la página no dispara un redirect completo.

El costo es real, sin adornos: **un XSS se lleva la sesión.** El propio BCP lo dice sin vueltas:
*"There are no practical security mechanisms for frontend applications that counter this attack
scenario."* Por eso `storage` es configurable. Si tu app puede pagar un backend propio, el patrón
superior es un BFF que guarde el refresh token server-side -y ese patrón también es este paquete,
por el subpath `@solvorx/sx-tool-web/server` (ver la sección de abajo). No es un "hacelo vos": es
el tier que corresponde si el riesgo de XSS no es aceptable para tu caso, y es lo que usa
`sx-account-web` en este mismo monorepo.

El refresh se serializa con `navigator.locks`, scopeado por origen y compartido entre todas las
pestañas -no un mutex de una sola pestaña-, con re-lectura del storage adentro del lock antes de
llamar a la red. Sin esto, dos renovaciones concurrentes con el mismo refresh token rotado
desloguearían gente al azar.

---

## Apps con backend propio (`/server`)

Todo lo de arriba -`createSolvorxClient`, `storage`, el riesgo de XSS- es para clientes OAuth
**públicos**: PKCE, sin `client_secret`, tokens en el navegador. Si tu app tiene un backend propio y
es un cliente **confidencial** registrado con `client_secret` en SXMS, usá el subpath de servidor en
vez de pelear con el barril de navegador:

```ts
// Server-only. No importar esto desde un Client Component ni desde nada que
// termine en el bundle del navegador -client_secret vive acá y en ningún otro lado.
import { createSolvorxServerClient } from '@solvorx/sx-tool-web/server'

const sx = createSolvorxServerClient({
  issuer: process.env.SXMS_BASE_URL!,
  clientId: process.env.OAUTH_CLIENT_ID!,
  clientSecret: process.env.OAUTH_CLIENT_SECRET!, // omitilo si tu backend es un cliente público
  redirectUri: process.env.OAUTH_REDIRECT_URI!,
})

const url = sx.buildAuthorizeUrl({ state, codeChallenge })
const tokens = await sx.exchangeCode({ code, codeVerifier })
const fresh = await sx.refreshTokens(refreshToken)
await sx.revokeToken(accessToken)
const user = await sx.userinfo(accessToken)
```

`createSolvorxServerClient` arma URLs y hace los mismos `fetch` que el barril de navegador -mismo
`oauth/endpoints.ts` por dentro-, con `client_secret` en el body cuando lo configurás. No toca DOM,
storage ni cookies: dónde guardás la sesión (Redis, una cookie firmada, lo que sea), el lock de
refresh entre requests concurrentes, y las cookies HTTP-only son responsabilidad de tu app, no de
este paquete. `sx-account-web` (`src/lib/auth/`, `src/lib/api/oauth.ts` antes de migrar) es el
ejemplo real: Redis para la sesión, un lock distribuido para el refresh, cookies `__Host-*`.

El subpath también reexporta lo que no depende de DOM y sirve tanto del lado del servidor como del
navegador: `createCodeVerifier`/`createState`/`deriveCodeChallenge` (PKCE), `sanitizeReturnTo`,
`readAccessTokenClaims`, `SolvorxError` + los predicados (`isForbidden`, `isRateLimited`,
`isSessionMissing`, `isUnauthorized`), y los tipos `TokenResponse`/`UserInfo`/`AccessTokenClaims`/`SessionUser`.

### El tipo `SessionUser`

`sx.currentUser()`, el segundo argumento de `sx.subscribe()` y el `user` de `createSolvorxBffClient`
tipan como `SessionUser | null`, no `UserInfo | null`. `SessionUser` (`src/core/state.ts`) es un
subconjunto estructural de `UserInfo` (`sub`, `name`, `preferred_username`, `email`, `picture?`): es
lo único que `<sx-user-menu>` de verdad lee. Como cualquier `UserInfo` satisface `SessionUser` sin
cambios, un BFF que ya resuelve la sesión con `readAccessTokenClaims()` no necesita inventar un
`project` falso ni pagar un `userinfo()` extra por render solo para tipar `user` -y por la misma
razón, anotar estos valores como `UserInfo | null` en vez de `SessionUser | null` compila igual sin
avisar del error.

### `<sx-user-menu>` sin tokens en el navegador

Una app con BFF no tiene un access token en el cliente para pasarle a `createSolvorxClient()`, pero
igual puede usar `<sx-user-menu>`: `createSolvorxBffClient()` (en el barril de **navegador**, no en
`/server`) arma la misma interfaz que consume el componente a partir del usuario ya resuelto por tu
Server Component, sin manejar ningún token:

```ts
import { createSolvorxBffClient, registerSolvorxElements } from '@solvorx/sx-tool-web'

const sx = createSolvorxBffClient({
  user, // SessionUser | null, hidratado por tu Server Component -ya pasó por requireSession() o el equivalente
  accountUrl: '/profile',
  logoutUrl: '/api/auth/logout', // tu endpoint: recibe { scope }, revoca los tokens y borra tu cookie/sesión
})

registerSolvorxElements()
document.querySelector('sx-user-menu').client = sx
```

`logout()` -y el botón de cerrar sesión del menú, que siempre es global- le pega **solo** a
`logoutUrl`, con `{ scope }` en el cuerpo; nunca ve un refresh token, porque nunca lo tuvo. El cierre
de la sesión SSO lo hace tu BFF con el access token que tiene guardado: ver
[El logout ya no depende de la cookie](#el-logout-ya-no-depende-de-la-cookie).

---

## Componentes

```html
<sx-login-button return-to="/dashboard" prompt="login">Entrar</sx-login-button>
<sx-user-menu></sx-user-menu>
```

Ambos toman el cliente del último `createSolvorxClient()` llamado, o de la propiedad `.client` si
se la asignás a mano:

```ts
document.querySelector('sx-user-menu').client = sx
```

`<sx-user-menu>` muestra foto de perfil (con iniciales de respaldo si la URL está rota), nombre,
email y username, un link a "Mi cuenta" (`accountUrl`) y un botón de cerrar sesión. **No** tiene
botón de cambio de cuenta -SXMS impone hoy una cuenta por navegador.

Si preferís no registrar Custom Elements globales, `mountUserMenu(el, { client })` monta el mismo
menú en cualquier elemento y devuelve una función de desmontaje.

Theming por variables CSS (`--sx-color-primary`, `--sx-color-fg`, `--sx-radius`, etc. -ver
`src/ui/styles.ts` para la lista completa) y por `::part()` para lo que una variable no cubre:

```css
sx-login-button {
  --sx-color-primary: #111827;
}
sx-user-menu::part(trigger) {
  border: 1px solid #e5e7eb;
}
```

**Si tu marca es clara, seteá también `--sx-color-primary-ink`.** El color de marca cumple dos
roles con luminosidades opuestas: `--sx-color-primary` es **relleno** (fondo del login-button) y
`--sx-color-primary-ink` es **tinta** (iniciales del avatar, anillos de foco). Por defecto la tinta
hereda el relleno, que es lo correcto para una marca oscura; con una clara hay que separarlas o las
iniciales del avatar quedan ilegibles:

```css
sx-user-menu {
  --sx-color-primary: #07b1ae;      /* relleno: el teal de marca */
  --sx-color-primary-ink: #046b69;  /* tinta: el mismo teal, legible sobre claro */
}
```

`--sx-z-panel` (default `100`) controla el `z-index` del panel desplegable de `<sx-user-menu>`
(`part='panel'`). El shadow root no crea su propio stacking context, así que el panel compite en
el del *host* page -si la app que integra tiene un modal, dropdown u otro elemento posicionado
con un `z-index` mayor a 100, hay que subir esta variable:

```css
sx-user-menu {
  --sx-z-panel: 250;
}
```

**Atención**: si algún ancestro del componente en la app que integra tiene `transform`, `filter`
u `opacity` (distinto de `1`), ese ancestro crea su *propio* stacking context y atrapa al panel
adentro -ninguna variable CSS puede hacer que el panel "escape" de ese contexto y pinte por
encima de contenido fuera de él-. En ese caso, la solución está del lado del host: sacar la
propiedad que crea el stacking context, o mover el ancestro fuera del árbol que compite.

### Por framework

- **React 19** pasa props y listeners a Custom Elements sin ceremonia adicional; `client={sx}` y
  `onClick` funcionan como en cualquier otro elemento.
- **Vue 3** necesita declarar los tags como custom elements para que el compilador no intente
  resolverlos como componentes:
  ```ts
  // vite.config.ts
  vue({ template: { compilerOptions: { isCustomElement: (tag) => tag.startsWith('sx-') } } })
  ```
- **Angular** necesita `CUSTOM_ELEMENTS_SCHEMA` en el módulo (o componente standalone) donde se usen
  los tags.

`registerSolvorxElements()` no se ejecuta sola al importar el paquete -es `sideEffects: false`, y
`customElements` no existe en un render de servidor-. Llamala una vez del lado del navegador
(un `useEffect` vacío, un `onMounted`, o el entrypoint del cliente) antes de montar markup con esos
tags.

---

## El logout ya no depende de la cookie

`logout()` hace dos llamadas, y el orden importa:

1. `POST /v1/public/oauth/logout` con el access token en `Authorization: Bearer` revoca la
   `SsoSession` del navegador y cascadea a **todas** las sesiones de proyecto que nacieron de ese
   login -el "un solo logout cierra todas las apps".
2. `POST /v1/public/oauth/revoke` con el mismo access token cierra la sesión de proyecto de esta app.
   Con `scope: 'everywhere'` la cascada del paso 1 ya la cerró y esto es idempotente; con
   `scope: 'here'` es lo único que la cierra. Va segundo porque revocar antes dejaría al paso 1 sin
   con qué identificarse.

**Esto reemplaza al `fetch` con `credentials: 'include'` que hacía el paso 1.** Aquella versión
dependía de que la cookie `sx_sso` viajara, y es `SameSite=Lax`: un `fetch` cross-site no la manda.
Solo funcionaba para apps que compartieran *site* con el Authorization Server, y fallaba en silencio
en el resto -la persona "cerraba sesión" y al volver `/authorize` la reautenticaba sin pedirle nada.
El access token resuelve eso: la sesión sale de él, no de la cookie.

`createSolvorxBffClient()` **no llama a este endpoint**: postea `{ scope }` a tu `logoutUrl` y tu BFF
hace el paso 1 server-to-server con el access token que ya tiene guardado. En el navegador de una app
con BFF no hay access token, así que es el único lugar donde puede hacerse bien.

## Limitación conocida: sincronización entre pestañas

Dentro de la misma app, `<sx-user-menu>` y `sx.subscribe()` en todas las pestañas abiertas se enteran
al instante de un logout -vía `BroadcastChannel`, mismo origen. Lo que **no** hay es un aviso
instantáneo de que **otra app** de SolvorX cerró sesión: esa pestaña se entera recién cuando falla
su próximo refresh (a los ≤ 600 s del access token) o al recargar. Un canal push (SSE) del lado del
backend es lo que cerraría esa ventana, y no está en este paquete.

---

## Fuera de alcance

- **Multi-cuenta.** SXMS impone hoy una cuenta por navegador. La API no se cierra para esto: un
  futuro `listUser()` / `changeAccount()` y el botón correspondiente en `<sx-user-menu>` entran sin
  romper lo que ya existe.
- App demo. `playground/` no es eso: es JS plano sin bundler para verificar el paquete contra SXMS
  real (ver "Probar contra el stack local" más abajo), no viaja en el tarball de npm, y no es un
  ejemplo de integración pensado para copiar.
- Cualquier cambio a `sx-management-service` o a las otras apps del monorepo.

---

## Desarrollo

```bash
pnpm install
pnpm test        # vitest
pnpm lint        # oxlint
pnpm check:types # tsc --noEmit
pnpm build       # tsup → dist/ (ESM + CJS + .d.ts)
```

### Probar contra el stack local

No hace falta registrar un cliente OAuth nuevo: el seed de `sx-management-service` ya trae
`sx-console-web`, público con PKCE y `redirect_uri = http://localhost:3002/callback`. `pnpm playground`
sirve `playground/` en ese puerto -fijo, no configurable, porque la `redirect_uri` seedeada lo es- con
fallback tipo SPA, así que `/callback` no da 404 como daría con un server estático común.

```bash
cd sx-management-service && docker compose up -d && pnpm db:migrate && pnpm db:seed && pnpm start:dev
cd ../sx-identity-web && pnpm dev
cd ../sx-tool-web && pnpm playground:build   # build + server en :3002
```

Con SXMS en `:9000`, identity-web en `:3000` y el playground en `:3002`, recorrido a validar
manualmente (la config de `issuer`/`clientId`/`redirectUri` es editable desde la propia página):

1. Click en `<sx-login-button>` → redirect a `/authorize` → login en identity-web → vuelta a
   `/callback` → `init()` canjea y la URL queda limpia.
2. `<sx-user-menu>` muestra foto, nombre, email y username reales.
3. Recargar la página **no** redirige: rehidrata del refresh token guardado.
4. Abrir 6 pestañas: `GET /v1/bff-account/session` sigue mostrando una sola sesión.
5. Concurrencia del refresh -tres garantías distintas, no una sola:

   | Escenario | Garantía real |
   |---|---|
   | Dos `getAccessToken()` concurrentes **en la misma pestaña** (botón "3× getAccessToken()" del playground, con el cliente efímero que arranca `current` en `null`) | Exactamente un POST a `/token` |
   | Dos pestañas recién cargadas a la vez, ambas con el access token vencido | POSTs **serializados**, nunca solapados; cada uno con un refresh token vigente en su momento; **la sesión sobrevive** -no es un único POST, y está bien que sean dos: el lock de `navigator.locks` sirve dentro del origen, no hace que dos pestañas compartan el caché en memoria de la otra- |
   | Pestaña ya abierta cuando otra renueva | Recibe el token por `BroadcastChannel` (`access-token-updated` en el log del playground) y no pide uno propio |

   La lectura equivocada sería esperar "un solo POST" en el segundo caso: el lock evita que un
   refresh token rotado se reuse (`REUSE_ATTACK`), no que dos pestañas nunca llamen a `/token` cada
   una. Ver el comentario de [refresh.ts](src/session/refresh.ts).
6. `logout()` → sin sesiones activas; recargar manda al login.

**Nota sobre el logout en este entorno local:** el playground (`localhost:3002`) y SXMS
(`localhost:9000`) son same-site entre sí -`SameSite` se evalúa por *site* y el puerto no cuenta-,
así que acá la vieja vía de la cookie funcionaba y la de ahora también. Es justamente por eso que
este entorno **nunca mostró** el bug que motivó el cambio: hacía falta un host que no compartiera
site con SXMS, como `<org>.account.localhost:3001` contra `localhost:9000`.
