# JavaScript Single Page Application and Ubisecure SSO

## Code review

This project is hosted in a ASP.NET Core Web Application.
However this project consist of static files and only the web server function of ASP.NET is used, there is no server-side logic. 
This project also runs as-is on Apache HTTP server or any other web server that serves static resources.

This application is implemented in a single html page [spa.html](wwwroot/spa.html) with a dependency on jQuery from code.jquery.com/jquery-3.3.1.js.

The code for the API invoked by this application is in [SimpleAPI](../../../SimpleAPI)

### Get provider metadata

This method fetches the OpenID Provider metadata configuration information. The method returns a Promise that receives a Json object. The issuer parameter is the name of the OpenID Provider. 

```javascript
    function getConfiguration(issuer) {
        return fetch(issuer + "/.well-known/openid-configuration")
            .then(response => response.ok
                ? response.json()
                : Promise.reject(response)
            );
    }
```

Example

```javascript
getConfiguration("https://login.example.ubidemo.com/uas")
    .then(config => { ... });
```

### Send authentication request

This method builds an OpenID Connect authentication request and redirects the web browser to the OpenID Provider. 
The code also creates a random nonce and stores a copy in local storage.

```javascript
    function sendAuthenticationRequest(configuration, client_id, scope) {
        var authorization_request = configuration.authorization_endpoint;
        authorization_request += "?response_type=code";
        authorization_request += "&scope=" + encodeURIComponent(scope);
        authorization_request += "&client_id=" + encodeURIComponent(client_id);
        authorization_request += "&redirect_uri=" + encodeURIComponent(location.origin + location.pathname);
        if (location.hash.startsWith("#/")) {
            var state = location.hash.substr(1);
            authorization_request += "&state=" + encodeURIComponent(state);
        }
        var nonce = Array.from(window.crypto.getRandomValues(new Uint32Array(4)), t => t.toString(36)).join("");
        authorization_request += "&nonce=" + encodeURIComponent(nonce);
        window.localStorage.setItem("nonce", nonce);
        location.assign(authorization_request);
    }
```

Example

```javascript
getConfiguration("https://login.example.ubidemo.com/uas")
    .then(config => sendAuthenticationRequest(config, "public", "openid"));
```

### Receive authorization code

The following copies query string part from page uri into fragment part. This is needed if the OpenID Provider does not support fragment response mode. 

```javascript
    document.addEventListener("DOMContentLoaded", function () {
        if (location.search.startsWith("?")) {
            location.replace(location.pathname + "#" + location.search.substr(1));
        }
    });
```

Here we look for an authorization code in the fragment part of the page uri. If a code is found then a token request is invoked. 

The OpenID Provider replies with an access token and an id token.
The code validates id token integrity and then sets access token and id token into javascript variables. 

The final step resets the fragment part of the page uri. This does not trigger a page load, but triggers the hashchange event. If a page load was triggered then the javascript variables would be lost.

```javascript
    document.addEventListener("DOMContentLoaded", function () {
        matchParam(location.hash, "code")
            .then(code => getConfiguration(issuer)
                .then(config => invokeTokenRequest(config, "public", "public", code)
                    .then(response => getJWKS(config)
                        .then(jwks => decodeJWT(jwks, response.id_token))
                        .then(jwt => {
                            access_token = response.access_token;
                            id_token_jwt = jwt;
                            matchParam(location.hash, "state", state => (state != null) && state.startsWith("/") ? state : "")
                                .then(state => location.hash = state);
                        })
                    )
                )
            );
    });            
```

### Invoke token request

The following builds and invokes an OAuth authorization code grant token request.

```javascript
    function invokeTokenRequest(configuration, client_id, client_secret, code) {
        var token_endpoint = configuration.token_endpoint;
        var headers = { "Content-Type": "application/x-www-form-urlencoded" };
        var body = "grant_type=authorization_code";
        body += "&code=" + encodeURIComponent(code);
        body += "&client_id=" + encodeURIComponent(client_id);
        body += "&client_secret=" + encodeURIComponent(client_secret);
        body += "&redirect_uri=" + encodeURIComponent(location.origin + location.pathname);
        return fetch(token_endpoint, { mode: "cors", cache: "no-store", method: "POST", headers: headers, body: body })
            .then(response => response.ok
                ? response.json()
                : Promise.reject(response)
            );
    }
```

### Get provider keys

The OpenID Provider's public keys are found in a JWKS document found from address specified by jwks_uri metadata property.

```javascript
    function getJWKS(config) {
        var jwks_uri = config.jwks_uri;
        return fetch(jwks_uri)
            .then(response => response.ok
                ? response.json()
                : Promise.reject(response)
            );
    }
```

Example

```javascript
getConfiguration("https://login.example.ubidemo.com/uas")
    .then(config => getJWKS(config))
    .then(jwks => { ... });
```

### Validate ID Token integrity

ID Token is formatted as JWT, with three base64url encoded segments separated by "." character. The first part contains header, second part contains claims and final part is the signature which covers the first and second part.
The WebCrypto API works with ```Uint8Array``` types so some type conversion with ```Uint8Array.from``` is needed.


```javascript
    function decodeJWT(jwks, jwt) {

        var jws = jwt.split(".");

        var header = atobUrlSafe(jws[0]);
        header = JSON.parse(header);

        var claims = atobUrlSafe(jws[1]);
        claims = JSON.parse(claims);

        var text2verify = Uint8Array.from(jws[0] + "." + jws[1], t => t.charCodeAt(0));

        var signature = atobUrlSafe(jws[2]);
        signature = Uint8Array.from(signature, t => t.charCodeAt(0));
        
        ...
```

Each signing key from OpenID Provider's jwks document is converted into WebCrypto Key with ```window.crypto.subtle.importKey```.
Then signature verification is attempted with ```window.crypto.subtle.verify```.

Apparently there are some interoperability issues with JWK formatted keys and WebCrypto API which requires some transformation.
One would assume algorithm and key identifiers of JWK, JWS and WebCrypto would be compatible but that appear to not be the case. 
In the example below I have hard coded RS256 algorithm. A real world solution needs to map JWK and JWS identifiers into WebCrypto identifiers.

```javascript
        ...

        var keys = jwks.keys
            .filter(isSig)
            .map(toJwk);

        return new Promise(resolve => {
            for (var i in keys) {
                var jwk = keys[i];
                var RS256 = {
                    name: "RSASSA-PKCS1-v1_5",
                    hash: { name: "SHA-256" },
                };
                window.crypto.subtle.importKey("jwk", jwk, RS256, false, ["verify"])
                    .then(key => window.crypto.subtle.verify(RS256, key, signature, text2verify))
                    .then(result => {
                        if (result) {
                            resolve(...);
                        }
                    });
            }
        });
```

### Invoke OAuth protected API

When invoking an OAuth protected API the access token is put into the Authorization http request header with the Bearer scheme.

```javascript
    function invokeApi(access_token) {
        var headers = (access_token != null)
            ? { "Authorization": "Bearer " + access_token }
            : {};
        return fetch(api_endpoint, { mode: "cors", cache: "no-store", headers: headers })
            .then(response => response.ok
                ? response.json()
                : Promise.reject(response)
            );
    }
```

## Running the application

### With ASP.NET Core

1. Clone this repository
1. Install ASP.NET Core runtime from https://www.microsoft.com/net/download
1. Use `dotnet run` command run ASP.NET Core server
1. Navigate to http://localhost:5000/spa.html

### With Apache HTTP server

1. Clone this repository
1. Install Apache HTTP server
1. Use `./run-apache.sh` on Linux or `run-apache.cmd` on Windows to start Apache HTTP server
1. Navigate to http://localhost:5000/spa.html
