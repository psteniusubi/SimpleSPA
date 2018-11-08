# JavaScript Single Page Application and Ubisecure SSO

## Code review

This project is hosted in a ASP.NET Core Web Application.
However this project consist of static files and only the web server function of ASP.NET is used, there is no server-side logic. 
This project also runs as-is on Apache HTTP server or any other web server that serves static resources.

The code for the API invoked by this application is in [SimpleAPI](../../../SimpleAPI)

The relevant file is 

* [spa.html](wwwroot/spa.html)

### Get provider metadata

This method fetches the OpenID Provider metadata configuration information. The method returns a Promise that receives a Json object. The issuer parameter is the name of the OpenID Provider. 

```javascript
    function getConfiguration(issuer) {
        return fetch(issuer + "/.well-known/openid-configuration")
            .then(function (response) {
                return response.ok
                    ? response.json()
                    : Promise.reject(response);
            });
    }
```

Example

```javascript
getConfiguration("https://login.example.ubidemo.com/uas")
```

### Send authentication request

This method builds an OpenID Connect authentication request and redirects the web browser to the OpenID Provider.

```javascript
    function sendAuthenticationRequest(configuration, client_id, scope) {
        var authorization_request = configuration.authorization_endpoint;
        authorization_request += "?response_type=code";
        authorization_request += "&scope=" + encodeURIComponent(scope);
        authorization_request += "&client_id=" + encodeURIComponent(client_id);
        authorization_request += "&redirect_uri=" + encodeURIComponent(location.origin + "/spa.html");
        if (location.hash.startsWith("#/")) {
            var state = location.hash.substr(1);
            authorization_request += "&state=" + encodeURIComponent(state);
        }
        var nonce = Array.from(window.crypto.getRandomValues(new Uint32Array(4)), t => t.toString(36)).join("");
        authorization_request += "&nonce=" + encodeURIComponent(nonce);
        window.sessionStorage.setItem("nonce", nonce);
        location = authorization_request;
    }
```

Example

```javascript
getConfiguration("https://login.example.ubidemo.com/uas")
    .then(config => sendAuthenticationRequest(config, "public", "openid"));
```

### Receive authorization code

This code copies query string part from page uri into fragment part. This is needed if the OpenID Provider does not support fragment response mode. 

```javascript
    document.addEventListener("DOMContentLoaded", function () {
        if (location.search.match(/^\?(.*)$/)) {
            location.replace("/spa.html#" + RegExp.$1);
        }
    });
```

This code looks for an authorization code in the fragment part of the page uri. If a code is found then a token request is invoked and the returned access token and id token are set into javascript variables. The final step resets the fragment part of the page uri. This does not trigger a page load, but triggers the hashchange event.

```javascript
    document.addEventListener("DOMContentLoaded", function () {
        if (location.hash.match(/(^|#|&)code=([^&]*)($|&)/)) {
            var code = RegExp.$2;
            getConfiguration(issuer)
                .then(config => invokeTokenRequest(config, "public", "public", code))
                .then(function (response) {
                    var state = "";
                    if (location.hash.match(/(^|#|&)state=([^&]*)($|&)/)) {
                        var t = decodeURIComponent(RegExp.$2);
                        if (t.startsWith("/")) {
                            state = t;
                        }
                    }
                    access_token = response.access_token;
                    id_token = response.id_token;
                    location.hash = state;
                });
        }
    });
```

### Invoke token request

```javascript
    function invokeTokenRequest(configuration, client_id, client_secret, code) {
        var token_endpoint = configuration.token_endpoint;
        var headers = { "Content-Type": "application/x-www-form-urlencoded" };
        var body = "grant_type=authorization_code";
        body += "&code=" + encodeURIComponent(code);
        body += "&client_id=" + encodeURIComponent(client_id);
        body += "&client_secret=" + encodeURIComponent(client_secret);
        body += "&redirect_uri=" + encodeURIComponent(location.origin + "/spa.html");
        return fetch(token_endpoint, { mode: "cors", cache: "no-store", method: "POST", headers: headers, body: body })
            .then(function (response) {
                return response.ok
                    ? response.json()
                    : Promise.reject(response);
            })
            .then(function (response) {
                return Promise.resolve(response);
            })
            .catch(function (error) {
                return Promise.reject(error);
            });
    }
```

### Validate ID Token integrity

```javascript
// TODO
```

### Invoke OAuth protected API

```javascript
    function invokeApi(access_token) {
        var headers = (access_token != null)
            ? { "Authorization": "Bearer " + access_token }
            : {};
        return fetch(api_endpoint, { mode: "cors", cache: "no-store", headers: headers })
            .then(function (response) {
                return response.ok
                    ? response.json()
                    : Promise.reject(response);
            });
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
