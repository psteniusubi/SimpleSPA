# JavaScript Single Page Application and Ubisecure SSO

Example of a JavaScript Single Page Application that uses OpenID Connect 1.0 for logon and then invokes an OAuth 2.0 protected API.

The code for the API invoked by this application is in [SimpleAPI](https://github.com/psteniusubi/SimpleAPI)

See also my related blog article [Ubisecure SSO and Single Page Applications](https://www.ubisecure.com/single-sign-on/single-page-application-and-openid-connect/).

## Code review

This project is hosted on GitHub Pages [here](https://psteniusubi.github.io/SimpleSPA/spa.html). It also runs as-is on Apache HTTP server or any other web server that serves static resources.

This application is implemented in a single html page [spa.html](docs/spa.html).

### Get provider metadata

This method fetches the OpenID Provider metadata configuration information. The issuer parameter is the name of the OpenID Provider. 

```javascript
        async function getConfiguration(issuer) {
            const uri = `${issuer}/.well-known/openid-configuration`;
            const response = await fetch(uri);
            if (!response.ok) throw { error: "http_error", response: response };
            return await response.json();
        }
```

### Send authentication request

This method builds an OpenID Connect authentication request and redirects the web browser to the OpenID Provider. 

The code also creates a random nonce and PKCE code verifier. These items are stored in local storage with `window.localStorage.setItem`. 

Generating PKCE code verifier

```javascript
        async function newCodeVerifier(method) {
            switch (method) {
                case "plain":
                case "S256":
                    return btoaUrlSafe(Array.from(window.crypto.getRandomValues(new Uint8Array(32)), t => String.fromCharCode(t)).join(""))
                case "":
                case null:
                    return null;
                default:
                    throw "invalid argument";
            }
        }
```

PKCE code challenge

```javascript
        async function getCodeChallenge(method, code_verifier) {
            switch (method) {
                case "plain":
                    if (code_verifier === null) throw "invalid argument";
                    return code_verifier;
                case "S256":
                    if (code_verifier === null) throw "invalid argument";
                    let bytes = Uint8Array.from(code_verifier, t => t.charCodeAt(0));
                    bytes = await window.crypto.subtle.digest("SHA-256", bytes);
                    return btoaUrlSafe(Array.from(new Uint8Array(bytes), t => String.fromCharCode(t)).join(""));
                case "":
                case null:
                    return null;
                default:
                    throw "invalid argument";
            }
        }
```

Authentication request

```javascript
        async function sendAuthenticationRequest(configuration, client_id, scope) {
            const authorization_request = new URL(configuration.authorization_endpoint);
            authorization_request.searchParams.set("response_type", "code");
            authorization_request.searchParams.set("scope", scope);
            authorization_request.searchParams.set("client_id", client_id);
            authorization_request.searchParams.set("redirect_uri", location.origin + location.pathname);
            // nonce
            const nonce = Array.from(window.crypto.getRandomValues(new Uint32Array(4)), t => t.toString(36)).join("");
            authorization_request.searchParams.set("nonce", nonce);
            window.localStorage.setItem("/SimpleSPA#nonce", nonce);
            // code_challenge_method
            const code_challenge_method = "S256";
            authorization_request.searchParams.set("code_challenge_method", code_challenge_method);
            // code_verifier
            const code_verifier = await newCodeVerifier(code_challenge_method);
            window.localStorage.setItem("/SimpleSPA#code_verifier", code_verifier);
            // code_challenge
            const code_challenge = await getCodeChallenge(code_challenge_method, code_verifier);
            authorization_request.searchParams.set("code_challenge", code_challenge);
            location.assign(authorization_request);
        }
```

### Handle authorization response

The OpenID Provider redirects user agent back with authorization response message, containing either `code` or `error` parameters.

This code looks for code or error url parameters, then uses `window.history.replaceState` to remove url parameters from history. 

If a code parameter is present then a token request is issued.

```javascript
        async function handleAuthenticationResponse() {
            const params = new URLSearchParams(location.search.substr(1));
            if (params.has("code")) {
                window.history.replaceState(null, null, location.pathname);
                const config = await getConfiguration(registration.issuer);
                const tokenResponse = await invokeTokenRequest(config, registration.client_id, registration.client_secret, params.get("code"));
                if ("id_token" in tokenResponse) {
                    const jwks = await getJWKS(config);
                    const id_token = await decodeJWT(jwks, tokenResponse.id_token);
                    const signature_status = (id_token.signature === true) ? "signature verified" : "invalid signature";
                    document.getElementById("signature").innerText = `(${signature_status})`;
                    set_value("id_token", JSON.stringify(id_token.claims, null, 2));
                    const nonce_status = (id_token.claims.nonce == localStorage.getItem("/SimpleSPA#nonce")) ? "nonce verified" : "invalid nonce";
                    document.getElementById("nonce").innerText = `(${nonce_status})`;
                    localStorage.removeItem("/SimpleSPA#nonce");
                }
                if ("access_token" in tokenResponse) {
                    fetchWithToken = (input, init) => {
                        var request = new Request(input, init);
                        request.headers.set("Authorization", "Bearer " + tokenResponse.access_token);
                        return window.fetch(request);
                    };
                } else {
                    fetchWithToken = null;
                }
                return;
            }
            if (params.has("error")) {
                set_value("id_token", `error=${params.get("error")}`);
            }
        }
```

### Invoke token request

The following builds and invokes an OAuth authorization code grant token request.

```javascript
        async function invokeTokenRequest(configuration, client_id, client_secret, code) {
            const token_endpoint = configuration.token_endpoint;
            const headers = { "Content-Type": "application/x-www-form-urlencoded" };
            const body = new URLSearchParams();
            body.set("grant_type", "authorization_code");
            body.set("code", code);
            body.set("client_id", client_id);
            body.set("client_secret", client_secret);
            body.set("redirect_uri", location.origin + location.pathname);
            const code_verifier = window.localStorage.getItem("/SimpleSPA#code_verifier");
            if (code_verifier) {
                body.set("code_verifier", code_verifier);
            }
            try {
                const response = await fetch(token_endpoint, { method: "POST", mode: "cors", headers: headers, body: body.toString() });
                if (!response.ok) throw { error: "http_error", response: response };
                return await response.json();
            } finally {
                window.localStorage.removeItem("/SimpleSPA#code_verifier");
            }
        }
```

### Get provider keys

The OpenID Provider's public keys are found in a JWKS document found from address specified by `jwks_uri` metadata property.

```javascript
        async function getJWKS(config) {
            const uri = config.jwks_uri;
            const response = await fetch(uri);
            if (!response.ok) throw { error: "http_error", response: response };
            return await response.json();
        }
```

### Validate ID Token integrity

ID Token is formatted as JWT, with three base64url encoded segments separated by "." character. The first part contains header, second part contains claims and final part is the signature which covers the first and second part.
The WebCrypto API works with `Uint8Array` types so some type conversion with `Uint8Array.from` is needed.

```javascript
        async function decodeJWT(jwks, jwt) {

            const jws = jwt.split(".");
            const header = JSON.parse(atobUrlSafe(jws[0]));
            const claims = JSON.parse(atobUrlSafe(jws[1]));
            const text2verify = Uint8Array.from(jws[0] + "." + jws[1], t => t.charCodeAt(0));
            const signature = Uint8Array.from(atobUrlSafe(jws[2]), t => t.charCodeAt(0));
```

Each signing key from OpenID Provider's jwks document is converted into WebCrypto Key with `window.crypto.subtle.importKey`.
Then signature verification is attempted with `window.crypto.subtle.verify`.

Apparently there are some interoperability issues with JWK formatted keys and WebCrypto API which requires some transformation.
One would assume algorithm and key identifiers of JWK, JWS and WebCrypto would be compatible but that appear to not be the case. 
In the example below I have hard coded RS256 algorithm. A real world solution needs to map JWK and JWS identifiers into WebCrypto identifiers.

```javascript
            const keys = jwks.keys
                .filter(isSig)
                .map(toJwk);

            const RS256 = {
                name: "RSASSA-PKCS1-v1_5",
                hash: { name: "SHA-256" },
            };

            for (const jwk of keys) {
                try {
                    const key = await window.crypto.subtle.importKey("jwk", jwk, RS256, false, ["verify"]);
                    const result = await window.crypto.subtle.verify(RS256, key, signature, text2verify);
                    if (result === true) {
                        return {
                            "header": header,
                            "claims": claims,
                            "signature": true,
                            "jwk": jwk,
                        };
                    }
                } catch {
                    // ignore
                }
            }
            
            return negative;
        }
```

### Invoke OAuth protected API

When invoking an OAuth protected API the access token is put into the Authorization http request header with the Bearer scheme.

```javascript
                    fetchWithToken = (input, init) => {
                        var request = new Request(input, init);
                        request.headers.set("Authorization", "Bearer " + tokenResponse.access_token);
                        return window.fetch(request);
                    };
```

```javascript
        async function invokeApi() {
            const _fetch = fetchWithToken || window.fetch;
            const response = await _fetch(api_endpoint, { mode: "cors", cache: "no-store" });
            if (!response.ok) throw { error: "http_error", response: response };
            return await response.json();
        }
```

## Running the application

This application is ready to run with Ubisecure SSO at login.example.ubidemo.com.

### With GitHub Pages

1. Navigate to https://psteniusubi.github.io/SimpleSPA/spa.html

